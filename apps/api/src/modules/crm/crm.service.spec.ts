import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { permissionsForRoles } from '@dostelo/types';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  createTestContext,
  findVariant,
  type TestContext,
} from '../../testing/test-context';

const VISITOR = 'visitor-crm-0001';
const SESSION = 'session-crm-0001';
const PW = ['s3cret', 'sauce'].join('-');

const DHAKA_ADDRESS = {
  fullName: 'Timeline Buyer',
  phone: '01712345678',
  addressLine: 'House 5, Road 2, Mirpur 10',
  city: 'Dhaka',
  district: 'Dhaka',
};

function crmActor(): AuthPrincipal {
  return {
    type: 'admin',
    id: 'crm-1',
    name: 'CRM Manager',
    roles: ['crm-manager'],
    permissions: permissionsForRoles(['crm-manager']),
  };
}

async function registerCustomer(ctx: TestContext) {
  return ctx.customers.register({
    fullName: 'Timeline Buyer',
    email: 'timeline@example.com',
    phone: '01812345678',
    password: PW,
  });
}

describe('CRM timeline', () => {
  it('aggregates orders, linked visitor activity, notes and tags', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    const actor = crmActor();

    await ctx.visitors.ingestEvent({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'product-view',
      payload: { productId: 'sneakers-court' },
    });
    await ctx.visitors.ingestEvent({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'add-to-cart',
      payload: { cartValueMinor: 185_000 },
    });
    await ctx.visitors.linkAuthenticated(customer.id, VISITOR);

    const { variant } = await findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
    await ctx.checkout.placeOrder({
      customerId: customer.id,
      lines: [
        { productId: 'sneakers-court', variantId: variant.id, quantity: 1 },
      ],
      address: DHAKA_ADDRESS,
      paymentMethod: 'cod',
    });

    await ctx.crm.addNote(customer.id, 'Prefers evening delivery calls.', actor);
    await ctx.crm.addTag(customer.id, 'repeat-buyer', actor);

    const timeline = await ctx.crm.getTimeline(customer.id);
    expect(timeline.customer.id).toBe(customer.id);
    expect(timeline.orders).toHaveLength(1);
    expect(timeline.orders[0]?.total.amountMinor).toBe(186_000);
    expect(timeline.visitor.sessionCount).toBe(1);
    expect(timeline.visitor.identityStatuses).toEqual(['known-customer']);
    expect(timeline.visitor.eventCount).toBe(2);
    expect(timeline.visitor.eventCounts['product-view']).toBe(1);
    expect(timeline.visitor.eventCounts['add-to-cart']).toBe(1);
    expect(timeline.visitor.lastActivityAt).not.toBeNull();
    expect(timeline.notes).toHaveLength(1);
    expect(timeline.notes[0]?.authorId).toBe('crm-1');
    expect(timeline.tags).toEqual(['repeat-buyer']);
  });

  it('shows no visitor activity for a customer with no linked sessions', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    const timeline = await ctx.crm.getTimeline(customer.id);
    expect(timeline.visitor.sessionCount).toBe(0);
    expect(timeline.visitor.eventCount).toBe(0);
    expect(timeline.visitor.bestLeadScore).toBe(0);
    expect(timeline.orders).toHaveLength(0);
  });

  it('adds and removes tags, deduplicating on add', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    const actor = crmActor();
    await ctx.crm.addTag(customer.id, 'vip', actor);
    const tags = await ctx.crm.addTag(customer.id, 'vip', actor);
    expect(tags).toEqual(['vip']);
    expect(await ctx.crm.removeTag(customer.id, 'vip', actor)).toEqual([]);
    await expect(ctx.crm.removeTag(customer.id, 'vip', actor)).rejects.toThrow(
      NotFoundException,
    );
    expect(await ctx.audit.list({ action: 'customer.tag-added' })).toHaveLength(1);
    expect(await ctx.audit.list({ action: 'customer.note-added' })).toHaveLength(0);
  });
});
