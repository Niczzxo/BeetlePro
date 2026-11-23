import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { money, type OrderStatus } from '@dostelo/types';
import type { CheckoutRequest } from '@dostelo/validation';
import {
  createTestContext,
  findVariant,
  type TestContext,
} from '../../testing/test-context';

const DHAKA_ADDRESS = {
  fullName: 'Test Buyer',
  phone: '01712345678',
  addressLine: 'House 5, Road 2, Mirpur 10',
  city: 'Dhaka',
  district: 'Dhaka',
};

const GATEWAY_ENV_KEYS = [
  'SSLCOMMERZ_STORE_ID',
  'SSLCOMMERZ_STORE_PASSWORD',
  'BKASH_APP_KEY',
  'BKASH_APP_SECRET',
  'BKASH_USERNAME',
  'BKASH_PASSWORD',
  'PAYMENTS_BKASH_MODE',
] as const;

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of GATEWAY_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of GATEWAY_ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

function requestFor(
  ctx: TestContext,
  overrides: Partial<CheckoutRequest> = {},
): CheckoutRequest {
  const { variant } = findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
  return {
    lines: [
      {
        productId: 'sneakers-court',
        variantId: variant.id,
        quantity: 1,
      },
    ],
    address: DHAKA_ADDRESS,
    paymentMethod: 'cod',
    ...overrides,
  };
}

async function placeOrder(
  ctx: TestContext,
  overrides: Partial<CheckoutRequest> = {},
) {
  const customer = await ctx.customers.register({
    fullName: 'Payment Buyer',
    email: `buyer-${Math.random().toString(36).slice(2)}@example.com`,
    phone: `017${Math.floor(10000000 + Math.random() * 89999999)}`,
    password: 'password123',
  });
  const order = ctx.checkout.placeOrder(
    requestFor(ctx, { customerId: customer.id, ...overrides }),
  );
  const payment = ctx.paymentsRepo.listByOrder(order.id).at(-1);
  if (!payment) throw new Error('checkout created no payment attempt');
  return { customer, order, payment };
}

function walkTo(ctx: TestContext, orderNumber: string, target: OrderStatus) {
  const path: OrderStatus[] = [
    'confirmed',
    'processing',
    'packed',
    'ready-to-ship',
    'shipped',
    'out-for-delivery',
    'delivered',
  ];
  for (const status of path) {
    ctx.ordersService.transition(orderNumber, { status });
    if (status === target) return;
  }
}

describe('COD payments', () => {
  it('starts as pending-collection and is collected on delivery', async () => {
    const ctx = createTestContext();
    const { order, payment } = await placeOrder(ctx);
    expect(payment.gateway).toBe('cod');
    expect(payment.channel).toBe('cod');
    expect(payment.status).toBe('pending-collection');
    expect(order.paymentStatus).toBe('pending-collection');

    walkTo(ctx, order.orderNumber, 'delivered');

    const after = ctx.paymentsRepo.findById(payment.id);
    expect(after?.status).toBe('collected');
    expect(ctx.orders.findById(order.id)?.paymentStatus).toBe('collected');
    const eventTypes = ctx.paymentsRepo
      .listEvents(payment.id)
      .map((event) => event.type);
    expect(eventTypes).toContain('cod-pending-collection');
    expect(eventTypes).toContain('cod-collected');
  });

  it('is voided when the order is cancelled before delivery', async () => {
    const ctx = createTestContext();
    const { order, payment } = await placeOrder(ctx);
    ctx.ordersService.transition(order.orderNumber, { status: 'cancelled' });
    expect(ctx.paymentsRepo.findById(payment.id)?.status).toBe('cancelled');
    expect(ctx.orders.findById(order.id)?.paymentStatus).toBe('cancelled');
  });

  it('is refunded when a delivered order is returned', async () => {
    const ctx = createTestContext();
    const { order, payment } = await placeOrder(ctx);
    walkTo(ctx, order.orderNumber, 'delivered');
    ctx.ordersService.transition(order.orderNumber, { status: 'returned' });
    expect(ctx.paymentsRepo.findById(payment.id)?.status).toBe('refunded');
  });
});

describe('Manual mobile banking (bkash)', () => {
  it('runs initiate, confirm, verify to successful', async () => {
    const ctx = createTestContext();
    const { order, payment } = await placeOrder(ctx, {
      paymentMethod: 'bkash',
    });
    expect(payment.channel).toBe('manual');
    expect(payment.status).toBe('awaiting-customer');
    expect(payment.instructions?.method).toBe('bkash');
    expect(payment.instructions?.reference).toBe(order.orderNumber);
    expect(payment.instructions?.text).toContain('placeholder');

    const confirmed = ctx.payments.confirmManualPayment(payment.id, {
      senderNumber: '01712345678',
      transactionId: 'TXN12345',
    });
    expect(confirmed.status).toBe('verification-pending');
    expect(confirmed.senderNumber).toBe('01712345678');
    expect(confirmed.customerTxnId).toBe('TXN12345');
    // A customer confirmation alone never marks the payment paid.
    expect(confirmed.providerTxnId).toBeNull();

    const verified = ctx.payments.verifyManualPayment(payment.id, {
      decision: 'paid',
      actorId: 'staff-1',
    });
    expect(verified.status).toBe('successful');
    expect(verified.providerTxnId).toBe('TXN12345');
    expect(ctx.orders.findById(order.id)?.paymentStatus).toBe('successful');
  });

  it('fails the payment when staff reject the confirmation', async () => {
    const ctx = createTestContext();
    const { payment } = await placeOrder(ctx, { paymentMethod: 'bkash' });
    ctx.payments.confirmManualPayment(payment.id, {
      senderNumber: '01712345678',
      transactionId: 'TXN99999',
    });
    const rejected = ctx.payments.verifyManualPayment(payment.id, {
      decision: 'rejected',
      note: 'No such transaction',
    });
    expect(rejected.status).toBe('failed');
  });

  it('refuses to verify a payment that was never confirmed', async () => {
    const ctx = createTestContext();
    const { payment } = await placeOrder(ctx, { paymentMethod: 'nagad' });
    expect(() =>
      ctx.payments.verifyManualPayment(payment.id, { decision: 'paid' }),
    ).toThrow(BadRequestException);
  });
});

