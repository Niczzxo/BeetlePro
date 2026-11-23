import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { permissionsForRoles, type Cart } from '@dostelo/types';
import type { CheckoutRequest } from '@dostelo/validation';
import type { AuthPrincipal } from '../../common/auth/principal';
import { InMemoryCartsRepository } from '../carts/repositories/in-memory-carts.repository';
import { InProcessJobQueue } from '../jobs/in-process-job-queue';
import { CartRecoveryService } from './cart-recovery.service';
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

const actor: AuthPrincipal = {
  type: 'admin',
  id: 'admin-recovery-1',
  name: 'Recovery Tester',
  roles: ['crm-manager'],
  permissions: permissionsForRoles(['crm-manager']),
};

async function registerCustomer(
  ctx: TestContext,
  overrides: { email?: string; phone?: string } = {},
) {
  return ctx.customers.register({
    fullName: 'Cart Abandoner',
    email: overrides.email ?? 'abandoner@example.com',
    phone: overrides.phone ?? '01812345678',
    password: 'correct horse battery',
  });
}

/** Creates a cart with one Court White Sneakers line and ages it
 * by rewriting updatedAt, as time passing would. */
function makeCart(
  ctx: TestContext,
  options: {
    customerId?: string;
    sessionToken?: string;
    ageMinutes?: number;
    productId?: string;
    size?: string;
    colour?: string;
  } = {},
): Cart {
  const productId = options.productId ?? 'sneakers-court';
  const { variant } = findVariant(
    ctx,
    productId,
    options.size ?? 'EU 41',
    options.colour ?? 'White',
  );
  const view = ctx.cartsService.createCart({
    customerId: options.customerId,
    sessionToken: options.sessionToken,
  });
  ctx.cartsService.addLine(view.id, {
    productId,
    variantId: variant.id,
    quantity: 1,
  });
  const stored = ctx.db.carts.get(view.id);
  if (!stored) throw new Error('cart missing from store');
  const age = options.ageMinutes ?? 120;
  stored.updatedAt = new Date(Date.now() - age * 60_000).toISOString();
  return stored;
}

function checkoutRequest(
  ctx: TestContext,
  overrides: Partial<CheckoutRequest> = {},
): CheckoutRequest {
  const { variant } = findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
  return {
    lines: [
      { productId: 'sneakers-court', variantId: variant.id, quantity: 1 },
    ],
    address: DHAKA_ADDRESS,
    paymentMethod: 'cod',
    ...overrides,
  };
}

