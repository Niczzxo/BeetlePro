import {
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { money, type Payment } from '@dostelo/types';
import {
  createTestContext,
  findVariant,
  type TestContext,
} from '../../testing/test-context';

const BKASH_SECRET = 'test-webhook-secret';
const SSL_PASSWORD = 'test-store-password';

const ENV_KEYS = [
  'BKASH_WEBHOOK_SECRET',
  'SSLCOMMERZ_STORE_ID',
  'SSLCOMMERZ_STORE_PASSWORD',
] as const;

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

/** A real order (placed as COD) to hang gateway payment fixtures
 * on, so order paymentStatus sync has something to update. */
async function placeCodOrder(ctx: TestContext) {
  const customer = await ctx.customers.register({
    fullName: 'Webhook Buyer',
    email: `webhook-${Math.random().toString(36).slice(2)}@example.com`,
    phone: `017${Math.floor(10000000 + Math.random() * 89999999)}`,
    password: 'password123',
  });
  const { variant } = await findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
  return ctx.checkout.placeOrder({
    customerId: customer.id,
    lines: [
      { productId: 'sneakers-court', variantId: variant.id, quantity: 1 },
    ],
    address: {
      fullName: 'Webhook Buyer',
      phone: '01712345678',
      addressLine: 'House 5, Road 2, Mirpur 10',
      city: 'Dhaka',
      district: 'Dhaka',
    },
    paymentMethod: 'cod',
  });
}

async function gatewayPaymentFixture(
  ctx: TestContext,
  overrides: Partial<Payment>,
): Promise<Payment> {
  const now = new Date().toISOString();
  return ctx.paymentsRepo.create({
    id: overrides.id ?? `pay-${Math.random().toString(36).slice(2)}`,
    orderId: overrides.orderId ?? 'order-fixture',
    gateway: 'bkash',
    channel: 'gateway',
    status: 'initiated',
    amount: money(186000),
    providerTxnId: null,
    senderNumber: null,
    customerTxnId: null,
    instructions: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function bkashSignature(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

describe('bKash webhooks', () => {
  it('applies a verified Completed delivery once; the redelivery is a no-op duplicate', async () => {
    process.env.BKASH_WEBHOOK_SECRET = BKASH_SECRET;
    const ctx = createTestContext();
    const order = await placeCodOrder(ctx);
    const payment = await gatewayPaymentFixture(ctx, {
      orderId: order.id,
      providerTxnId: 'BKASH-PAY-1',
    });
    const payload = {
      paymentID: 'BKASH-PAY-1',
      trxID: 'TRX-100',
      status: 'Completed',
      amount: '1860.00',
    };
    const rawBody = JSON.stringify(payload);
    const signature = bkashSignature(rawBody, BKASH_SECRET);

    const first = await ctx.webhooks.handle('bkash', payload, signature, rawBody);
    expect(first).toMatchObject({
      received: true,
      duplicate: false,
      applied: true,
      paymentId: payment.id,
    });
    const applied = await ctx.paymentsRepo.findById(payment.id);
    expect(applied?.status).toBe('successful');
    expect(applied?.providerTxnId).toBe('TRX-100');
    expect((await ctx.orders.findById(order.id))?.paymentStatus).toBe('successful');
    const eventsAfterFirst = (await ctx.paymentsRepo.listEvents(payment.id)).length;

    const second = await ctx.webhooks.handle('bkash', payload, signature, rawBody);
    expect(second).toMatchObject({
      received: true,
      duplicate: true,
      applied: false,
      paymentId: payment.id,
    });
    // Nothing was applied twice.
    expect(await ctx.paymentsRepo.listEvents(payment.id)).toHaveLength(
      eventsAfterFirst,
    );
    expect(ctx.db.webhookEvents.size).toBe(1);
  });

  it('rejects a bad signature and records nothing', async () => {
    process.env.BKASH_WEBHOOK_SECRET = BKASH_SECRET;
    const ctx = createTestContext();
    const payment = await gatewayPaymentFixture(ctx, {
      providerTxnId: 'BKASH-PAY-2',
    });
    const payload = {
      paymentID: 'BKASH-PAY-2',
      trxID: 'TRX-200',
      status: 'Completed',
    };
    const rawBody = JSON.stringify(payload);
    await expect(
      ctx.webhooks.handle('bkash', payload, 'deadbeef', rawBody),
    ).rejects.toThrow(UnauthorizedException);
    expect((await ctx.paymentsRepo.findById(payment.id))?.status).toBe('initiated');
    expect(ctx.db.webhookEvents.size).toBe(0);
  });

  it('rejects deliveries when no webhook secret is configured', async () => {
    const ctx = createTestContext();
    const payload = {
      paymentID: 'BKASH-PAY-3',
      trxID: 'TRX-300',
      status: 'Completed',
    };
    const rawBody = JSON.stringify(payload);
    await expect(
      ctx.webhooks.handle(
        'bkash',
        payload,
        bkashSignature(rawBody, BKASH_SECRET),
        rawBody,
      ),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(ctx.db.webhookEvents.size).toBe(0);
  });
});

describe('SSLCommerz webhooks', () => {
  function sslPayload(paymentId: string) {
    const fields: Record<string, string> = {
      tran_id: paymentId,
      status: 'VALID',
      val_id: 'VAL-900',
      amount: '1860.00',
    };
    const verifyKey = 'tran_id,status,val_id,amount';
    const passwordHash = createHash('md5').update(SSL_PASSWORD).digest('hex');
    const signed = verifyKey
      .split(',')
      .map((field) => fields[field])
      .join('');
    const verifySign = createHash('md5')
      .update(signed + passwordHash)
      .digest('hex');
    return { ...fields, verify_key: verifyKey, verify_sign: verifySign };
  }

  it('verifies the IPN signature, applies paid, and dedupes the redelivery', async () => {
    process.env.SSLCOMMERZ_STORE_PASSWORD = SSL_PASSWORD;
    const ctx = createTestContext();
    const order = await placeCodOrder(ctx);
    const payment = await gatewayPaymentFixture(ctx, {
      id: 'pay-ssl-1',
      orderId: order.id,
      gateway: 'sslcommerz',
    });
    const payload = sslPayload(payment.id);

    const first = await ctx.webhooks.handle('sslcommerz', payload, undefined, undefined);
    expect(first).toMatchObject({ duplicate: false, applied: true });
    const applied = await ctx.paymentsRepo.findById(payment.id);
    expect(applied?.status).toBe('successful');
    expect(applied?.providerTxnId).toBe('VAL-900');

    const second = await ctx.webhooks.handle(
      'sslcommerz',
      payload,
      undefined,
      undefined,
    );
    expect(second).toMatchObject({ duplicate: true, applied: false });
  });

  it('rejects an IPN with a tampered signature', async () => {
    process.env.SSLCOMMERZ_STORE_PASSWORD = SSL_PASSWORD;
    const ctx = createTestContext();
    const payment = await gatewayPaymentFixture(ctx, {
      id: 'pay-ssl-2',
      gateway: 'sslcommerz',
    });
    const payload = { ...sslPayload(payment.id), verify_sign: 'f'.repeat(32) };
    await expect(
      ctx.webhooks.handle('sslcommerz', payload, undefined, undefined),
    ).rejects.toThrow(UnauthorizedException);
    expect((await ctx.paymentsRepo.findById(payment.id))?.status).toBe('initiated');
  });
});

describe('Webhook endpoints that do not exist', () => {
  it('404s for cod and the manual methods', async () => {
    const ctx = createTestContext();
    await expect(ctx.webhooks.handle('cod', {}, undefined, undefined)).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      ctx.webhooks.handle('nagad', {}, undefined, undefined),
    ).rejects.toThrow(NotFoundException);
    await expect(
      ctx.webhooks.handle('rocket', {}, undefined, undefined),
    ).rejects.toThrow(NotFoundException);
  });
});
