import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CheckoutRequest } from '@dostelo/validation';
import { hashPassword } from '../common/password';
import {
  createPrismaTestContext,
  findPrismaVariant,
  type PrismaTestContext,
} from './prisma-test-context';

/**
 * Prisma integration suite (docs/PRISMA_MIGRATION.md): the core
 * service flows exercised against a real PostgreSQL database
 * through the Prisma repositories, including the transactional
 * checkout and order-transition paths. Gated behind
 * DOSTELO_TEST_DATABASE_URL (a disposable test database; every
 * context truncates all tables and reseeds). The default suite
 * stays on the in-memory context in test-context.ts; specs that
 * read ctx.db directly are in-memory-only by design and are not
 * duplicated here.
 */
const ENABLED = Boolean(process.env.DOSTELO_TEST_DATABASE_URL);

const DHAKA_ADDRESS = {
  fullName: 'Test Buyer',
  phone: '01712345678',
  addressLine: 'House 5, Road 2, Mirpur 10',
  city: 'Dhaka',
  district: 'Dhaka',
};

describe.skipIf(!ENABLED)('Prisma repositories (integration)', () => {
  let ctx: PrismaTestContext;

  beforeEach(async () => {
    ctx = await createPrismaTestContext();
  }, 60000);

  afterEach(async () => {
    await ctx.dispose();
  });

  async function registerCustomer(email?: string) {
    return ctx.customers.register({
      fullName: 'Prisma Buyer',
      email: email ?? `buyer-${randomUUID().slice(0, 8)}@example.com`,
      phone: `017${Math.floor(10000000 + Math.random() * 89999999)}`,
      password: 'password123',
    });
  }

  async function codRequest(
    customerId: string,
  ): Promise<CheckoutRequest> {
    const { variant } = await findPrismaVariant(
      ctx,
      'sneakers-court',
      'EU 41',
      'White',
    );
    return {
      lines: [
        { productId: 'sneakers-court', variantId: variant.id, quantity: 1 },
      ],
      customerId,
      address: DHAKA_ADDRESS,
      paymentMethod: 'cod',
    };
  }

  it('seeds the catalogue into the database', async () => {
    const products = await ctx.catalog.listProducts();
    expect(products).toHaveLength(22);
    const categories = await ctx.catalog.listCategories();
    expect(categories).toHaveLength(8);
    const { variant } = await findPrismaVariant(
      ctx,
      'sneakers-court',
      'EU 41',
      'White',
    );
    const stock = await ctx.inventory.getStock(variant.id);
    expect(stock?.onHand).toBe(24);
    expect(stock?.reserved).toBe(0);
  });

  it('registers, logs in and rotates refresh tokens with family revocation on reuse', async () => {
    const customer = await registerCustomer();
    const first = await ctx.auth.loginCustomer(
      {
        identifier: customer.email as string,
        password: 'password123',
      },
      null,
    );
    const second = await ctx.auth.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    // Reusing the rotated token revokes the whole family.
    await expect(ctx.auth.refresh(first.refreshToken)).rejects.toThrow();
    await expect(ctx.auth.refresh(second.refreshToken)).rejects.toThrow();
  });

  it('logs in a seeded admin through the User and Role rows', async () => {
    const now = new Date().toISOString();
    await ctx.adminsRepo.create({
      id: randomUUID(),
      email: 'admin-prisma@dostelo.example',
      displayName: 'Prisma Admin',
      passwordHash: await hashPassword('admin-password-1'),
      roles: ['super-admin'],
      isActive: true,
      mfaSecret: null,
      mfaEnabled: false,
      createdAt: now,
      updatedAt: now,
    });
    const result = await ctx.auth.loginAdmin(
      {
        email: 'admin-prisma@dostelo.example',
        password: 'admin-password-1',
      },
      null,
    );
    if (!('accessToken' in result)) {
      throw new Error('admin login unexpectedly requires MFA');
    }
    expect(result.tokenType).toBe('Bearer');
    const loaded = await ctx.adminsRepo.findByEmail(
      'ADMIN-PRISMA@dostelo.example',
    );
    expect(loaded?.roles).toEqual(['super-admin']);
  });

  it('places a COD order transactionally and reserves stock', async () => {
    const customer = await registerCustomer();
    const { variant } = await findPrismaVariant(
      ctx,
      'sneakers-court',
      'EU 41',
      'White',
    );
    const order = await ctx.checkout.placeOrder(await codRequest(customer.id));
    expect(order.subtotal.amountMinor).toBe(185000);
    expect(order.firstOrderFreeDelivery).toBe(true);
    expect(order.deliveryFee.amountMinor).toBe(0);
    expect(order.codFee.amountMinor).toBe(1000);
    expect(order.total.amountMinor).toBe(186000);

    const stock = await ctx.inventory.getStock(variant.id);
    expect(stock?.onHand).toBe(24);
    expect(stock?.reserved).toBe(1);

    const stored = await ctx.orders.findByNumber(order.orderNumber);
    expect(stored?.id).toBe(order.id);
    const events = await ctx.orders.listStatusEvents(order.id);
    expect(events.map((e) => e.status)).toContain('pending');
    const payments = await ctx.paymentsRepo.listByOrder(order.id);
    expect(payments).toHaveLength(1);
    expect(payments[0]?.gateway).toBe('cod');
  });

  it('releases the reservation when the order is cancelled', async () => {
    const customer = await registerCustomer();
    const { variant } = await findPrismaVariant(
      ctx,
      'sneakers-court',
      'EU 41',
      'White',
    );
    const order = await ctx.checkout.placeOrder(await codRequest(customer.id));
    await ctx.ordersService.transition(order.orderNumber, {
      status: 'cancelled',
    });
    const stock = await ctx.inventory.getStock(variant.id);
    expect(stock?.reserved).toBe(0);
    expect(stock?.onHand).toBe(24);
    const stored = await ctx.orders.findById(order.id);
    expect(stored?.status).toBe('cancelled');
  });

  it('verifies a manual bKash payment end to end', async () => {
    const customer = await registerCustomer();
    const { variant } = await findPrismaVariant(
      ctx,
      'sneakers-court',
      'EU 41',
      'White',
    );
    const order = await ctx.checkout.placeOrder({
      lines: [
        { productId: 'sneakers-court', variantId: variant.id, quantity: 1 },
      ],
      customerId: customer.id,
      address: DHAKA_ADDRESS,
      paymentMethod: 'bkash',
    });
    const payment = (await ctx.paymentsRepo.listByOrder(order.id)).at(-1);
    if (!payment) throw new Error('checkout created no payment attempt');
    const confirmed = await ctx.payments.confirmManualPayment(payment.id, {
      senderNumber: '01712345678',
      transactionId: 'TXNPRISMA1',
    });
    expect(confirmed.status).toBe('verification-pending');
    const verified = await ctx.payments.verifyManualPayment(payment.id, {
      decision: 'paid',
      actorId: 'staff-1',
    });
    expect(verified.status).toBe('successful');
    expect((await ctx.orders.findById(order.id))?.paymentStatus).toBe(
      'successful',
    );
    const events = await ctx.paymentsRepo.listEvents(payment.id);
    expect(events.length).toBeGreaterThan(0);
  });

  it('keeps anonymous visitor events anonymous and honours consent denial', async () => {
    const visitorId = `visitor-${randomUUID().slice(0, 8)}`;
    const sessionId = `session-${randomUUID().slice(0, 8)}`;
    await ctx.visitors.recordConsent({
      visitorId,
      scope: 'marketing',
      status: 'denied',
    });
    const event = await ctx.visitors.ingestEvent({
      visitorId,
      sessionId,
      type: 'product-view',
      payload: { productId: 'sneakers-court' },
    });
    expect(event.marketingUsable).toBe(false);
    const session = await ctx.visitors.getSession(sessionId);
    expect(session?.identityStatus).toBe('anonymous');
    expect(session?.customerId).toBeNull();
  });

  it('detects an aged cart and round-trips recovery settings', async () => {
    const customer = await registerCustomer();
    const { variant } = await findPrismaVariant(
      ctx,
      'sneakers-court',
      'EU 41',
      'White',
    );
    const cart = await ctx.cartsService.createCart({
      customerId: customer.id,
    });
    await ctx.cartsService.addLine(cart.id, {
      productId: 'sneakers-court',
      variantId: variant.id,
      quantity: 1,
    });
    // Age the cart past the 60 minute inactivity threshold.
    await ctx.prisma.client.cart.update({
      where: { id: cart.id },
      data: { updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    });
    const result = await ctx.cartRecovery.scan();
    expect(result.detected).toBe(1);
    const recovery = await ctx.cartRecoveryRepo.findByCartId(cart.id);
    expect(recovery?.status).toBe('detected');
    expect(recovery?.contactPhone).toBe(customer.phone);

    const settings = await ctx.cartRecoveryRepo.getSettings();
    expect(settings.abandonedAfterMinutes).toBe(60);
    expect(settings.steps).toHaveLength(3);
    await ctx.cartRecoveryRepo.saveSettings({
      ...settings,
      tokenTtlDays: 7,
    });
    const reloaded = await ctx.cartRecoveryRepo.getSettings();
    expect(reloaded.tokenTtlDays).toBe(7);
    expect(reloaded.steps).toHaveLength(3);
  });
});