describe('Unconfigured gateways', () => {
  it('records a checkout sslcommerz attempt as failed, never paid', async () => {
    const ctx = createTestContext();
    const { order, payment } = await placeOrder(ctx, {
      paymentMethod: 'sslcommerz',
    });
    expect(payment.status).toBe('failed');
    expect(order.paymentStatus).toBe('failed');
    const eventTypes = ctx.paymentsRepo
      .listEvents(payment.id)
      .map((event) => event.type);
    expect(eventTypes).toContain('gateway-not-configured');
    expect(
      ctx.paymentsRepo
        .listByOrder(order.id)
        .some((attempt) => attempt.status === 'successful'),
    ).toBe(false);
  });

  it('refuses initiation with a 503 gateway not configured error', async () => {
    const ctx = createTestContext();
    const { order } = await placeOrder(ctx);
    await expect(
      ctx.payments.initiatePayment({
        orderId: order.id,
        gateway: 'sslcommerz',
      }),
    ).rejects.toThrow(ServiceUnavailableException);
    await expect(
      ctx.payments.initiatePayment({
        orderId: order.id,
        gateway: 'sslcommerz',
      }),
    ).rejects.toThrow(/Gateway not configured/);
    expect(
      ctx.paymentsRepo
        .listByOrder(order.id)
        .some((attempt) => attempt.status === 'successful'),
    ).toBe(false);
  });
});

describe('Refunds', () => {
  it('completes the manual refund flow for a verified manual payment', async () => {
    const ctx = createTestContext();
    const { payment } = await placeOrder(ctx, { paymentMethod: 'bkash' });
    ctx.payments.confirmManualPayment(payment.id, {
      senderNumber: '01712345678',
      transactionId: 'TXN12345',
    });
    ctx.payments.verifyManualPayment(payment.id, { decision: 'paid' });

    const refund = await ctx.payments.requestRefund(payment.id, {
      reason: 'Customer returned the shoes',
    });
    expect(refund.status).toBe('manual-pending');
    expect(refund.amount.amountMinor).toBe(payment.amount.amountMinor);
    // Not refunded until staff confirm the money went back.
    expect(ctx.paymentsRepo.findById(payment.id)?.status).toBe('successful');

    const confirmed = ctx.payments.confirmRefund(payment.id, refund.id, {});
    expect(confirmed.status).toBe('completed');
    expect(ctx.paymentsRepo.findById(payment.id)?.status).toBe('refunded');
  });

  it('refuses a refund on an unpaid payment', async () => {
    const ctx = createTestContext();
    const { payment } = await placeOrder(ctx);
    expect(payment.status).toBe('pending-collection');
    await expect(ctx.payments.requestRefund(payment.id, {})).rejects.toThrow(
      BadRequestException,
    );
  });

  it('records a gateway refund as not configured and never as refunded', async () => {
    const ctx = createTestContext();
    const { order } = await placeOrder(ctx);
    const now = new Date().toISOString();
    const gatewayPayment = ctx.paymentsRepo.create({
      id: 'pay-gateway-fixture',
      orderId: order.id,
      gateway: 'sslcommerz',
      channel: 'gateway',
      status: 'successful',
      amount: money(50000),
      providerTxnId: 'VAL-FIXTURE-1',
      senderNumber: null,
      customerTxnId: null,
      instructions: null,
      createdAt: now,
      updatedAt: now,
    });
    const refund = await ctx.payments.requestRefund(gatewayPayment.id, {});
    expect(refund.status).toBe('gateway-not-configured');
    expect(refund.gatewayNote).toContain('not configured');
    expect(ctx.paymentsRepo.findById(gatewayPayment.id)?.status).toBe(
      'successful',
    );
  });
});

describe('Reconciliation reads', () => {
  it('filters payments and summarises by gateway and status', async () => {
    const ctx = createTestContext();
    await placeOrder(ctx);
    await placeOrder(ctx, { paymentMethod: 'bkash' });
    const all = ctx.payments.listPayments({});
    expect(all).toHaveLength(2);
    expect(ctx.payments.listPayments({ gateway: 'cod' })).toHaveLength(1);
    expect(
      ctx.payments.listPayments({ status: 'awaiting-customer' }),
    ).toHaveLength(1);
    const summary = ctx.payments.summary();
    expect(summary.count).toBe(2);
    expect(summary.byGateway.map((group) => group.key)).toEqual([
      'bkash',
      'cod',
    ]);
    expect(summary.totalMinor).toBe(
      all.reduce((sum, payment) => sum + payment.amount.amountMinor, 0),
    );
  });
});