describe('CartRecoveryService detection', () => {
  it('flags an aged cart with a customer contact path', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    const cart = makeCart(ctx, { customerId: customer.id });
    const result = await ctx.cartRecovery.scan();
    expect(result.detected).toBe(1);
    const recovery = ctx.cartRecoveryRepo.findByCartId(cart.id);
    expect(recovery).not.toBeNull();
    expect(recovery?.status).toBe('detected');
    expect(recovery?.customerId).toBe(customer.id);
    expect(recovery?.contactPhone).toBe('01812345678');
    expect(recovery?.contactEmail).toBe('abandoner@example.com');
    // A registered customer (password on file) is an account basis.
    expect(recovery?.contactBasis).toBe('account');
    expect(recovery?.cartTotal.amountMinor).toBe(185000);
    expect(recovery?.itemCount).toBe(1);
    expect(recovery?.recoveryToken.length).toBeGreaterThanOrEqual(24);
    const attempts = ctx.cartRecoveryRepo.listAttempts(recovery!.id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.stepNumber).toBe(1);
    expect(attempts[0]?.channel).toBe('whatsapp');
    expect(attempts[0]?.status).toBe('scheduled');
    expect(attempts[0]?.queueJobId).not.toBeNull();
    expect(ctx.jobQueue.pendingCount()).toBe(1);
  });

  it('does not flag a fresh cart', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    makeCart(ctx, { customerId: customer.id, ageMinutes: 5 });
    expect((await ctx.cartRecovery.scan()).detected).toBe(0);
  });

  it('respects the inactivity threshold exactly', async () => {
    const ctx = createTestContext();
    const under = await registerCustomer(ctx, {
      email: 'under@example.com',
      phone: '01811111111',
    });
    const over = await registerCustomer(ctx, {
      email: 'over@example.com',
      phone: '01822222222',
    });
    makeCart(ctx, { customerId: under.id, ageMinutes: 59 });
    makeCart(ctx, { customerId: over.id, ageMinutes: 61 });
    expect((await ctx.cartRecovery.scan()).detected).toBe(1);
    expect(ctx.cartRecovery.list({})).toHaveLength(1);
    expect(ctx.cartRecovery.list({})[0]?.customerId).toBe(over.id);
  });

  it('does not flag an empty cart', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    const view = ctx.cartsService.createCart({ customerId: customer.id });
    const stored = ctx.db.carts.get(view.id);
    if (!stored) throw new Error('cart missing');
    stored.updatedAt = new Date(Date.now() - 180 * 60_000).toISOString();
    expect((await ctx.cartRecovery.scan()).detected).toBe(0);
  });

  it('does not flag a converted cart', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    const cart = makeCart(ctx, { customerId: customer.id });
    ctx.checkout.placeOrder(
      checkoutRequest(ctx, { customerId: customer.id, cartId: cart.id }),
    );
    expect(ctx.db.carts.get(cart.id)?.status).toBe('converted');
    expect((await ctx.cartRecovery.scan()).detected).toBe(0);
  });

  it('does not flag a cart with no contact path', async () => {
    const ctx = createTestContext();
    makeCart(ctx, {});
    expect((await ctx.cartRecovery.scan()).detected).toBe(0);
  });

  it('does not flag a cart whose session belongs to an anonymous visitor', async () => {
    const ctx = createTestContext();
    ctx.visitors.ingestEvent({
      visitorId: 'visitor-anon-1',
      sessionId: 'session-anon-1',
      type: 'page-view',
    });
    makeCart(ctx, { sessionToken: 'session-anon-1' });
    expect((await ctx.cartRecovery.scan()).detected).toBe(0);
  });

  it('flags a guest cart once its session is linked to a customer', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    ctx.visitors.ingestEvent({
      visitorId: 'visitor-linked-1',
      sessionId: 'session-linked-1',
      type: 'checkout-start',
    });
    ctx.visitors.linkAuthenticated(customer.id, 'visitor-linked-1');
    const cart = makeCart(ctx, { sessionToken: 'session-linked-1' });
    expect((await ctx.cartRecovery.scan()).detected).toBe(1);
    const recovery = ctx.cartRecoveryRepo.findByCartId(cart.id);
    expect(recovery?.customerId).toBe(customer.id);
    expect(recovery?.visitorId).toBe('visitor-linked-1');
  });

  it('is idempotent: a second scan does not re-detect', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    makeCart(ctx, { customerId: customer.id });
    expect((await ctx.cartRecovery.scan()).detected).toBe(1);
    expect((await ctx.cartRecovery.scan()).detected).toBe(0);
    expect(ctx.cartRecovery.list({})).toHaveLength(1);
  });
});

