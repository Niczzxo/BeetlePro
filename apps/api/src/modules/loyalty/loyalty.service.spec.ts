import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { permissionsForRoles } from '@dostelo/types';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  createTestContext,
  findVariant,
  type TestContext,
} from '../../testing/test-context';

/**
 * Loyalty service tests (rules engine): points are awarded as
 * append-only ledger transactions by the real event flows, only
 * while their rule is active, idempotent per event; a return
 * reverses the award with a reversing entry; staff adjustments
 * add and subtract with a floor at zero and an audit entry.
 */

async function activateOrderRule(ctx: TestContext) {
  await ctx.loyalty.upsertPointRule(
    {
      id: 'rule-completed-order',
      activity: 'completed-order',
      calculation: 'per-amount',
      points: 1,
      perAmountTaka: 100,
      active: true,
    },
    actor,
  );
}
const actor: AuthPrincipal = {
  type: 'admin',
  id: 'admin-loyalty-1',
  name: 'Loyalty Tester',
  roles: ['super-admin'],
  permissions: permissionsForRoles(['super-admin']),
};

const DHAKA_ADDRESS = {
  fullName: 'Loyal Buyer',
  phone: '01712345678',
  addressLine: 'House 5, Road 2, Mirpur 10',
  city: 'Dhaka',
  district: 'Dhaka',
};

async function deliverOrder(ctx: TestContext, customerId: string) {
  const { variant } = await findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
  const order = await ctx.checkout.placeOrder({
    customerId,
    lines: [
      { productId: 'sneakers-court', variantId: variant.id, quantity: 1 },
    ],
    address: DHAKA_ADDRESS,
    paymentMethod: 'cod',
  });
  for (const status of [
    'confirmed',
    'processing',
    'packed',
    'ready-to-ship',
    'shipped',
    'out-for-delivery',
    'delivered',
  ] as const) {
    await ctx.ordersService.transition(order.orderNumber, { status });
  }
  return order;
}

describe('LoyaltyService', () => {
  it('awards points on delivery only, once per order', async () => {
    const ctx = createTestContext();
    await activateOrderRule(ctx);
    const customer = await ctx.customers.register({
      fullName: 'Loyal Buyer',
      email: 'loyal@example.com',
      phone: '01712345678',
      password: 'buyer-pass-123',
    });
    const before = await ctx.loyalty.balanceFor(customer.id);
    expect(before.earnedPoints).toBe(0);
    expect(before.balancePoints).toBe(0);

    const order = await deliverOrder(ctx, customer.id);
    const after = await ctx.loyalty.balanceFor(customer.id);
    // Order total is 1860 taka (1850 + 10 COD fee, free first
    // delivery): at 1 point per 100 taka that earns 18 points.
    expect(order.total.amountMinor).toBe(186000);
    expect(after.deliveredSpend.amountMinor).toBe(186000);
    expect(after.earnedPoints).toBe(18);
    expect(after.balancePoints).toBe(18);
    expect(after.balanceValue.amountMinor).toBe(1800);
    // Idempotency: awarding the same delivered order again
    // writes nothing.
    await ctx.loyalty.awardForOrder(order);
    const again = await ctx.loyalty.balanceFor(customer.id);
    expect(again.earnedPoints).toBe(18);
    const entries = await ctx.loyalty.listTransactions(customer.id);
    expect(entries.filter((e) => e.type === 'earned-order')).toHaveLength(1);
  });

  it('awards nothing while the rule is inactive', async () => {
    const ctx = createTestContext();
    const customer = await ctx.customers.register({
      fullName: 'Inactive Buyer',
      email: 'inactive@example.com',
      phone: '01712345671',
      password: 'inactive-pass-1',
    });
    await deliverOrder(ctx, customer.id);
    const balance = await ctx.loyalty.balanceFor(customer.id);
    expect(balance.earnedPoints).toBe(0);
  });

  it('reverses the award when the order is returned', async () => {
    const ctx = createTestContext();
    await activateOrderRule(ctx);
    const customer = await ctx.customers.register({
      fullName: 'Returning Buyer',
      email: 'returning@example.com',
      phone: '01712345672',
      password: 'returning-pass-1',
    });
    const order = await deliverOrder(ctx, customer.id);
    expect((await ctx.loyalty.balanceFor(customer.id)).earnedPoints).toBe(18);
    await ctx.ordersService.transition(order.orderNumber, {
      status: 'returned',
    });
    const balance = await ctx.loyalty.balanceFor(customer.id);
    expect(balance.earnedPoints).toBe(0);
    expect(balance.balancePoints).toBe(0);
    const entries = await ctx.loyalty.listTransactions(customer.id);
    expect(entries.some((e) => e.type === 'reversal' && e.delta === -18)).toBe(
      true,
    );
  });

  it('applies audited adjustments and refuses to go below zero', async () => {
    const ctx = createTestContext();
    const customer = await ctx.customers.register({
      fullName: 'Adjusted Buyer',
      email: 'adjusted@example.com',
      phone: '01712345679',
      password: 'buyer-pass-123',
    });
    const granted = await ctx.loyalty.adjust(
      customer.id,
      { delta: 50, reason: 'Goodwill grant' },
      actor,
    );
    expect(granted.balancePoints).toBe(50);
    const redeemed = await ctx.loyalty.adjust(
      customer.id,
      { delta: -20, reason: 'Redeemed at store counter' },
      actor,
    );
    expect(redeemed.balancePoints).toBe(30);
    await expect(
      ctx.loyalty.adjust(
        customer.id,
        { delta: -31, reason: 'Too much' },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    const transactions = await ctx.loyalty.listTransactions(customer.id);
    expect(
      transactions.map((entry) => entry.delta).sort((a, b) => a - b),
    ).toEqual([-20, 50]);
  });

  it('keeps the ledger when the rules change afterwards', async () => {
    const ctx = createTestContext();
    await activateOrderRule(ctx);
    const customer = await ctx.customers.register({
      fullName: 'Rules Buyer',
      email: 'rules@example.com',
      phone: '01712345670',
      password: 'rules-pass-123',
    });
    await deliverOrder(ctx, customer.id);
    expect((await ctx.loyalty.balanceFor(customer.id)).earnedPoints).toBe(18);
    // Editing the valuation rules changes what a point is worth,
    // never the recorded history.
    const rules = await ctx.loyalty.updateRules(
      { takaPerPoint: 50, pointValueMinor: 200 },
      actor,
    );
    expect(rules.takaPerPoint).toBe(50);
    const balance = await ctx.loyalty.balanceFor(customer.id);
    expect(balance.earnedPoints).toBe(18);
    expect(balance.balanceValue.amountMinor).toBe(3600);
  });
});
