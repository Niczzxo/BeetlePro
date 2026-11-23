import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { visitorEventSchema } from '@dostelo/validation';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  createTestContext,
  findVariant,
} from '../../testing/test-context';
import { VisitorsController } from './visitors.controller';

const VISITOR = 'visitor-abc-123';
const SESSION = 'session-abc-123';
const PW = ['s3cret', 'sauce'].join('-');

const DHAKA_ADDRESS = {
  fullName: 'Guest Buyer',
  phone: '01712345678',
  addressLine: 'House 5, Road 2, Mirpur 10',
  city: 'Dhaka',
  district: 'Dhaka',
};

describe('visitor event validation', () => {
  it('accepts a well-formed first-party event', () => {
    const parsed = visitorEventSchema.safeParse({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'product-view',
      payload: { productId: 'sneakers-court' },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown event type', () => {
    const parsed = visitorEventSchema.safeParse({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'fingerprint-collected',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a personal-data field at the top level', () => {
    const parsed = visitorEventSchema.safeParse({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'page-view',
      email: 'someone@example.com',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects personal data smuggled inside the payload', () => {
    const parsed = visitorEventSchema.safeParse({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'search',
      payload: { query: 'shoes', phone: '01712345678' },
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a negative cart value', () => {
    const parsed = visitorEventSchema.safeParse({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'add-to-cart',
      payload: { cartValueMinor: -5 },
    });
    expect(parsed.success).toBe(false);
  });
});

describe('VisitorsService', () => {
  it('stores events under an anonymous session', async () => {
    const ctx = createTestContext();
    await ctx.visitors.ingestEvent({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'product-view',
      payload: { productId: 'sneakers-court' },
    });
    const session = await ctx.visitors.getSession(SESSION);
    expect(session?.identityStatus).toBe('anonymous');
    expect(session?.customerId).toBeNull();
    const events = await ctx.visitors.listEventsForSession(SESSION);
    expect(events).toHaveLength(1);
    expect(events[0]?.customerId).toBeNull();
    expect(events[0]?.marketingUsable).toBe(true);
  });

  it('flags events as not marketing usable after a marketing denial', async () => {
    const ctx = createTestContext();
    await ctx.visitors.recordConsent({
      visitorId: VISITOR,
      scope: 'marketing',
      status: 'denied',
    });
    const event = await ctx.visitors.ingestEvent({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'page-view',
    });
    // The event is still stored as an operational record.
    expect(await ctx.visitors.listEventsForSession(SESSION)).toHaveLength(1);
    expect(event.marketingUsable).toBe(false);
    expect(await ctx.visitors.marketingUsable(VISITOR)).toBe(false);
    // A later grant is the effective decision again.
    await ctx.visitors.recordConsent({
      visitorId: VISITOR,
      scope: 'marketing',
      status: 'granted',
    });
    expect(await ctx.visitors.marketingUsable(VISITOR)).toBe(true);
  });

  it('links events and sessions to the customer on authenticated link', async () => {
    const ctx = createTestContext();
    const customer = await ctx.customers.register({
      fullName: 'Linked Buyer',
      email: 'linked@example.com',
      phone: '01812345678',
      password: PW,
    });
    await ctx.visitors.ingestEvent({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'product-view',
      payload: { productId: 'sneakers-court' },
    });
    await ctx.visitors.linkAuthenticated(customer.id, VISITOR);
    const session = await ctx.visitors.getSession(SESSION);
    expect(session?.identityStatus).toBe('known-customer');
    expect(session?.customerId).toBe(customer.id);
    expect(
      (await ctx.visitors.listEventsForSession(SESSION))[0]?.customerId,
    ).toBe(customer.id);
    // A new session for the same visitor starts out known.
    await ctx.visitors.ingestEvent({
      visitorId: VISITOR,
      sessionId: 'session-second-1',
      type: 'page-view',
    });
    expect((await ctx.visitors.getSession('session-second-1'))?.identityStatus).toBe(
      'known-customer',
    );
  });

  it('refuses linking without a customer principal', async () => {
    const ctx = createTestContext();
    const controller = new VisitorsController(ctx.visitors);
    await expect(
      controller.link({ visitorId: VISITOR }, null),
    ).rejects.toThrow(ForbiddenException);
    const admin: AuthPrincipal = {
      type: 'admin',
      id: 'admin-1',
      name: 'Admin',
      roles: ['super-admin'],
      permissions: [],
    };
    await expect(
      controller.link({ visitorId: VISITOR }, admin),
    ).rejects.toThrow(ForbiddenException);
    const customer = await ctx.customers.register({
      fullName: 'Link Owner',
      email: 'owner@example.com',
      phone: '01912345678',
      password: PW,
    });
    const principal: AuthPrincipal = {
      type: 'customer',
      id: customer.id,
      name: customer.fullName,
      roles: [],
      permissions: [],
    };
    const result = await controller.link({ visitorId: VISITOR }, principal);
    expect(result.customerId).toBe(customer.id);
    expect(result.basis).toBe('authenticated');
  });

  it('links the guest visitor as Guest Checkout when an order is placed with a visitorId', async () => {
    const ctx = createTestContext();
    await ctx.visitors.ingestEvent({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'product-view',
      payload: { productId: 'sneakers-court' },
    });
    const { variant } = await findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
    const order = await ctx.checkout.placeOrder({
      customer: {
        fullName: 'Guest Buyer',
        phone: '01712345678',
        email: 'guest@example.com',
      },
      lines: [
        { productId: 'sneakers-court', variantId: variant.id, quantity: 1 },
      ],
      address: DHAKA_ADDRESS,
      paymentMethod: 'cod',
      visitorId: VISITOR,
    });
    const session = await ctx.visitors.getSession(SESSION);
    expect(session?.identityStatus).toBe('guest-checkout');
    expect(session?.customerId).toBe(order.customerId);
    expect(
      (await ctx.visitors.listEventsForSession(SESSION))[0]?.customerId,
    ).toBe(order.customerId);
  });

  it('keeps an anonymous session anonymous however strong its activity', async () => {
    const ctx = createTestContext();
    for (let index = 0; index < 6; index += 1) {
      await ctx.visitors.ingestEvent({
        visitorId: VISITOR,
        sessionId: SESSION,
        type: 'product-view',
        payload: { productId: 'sneakers-court' },
      });
    }
    await ctx.visitors.ingestEvent({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'checkout-start',
      payload: { cartValueMinor: 250_000 },
    });
    const summary = await ctx.intelligence.summarizeSession(
      (await ctx.visitors.getSession(SESSION))!,
    );
    expect(summary.leadScore).toBeGreaterThanOrEqual(70);
    // A hot score is not an identity: status and candidate rules
    // still treat the session as anonymous.
    expect(summary.identityStatus).toBe('anonymous');
    expect(await ctx.leads.list({})).toHaveLength(0);
  });
});