describe('CartRecoveryService sequence', () => {
  it('runs the steps in order through the queue seam as time advances', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    ctx.cartRecovery.updateSettings(
      {
        steps: [
          { stepNumber: 1, delayMinutes: 60, channel: 'whatsapp', templateKey: 'recovery-whatsapp-1' },
          { stepNumber: 2, delayMinutes: 60, channel: 'email', templateKey: 'recovery-email-1' },
          { stepNumber: 3, delayMinutes: 60, channel: 'call', templateKey: 'recovery-call-1' },
        ],
      },
      actor,
    );

    const t0 = Date.now();
    let now = t0;
    const queue = new InProcessJobQueue(() => now);
    const service = new CartRecoveryService(
      ctx.cartRecoveryRepo,
      new InMemoryCartsRepository(ctx.db),
      ctx.cartsService,
      ctx.catalog,
      ctx.customers,
      ctx.visitors,
      ctx.communications,
      queue,
      ctx.audit,
    );
    service.registerJobs();

    const cart = makeCart(ctx, { customerId: customer.id });
    // Age relative to the fake clock's t0.
    const stored = ctx.db.carts.get(cart.id);
    if (!stored) throw new Error('cart missing');
    stored.updatedAt = new Date(t0 - 120 * 60_000).toISOString();

    expect((await service.scan(t0)).detected).toBe(1);
    const recovery = ctx.cartRecoveryRepo.findByCartId(cart.id);
    if (!recovery) throw new Error('recovery missing');

    now = t0 + 59 * 60_000;
    expect(await queue.runDue()).toBe(0);
    now = t0 + 60 * 60_000;
    expect(await queue.runDue()).toBe(1);
    let attempts = ctx.cartRecoveryRepo.listAttempts(recovery.id);
    expect(attempts[0]?.status).toBe('executed');
    // No WhatsApp credentials exist in tests: the honest outcome.
    expect(attempts[0]?.outcome).toBe('not-configured');
    expect(attempts[1]?.status).toBe('scheduled');
    expect(
      ctx.communications.listLog({ abandonedCartId: recovery.id }),
    ).toHaveLength(1);

    now = t0 + 120 * 60_000;
    expect(await queue.runDue()).toBe(1);
    attempts = ctx.cartRecoveryRepo.listAttempts(recovery.id);
    expect(attempts[1]?.outcome).toBe('not-configured');
    expect(attempts[2]?.status).toBe('scheduled');

    now = t0 + 180 * 60_000;
    expect(await queue.runDue()).toBe(1);
    attempts = ctx.cartRecoveryRepo.listAttempts(recovery.id);
    expect(attempts[2]?.outcome).toBe('awaiting-staff');
    const after = ctx.cartRecoveryRepo.findById(recovery.id);
    expect(after?.status).toBe('closed');
    expect(after?.closeReason).toBe('sequence-exhausted');
    expect(queue.pendingCount()).toBe(0);
    const logs = ctx.communications.listLog({
      abandonedCartId: recovery.id,
    });
    expect(logs.map((entry) => entry.channel).sort()).toEqual([
      'call',
      'email',
      'whatsapp',
    ]);
    expect(logs.every((entry) => entry.status !== 'sent')).toBe(true);
  });

  it('runNextStep executes the first step immediately and cancels its job', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    makeCart(ctx, { customerId: customer.id });
    await ctx.cartRecovery.scan();
    const recovery = ctx.cartRecovery.list({})[0];
    if (!recovery) throw new Error('recovery missing');
    expect(ctx.jobQueue.pendingCount()).toBe(1);
    const detail = await ctx.cartRecovery.runNextStep(recovery.id, actor);
    expect(detail.attempts[0]?.status).toBe('executed');
    expect(detail.attempts[0]?.outcome).toBe('not-configured');
    // Step 2 is now scheduled instead; step 1's job is gone.
    expect(detail.attempts[1]?.status).toBe('scheduled');
    expect(ctx.jobQueue.pendingCount()).toBe(1);
  });

  it('a suppressed contact stops the sequence after the refusal', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    makeCart(ctx, { customerId: customer.id });
    await ctx.cartRecovery.scan();
    const recovery = ctx.cartRecovery.list({})[0];
    if (!recovery) throw new Error('recovery missing');
    ctx.communications.logManualCall(
      { phone: '01812345678', outcome: 'opted-out' },
      actor,
    );
    const detail = await ctx.cartRecovery.runNextStep(recovery.id, actor);
    expect(detail.attempts[0]?.outcome).toBe('refused-suppressed');
    expect(detail.recovery.status).toBe('closed');
    expect(detail.recovery.closeReason).toBe('contact-refused');
    expect(detail.attempts).toHaveLength(1);
    expect(ctx.jobQueue.pendingCount()).toBe(0);
  });
});

describe('CartRecoveryService order recovery', () => {
  it('placing an order from the cart recovers it and cancels pending steps', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    const cart = makeCart(ctx, { customerId: customer.id });
    await ctx.cartRecovery.scan();
    const recovery = ctx.cartRecoveryRepo.findByCartId(cart.id);
    if (!recovery) throw new Error('recovery missing');
    expect(ctx.jobQueue.pendingCount()).toBe(1);

    const order = ctx.checkout.placeOrder(
      checkoutRequest(ctx, { customerId: customer.id, cartId: cart.id }),
    );
    const after = ctx.cartRecoveryRepo.findById(recovery.id);
    expect(after?.status).toBe('recovered');
    expect(after?.recoveredOrderNumber).toBe(order.orderNumber);
    const attempts = ctx.cartRecoveryRepo.listAttempts(recovery.id);
    expect(attempts[0]?.status).toBe('cancelled');
    expect(ctx.jobQueue.pendingCount()).toBe(0);
  });

  it('an order by the same customer covering the cart lines recovers it', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    const cart = makeCart(ctx, { customerId: customer.id });
    await ctx.cartRecovery.scan();
    ctx.checkout.placeOrder(
      checkoutRequest(ctx, { customerId: customer.id }),
    );
    const after = ctx.cartRecoveryRepo.findByCartId(cart.id);
    expect(after?.status).toBe('recovered');
  });

  it('an unrelated order by the same customer does not recover it', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    const cart = makeCart(ctx, { customerId: customer.id });
    await ctx.cartRecovery.scan();
    const { variant } = findVariant(ctx, 'tee-basic', 'M');
    ctx.checkout.placeOrder(
      checkoutRequest(ctx, {
        customerId: customer.id,
        lines: [
          { productId: 'tee-basic', variantId: variant.id, quantity: 1 },
        ],
      }),
    );
    const after = ctx.cartRecoveryRepo.findByCartId(cart.id);
    expect(after?.status).toBe('detected');
  });

  it('closing: emptying the cart closes the recovery on the next scan', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    const cart = makeCart(ctx, { customerId: customer.id });
    await ctx.cartRecovery.scan();
    const recovery = ctx.cartRecoveryRepo.findByCartId(cart.id);
    if (!recovery) throw new Error('recovery missing');
    const line = ctx.db.carts.get(cart.id)?.items[0];
    if (!line) throw new Error('line missing');
    ctx.cartsService.removeLine(cart.id, line.id);
    const result = await ctx.cartRecovery.scan();
    expect(result.closed).toBe(1);
    const after = ctx.cartRecoveryRepo.findById(recovery.id);
    expect(after?.status).toBe('closed');
    expect(after?.closeReason).toBe('cart-emptied');
    expect(ctx.jobQueue.pendingCount()).toBe(0);
  });

  it('staff can cancel a recovery and its pending steps', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    makeCart(ctx, { customerId: customer.id });
    await ctx.cartRecovery.scan();
    const recovery = ctx.cartRecovery.list({})[0];
    if (!recovery) throw new Error('recovery missing');
    const cancelled = ctx.cartRecovery.cancelRecovery(recovery.id, actor);
    expect(cancelled.status).toBe('cancelled');
    expect(ctx.jobQueue.pendingCount()).toBe(0);
    expect(() =>
      ctx.cartRecovery.cancelRecovery(recovery.id, actor),
    ).toThrow(BadRequestException);
  });
});

