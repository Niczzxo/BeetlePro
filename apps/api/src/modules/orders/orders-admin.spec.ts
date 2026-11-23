import { describe, expect, it } from 'vitest';
import type { Order } from '@dostelo/types';
import {
  createTestContext,
  findVariant,
  type TestContext,
} from '../../testing/test-context';

async function placeTestOrder(
  ctx: TestContext,
  email: string,
  phone: string,
): Promise<Order> {
  const customer = await ctx.customers.register({
    fullName: 'Staff List Buyer',
    email,
    phone,
    password: 'buyer-pass-123',
  });
  const { variant } = findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
  return ctx.checkout.placeOrder({
    customerId: customer.id,
    lines: [
      {
        productId: 'sneakers-court',
        variantId: variant.id,
        quantity: 1,
      },
    ],
    address: {
      fullName: 'Staff List Buyer',
      phone: '01912345678',
      addressLine: 'House 5, Mirpur 10',
      city: 'Dhaka',
      district: 'Dhaka',
    },
    paymentMethod: 'cod',
  });
}

describe('OrdersService staff reads (Phase 4 chunk 2)', () => {
  it('lists all orders newest first and filters by status', async () => {
    const ctx = createTestContext();
    const first = await placeTestOrder(ctx, 'first@example.com', '01911111111');
    const second = await placeTestOrder(
      ctx,
      'second@example.com',
      '01922222222',
    );
    ctx.ordersService.transition(second.orderNumber, {
      status: 'confirmed',
    });

    const all = ctx.ordersService.listAll();
    expect(all.map((order) => order.orderNumber)).toEqual([
      second.orderNumber,
      first.orderNumber,
    ]);
    expect(
      ctx.ordersService
        .listAll('pending')
        .map((order) => order.orderNumber),
    ).toEqual([first.orderNumber]);
    expect(
      ctx.ordersService
        .listAll('confirmed')
        .map((order) => order.orderNumber),
    ).toEqual([second.orderNumber]);
    expect(ctx.ordersService.listAll('delivered')).toEqual([]);
  });

  it('returns detail with status history and legal next states', async () => {
    const ctx = createTestContext();
    const order = await placeTestOrder(
      ctx,
      'detail@example.com',
      '01933333333',
    );

    const before = ctx.ordersService.getDetail(order.orderNumber);
    expect(before.order.orderNumber).toBe(order.orderNumber);
    // Placement records the initial pending event.
    expect(before.events.map((event) => event.status)).toEqual(['pending']);
    expect(before.allowedTransitions).toEqual(['confirmed', 'cancelled']);

    ctx.ordersService.transition(order.orderNumber, { status: 'confirmed' });
    const after = ctx.ordersService.getDetail(order.orderNumber);
    expect(after.events.map((event) => event.status)).toEqual([
      'pending',
      'confirmed',
    ]);
    expect(after.allowedTransitions).toEqual(['processing', 'cancelled']);
  });
});
