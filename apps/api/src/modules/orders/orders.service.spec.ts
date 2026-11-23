import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { Order, OrderStatus } from '@dostelo/types';
import {
  createTestContext,
  findVariant,
  type TestContext,
} from '../../testing/test-context';

async function placeTestOrder(ctx: TestContext): Promise<Order> {
  const customer = await ctx.customers.register({
    fullName: 'Flow Buyer',
    email: `flow-${Math.random()}@example.com`,
    phone: '01912345678',
    password: 'password123',
  });
  const { variant } = await findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
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
      fullName: 'Flow Buyer',
      phone: '01912345678',
      addressLine: 'House 5, Mirpur 10',
      city: 'Dhaka',
      district: 'Dhaka',
    },
    paymentMethod: 'cod',
  });
}

function move(ctx: TestContext, order: Order, status: OrderStatus) {
  return ctx.ordersService.transition(order.orderNumber, { status });
}

describe('OrdersService status flow', () => {
  it('walks the full fulfilment flow and records every event', async () => {
    const ctx = createTestContext();
    const order = await placeTestOrder(ctx);
    const flow: OrderStatus[] = [
      'confirmed',
      'processing',
      'packed',
      'ready-to-ship',
      'shipped',
      'out-for-delivery',
      'delivered',
    ];
    let current = order;
    for (const status of flow) {
      current = await move(ctx, current, status);
      expect(current.status).toBe(status);
    }
    // One placement event plus one per transition.
    expect(await ctx.orders.listStatusEvents(order.id)).toHaveLength(8);
  });

  it('rejects skipping stages and moving out of terminal states', async () => {
    const ctx = createTestContext();
    const order = await placeTestOrder(ctx);
    await expect(move(ctx, order, 'shipped')).rejects.toThrow(
      BadRequestException,
    );
    await expect(move(ctx, order, 'delivered')).rejects.toThrow(
      BadRequestException,
    );
    await move(ctx, order, 'cancelled');
    await expect(move(ctx, order, 'confirmed')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('forbids cancellation once the order has shipped', async () => {
    const ctx = createTestContext();
    const order = await placeTestOrder(ctx);
    for (const status of [
      'confirmed',
      'processing',
      'packed',
      'ready-to-ship',
      'shipped',
    ] as OrderStatus[]) {
      await move(ctx, order, status);
    }
    await expect(move(ctx, order, 'cancelled')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('allows a return after delivery and nothing after that', async () => {
    const ctx = createTestContext();
    const order = await placeTestOrder(ctx);
    for (const status of [
      'confirmed',
      'processing',
      'packed',
      'ready-to-ship',
      'shipped',
      'out-for-delivery',
      'delivered',
    ] as OrderStatus[]) {
      await move(ctx, order, status);
    }
    const returned = await move(ctx, order, 'returned');
    expect(returned.status).toBe('returned');
    await expect(move(ctx, order, 'confirmed')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('releases the stock reservation when an order is cancelled', async () => {
    const ctx = createTestContext();
    const order = await placeTestOrder(ctx);
    const { variant } = await findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
    expect((await ctx.inventoryService.getStock(variant.id)).reserved).toBe(1);
    await move(ctx, order, 'cancelled');
    const stock = await ctx.inventoryService.getStock(variant.id);
    expect(stock.reserved).toBe(0);
    expect(stock.available).toBe(stock.onHand);
  });

  it('settles the reservation as sold when an order is delivered', async () => {
    const ctx = createTestContext();
    const order = await placeTestOrder(ctx);
    const { variant } = await findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
    const onHandBefore = (await ctx.inventoryService.getStock(variant.id)).onHand;
    for (const status of [
      'confirmed',
      'processing',
      'packed',
      'ready-to-ship',
      'shipped',
      'out-for-delivery',
      'delivered',
    ] as OrderStatus[]) {
      await move(ctx, order, status);
    }
    const stock = await ctx.inventoryService.getStock(variant.id);
    expect(stock.reserved).toBe(0);
    expect(stock.onHand).toBe(onHandBefore - 1);
  });
});