describe('CartRecoveryService recovery token', () => {
  it('returns the cart contents at current prices without contact details', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    const cart = makeCart(ctx, { customerId: customer.id });
    await ctx.cartRecovery.scan();
    const recovery = ctx.cartRecoveryRepo.findByCartId(cart.id);
    if (!recovery) throw new Error('recovery missing');
    const view = ctx.cartRecovery.getByToken(recovery.recoveryToken);
    expect(view.status).toBe('active');
    expect(view.items).toHaveLength(1);
    expect(view.items[0]?.productName).toBe('Court White Sneakers');
    expect(view.items[0]?.unitPrice.amountMinor).toBe(185000);
    expect(view.subtotal.amountMinor).toBe(185000);
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('01812345678');
    expect(serialized).not.toContain('abandoner@example.com');
    expect(serialized).not.toContain('Cart Abandoner');
    expect(serialized).not.toContain(customer.id);
  });

  it('answers honestly once the cart has been recovered', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    const cart = makeCart(ctx, { customerId: customer.id });
    await ctx.cartRecovery.scan();
    const recovery = ctx.cartRecoveryRepo.findByCartId(cart.id);
    if (!recovery) throw new Error('recovery missing');
    ctx.checkout.placeOrder(
      checkoutRequest(ctx, { customerId: customer.id, cartId: cart.id }),
    );
    const view = ctx.cartRecovery.getByToken(recovery.recoveryToken);
    expect(view.status).toBe('recovered');
    expect(view.items).toHaveLength(0);
  });

  it('answers expired for a token past its lifetime', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    const cart = makeCart(ctx, { customerId: customer.id });
    await ctx.cartRecovery.scan();
    const recovery = ctx.cartRecoveryRepo.findByCartId(cart.id);
    if (!recovery) throw new Error('recovery missing');
    recovery.tokenExpiresAt = new Date(
      Date.now() - 60_000,
    ).toISOString();
    ctx.cartRecoveryRepo.save(recovery);
    const view = ctx.cartRecovery.getByToken(recovery.recoveryToken);
    expect(view.status).toBe('expired');
    expect(view.items).toHaveLength(0);
  });

  it('rejects an unknown token', () => {
    const ctx = createTestContext();
    expect(() => ctx.cartRecovery.getByToken('no-such-token')).toThrow(
      NotFoundException,
    );
  });
});

describe('CartRecoveryService settings', () => {
  it('rejects step numbering with gaps', () => {
    const ctx = createTestContext();
    expect(() =>
      ctx.cartRecovery.updateSettings(
        {
          steps: [
            { stepNumber: 1, delayMinutes: 60, channel: 'whatsapp', templateKey: 'recovery-whatsapp-1' },
            { stepNumber: 3, delayMinutes: 60, channel: 'email', templateKey: 'recovery-email-1' },
          ],
        },
        actor,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a template that does not match the step channel', () => {
    const ctx = createTestContext();
    expect(() =>
      ctx.cartRecovery.updateSettings(
        {
          steps: [
            { stepNumber: 1, delayMinutes: 60, channel: 'email', templateKey: 'recovery-whatsapp-1' },
          ],
        },
        actor,
      ),
    ).toThrow(BadRequestException);
  });

  it('applies a new inactivity threshold to later scans', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    makeCart(ctx, { customerId: customer.id, ageMinutes: 30 });
    expect((await ctx.cartRecovery.scan()).detected).toBe(0);
    ctx.cartRecovery.updateSettings({ abandonedAfterMinutes: 15 }, actor);
    expect((await ctx.cartRecovery.scan()).detected).toBe(1);
  });
});
