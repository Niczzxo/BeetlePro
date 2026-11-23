import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { permissionsForRoles, type Order } from '@dostelo/types';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  createTestContext,
  findVariant,
  type TestContext,
} from '../../testing/test-context';

/**
 * Returns service tests: delivered-only intake, quantity
 * accounting across requests, restock on approval, the order
 * moving to returned only when fully covered, and the refund
 * hand-off into Payments.
 */
const actor: AuthPrincipal = {
  type: 'admin',
  id: 'admin-returns-1',
  name: 'Returns Tester',
  roles: ['super-admin'],
  permissions: permissionsForRoles(['super-admin']),
};

const DHAKA_ADDRESS = {
  fullName: 'Return Buyer',
  phone: '01712345678',
  addressLine: 'House 5, Road 2, Mirpur 10',
  city: 'Dhaka',
  district: 'Dhaka',
};

const FORWARD = [
  'confirmed',
  'processing',
  'packed',
  'ready-to-ship',
  'shipped',
  'out-for-delivery',
  'delivered',
] as const;

async function placeDeliveredOrder(
  ctx: TestContext,
  email: string,
  quantity = 2,
): Promise<Order> {
  const customer = await ctx.customers.register({
    fullName: 'Return Buyer',
    email,
    phone: '01712345678',
    password: 'buyer-pass-123',
  });
  const { variant } = await findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
  const order = await ctx.checkout.placeOrder({
    customerId: customer.id,
    lines: [
      { productId: 'sneakers-court', variantId: variant.id, quantity },
    ],
    address: DHAKA_ADDRESS,
    paymentMethod: 'cod',
  });
  for (const status of FORWARD) {
    await ctx.ordersService.transition(order.orderNumber, { status });
  }
  return ctx.ordersService.getByNumber(order.orderNumber);
}

describe('ReturnsService', () => {
  it('refuses a return against an order that is not delivered', async () => {
    const ctx = createTestContext();
    const customer = await ctx.customers.register({
      fullName: 'Early Buyer',
      email: 'early@example.com',
      phone: '01712345679',
      password: 'buyer-pass-123',
    });
    const { variant } = await findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
    const order = await ctx.checkout.placeOrder({
      customerId: customer.id,
      lines: [
        { productId: 'sneakers-court', variantId: variant.id, quantity: 1 },
      ],
      address: DHAKA_ADDRESS,
      paymentMethod: 'cod',
    });
    await expect(
      ctx.returns.create(
        {
          orderNumber: order.orderNumber,
          kind: 'return',
          items: [{ orderItemId: order.items[0]!.id, quantity: 1 }],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('approves a full return: restocks, returns the order, hands off and completes', async () => {
    const ctx = createTestContext();
    const order = await placeDeliveredOrder(ctx, 'full@example.com');
    const item = order.items[0]!;
    const { variant } = await findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
    const stockBefore = await ctx.inventoryService.getStock(variant.id);

    const request = await ctx.returns.create(
      {
        orderNumber: order.orderNumber,
        kind: 'return',
        reason: 'Wrong size',
        items: [{ orderItemId: item.id, quantity: 2 }],
      },
      actor,
    );
    expect(request.status).toBe('requested');
    expect(request.total.amountMinor).toBe(item.unitPrice.amountMinor * 2);
    expect(request.refundState).toBe('none');

    const approved = await ctx.returns.approve(request.id, actor);
    expect(approved.status).toBe('approved');
    expect(approved.restocked).toBe(true);
    const stockAfter = await ctx.inventoryService.getStock(variant.id);
    expect(stockAfter.onHand).toBe(stockBefore.onHand + 2);
    const afterOrder = await ctx.ordersService.getByNumber(order.orderNumber);
    expect(afterOrder.status).toBe('returned');

    const handOff = await ctx.returns.handOffRefund(request.id, actor);
    // The full return moved the order to returned, and the
    // payments module settles a collected COD payment itself at
    // that moment, so the hand-off completes with the payment
    // already refunded and no new refund row.
    expect(handOff.request.refundState).toBe('handed-off');
    expect(handOff.refundId).toBeNull();
    const payments = await ctx.paymentsRepo.listByOrder(order.id);
    expect(payments[0]!.status).toBe('refunded');
    const refunds = await ctx.paymentsRepo.listRefundsByPayment(
      payments[0]!.id,
    );
    expect(refunds).toHaveLength(0);

    const completed = await ctx.returns.complete(request.id, actor);
    expect(completed.status).toBe('completed');
  });

  it('keeps the order delivered for a partial return and blocks over-returning', async () => {
    const ctx = createTestContext();
    const order = await placeDeliveredOrder(ctx, 'partial@example.com');
    const item = order.items[0]!;
    const first = await ctx.returns.create(
      {
        orderNumber: order.orderNumber,
        kind: 'return',
        items: [{ orderItemId: item.id, quantity: 1 }],
      },
      actor,
    );
    await ctx.returns.approve(first.id, actor);
    expect(
      (await ctx.ordersService.getByNumber(order.orderNumber)).status,
    ).toBe('delivered');
    // The order is still delivered, so its COD payment is still
    // collected and the hand-off creates a real refund in
    // Payments for the returned unit.
    const handOff = await ctx.returns.handOffRefund(first.id, actor);
    expect(handOff.request.refundState).toBe('handed-off');
    expect(handOff.refundId).toBeTruthy();
    const payments = await ctx.paymentsRepo.listByOrder(order.id);
    const refunds = await ctx.paymentsRepo.listRefundsByPayment(
      payments[0]!.id,
    );
    expect(refunds).toHaveLength(1);
    expect(refunds[0]!.amount.amountMinor).toBe(item.unitPrice.amountMinor);
    await expect(
      ctx.returns.create(
        {
          orderNumber: order.orderNumber,
          kind: 'return',
          items: [{ orderItemId: item.id, quantity: 2 }],
        },
        actor,
      ),
    ).rejects.toThrow(/left to return/);
  });

  it('rejects a requested return and frees its quantities', async () => {
    const ctx = createTestContext();
    const order = await placeDeliveredOrder(ctx, 'reject@example.com');
    const item = order.items[0]!;
    const request = await ctx.returns.create(
      {
        orderNumber: order.orderNumber,
        kind: 'return',
        items: [{ orderItemId: item.id, quantity: 2 }],
      },
      actor,
    );
    const rejected = await ctx.returns.reject(request.id, actor);
    expect(rejected.status).toBe('rejected');
    const again = await ctx.returns.create(
      {
        orderNumber: order.orderNumber,
        kind: 'return',
        items: [{ orderItemId: item.id, quantity: 2 }],
      },
      actor,
    );
    expect(again.status).toBe('requested');
  });

  it('marks the refund not-required for an exchange', async () => {
    const ctx = createTestContext();
    const order = await placeDeliveredOrder(ctx, 'exchange@example.com');
    const item = order.items[0]!;
    const request = await ctx.returns.create(
      {
        orderNumber: order.orderNumber,
        kind: 'exchange',
        items: [{ orderItemId: item.id, quantity: 1 }],
      },
      actor,
    );
    expect(request.refundState).toBe('not-required');
    await ctx.returns.approve(request.id, actor);
    const completed = await ctx.returns.complete(request.id, actor);
    expect(completed.status).toBe('completed');
  });
});
