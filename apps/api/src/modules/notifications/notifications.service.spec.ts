import { describe, expect, it } from 'vitest';
import { permissionsForRoles } from '@dostelo/types';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  createTestContext,
  findVariant,
} from '../../testing/test-context';

/**
 * Notifications service tests: the feed derives from pending
 * orders and low stock, and read marks are per staff member.
 */
const principal: AuthPrincipal = {
  type: 'admin',
  id: 'admin-notifications-1',
  name: 'Notifications Tester',
  roles: ['super-admin'],
  permissions: permissionsForRoles(['super-admin']),
};

const otherPrincipal: AuthPrincipal = {
  ...principal,
  id: 'admin-notifications-2',
};

describe('NotificationsService', () => {
  it('derives a pending-order notification and tracks read state per staff member', async () => {
    const ctx = createTestContext();
    const customer = await ctx.customers.register({
      fullName: 'Feed Buyer',
      email: 'feed@example.com',
      phone: '01712345678',
      password: 'buyer-pass-123',
    });
    const { variant } = await findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
    const order = await ctx.checkout.placeOrder({
      customerId: customer.id,
      lines: [
        { productId: 'sneakers-court', variantId: variant.id, quantity: 1 },
      ],
      address: {
        fullName: 'Feed Buyer',
        phone: '01712345678',
        addressLine: 'House 5, Road 2, Mirpur 10',
        city: 'Dhaka',
        district: 'Dhaka',
      },
      paymentMethod: 'cod',
    });

    const feed = await ctx.notifications.feed(principal);
    const orderNote = feed.items.find(
      (item) => item.key === `order:${order.orderNumber}`,
    );
    expect(orderNote).toBeDefined();
    expect(orderNote!.kind).toBe('new-order');
    expect(orderNote!.read).toBe(false);
    expect(feed.unread).toBeGreaterThan(0);

    const marked = await ctx.notifications.markRead(principal, [
      `order:${order.orderNumber}`,
    ]);
    expect(marked.marked).toBe(1);
    const after = await ctx.notifications.feed(principal);
    expect(
      after.items.find((item) => item.key === `order:${order.orderNumber}`)!
        .read,
    ).toBe(true);

    const other = await ctx.notifications.feed(otherPrincipal);
    expect(
      other.items.find((item) => item.key === `order:${order.orderNumber}`)!
        .read,
    ).toBe(false);

    // Once the order leaves pending, its notification goes away.
    await ctx.ordersService.transition(order.orderNumber, {
      status: 'confirmed',
    });
    const confirmed = await ctx.notifications.feed(principal);
    expect(
      confirmed.items.some(
        (item) => item.key === `order:${order.orderNumber}`,
      ),
    ).toBe(false);
  });

  it('derives a low-stock notification when availability drops to the threshold', async () => {
    const ctx = createTestContext();
    const { variant } = await findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
    const stock = await ctx.inventoryService.getStock(variant.id);
    await ctx.inventoryService.adjust(variant.id, {
      delta: -(stock.available - 3),
      reason: 'Test setup: force low stock',
    });
    const feed = await ctx.notifications.feed(principal);
    const note = feed.items.find(
      (item) => item.key === `low-stock:${variant.id}`,
    );
    expect(note).toBeDefined();
    expect(note!.kind).toBe('low-stock');
    expect(note!.detail).toContain('3 available');
  });
});
