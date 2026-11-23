import { describe, expect, it } from 'vitest';
import {
  createTestContext,
  findVariant,
} from '../../testing/test-context';

/**
 * Reports service tests: the summary aggregates the orders,
 * payments and recovery stores without owning data of its own.
 */
describe('ReportsService', () => {
  it('aggregates sales, zones, payment methods and top products', async () => {
    const ctx = createTestContext();
    const customer = await ctx.customers.register({
      fullName: 'Report Buyer',
      email: 'report@example.com',
      phone: '01712345678',
      password: 'buyer-pass-123',
    });
    const { variant } = await findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
    const order = await ctx.checkout.placeOrder({
      customerId: customer.id,
      lines: [
        { productId: 'sneakers-court', variantId: variant.id, quantity: 2 },
      ],
      address: {
        fullName: 'Report Buyer',
        phone: '01712345678',
        addressLine: 'House 5, Road 2, Mirpur 10',
        city: 'Dhaka',
        district: 'Dhaka',
      },
      paymentMethod: 'cod',
    });

    const summary = await ctx.reports.summary();
    expect(summary.orderCount).toBe(1);
    expect(summary.revenueMinor).toBe(order.total.amountMinor);
    expect(summary.salesByDay).toHaveLength(1);
    expect(summary.salesByDay[0]!.orders).toBe(1);
    expect(summary.zoneSplit).toEqual([
      {
        zone: 'dhaka-city',
        orders: 1,
        revenueMinor: order.total.amountMinor,
      },
    ]);
    expect(summary.paymentSplit).toEqual([
      {
        method: 'cod',
        payments: 1,
        amountMinor: order.total.amountMinor,
      },
    ]);
    expect(summary.topProducts[0]).toMatchObject({
      productId: 'sneakers-court',
      quantity: 2,
      revenueMinor: 370000,
    });
    expect(summary.recovery.detected).toBe(0);
    expect(summary.recovery.recoveryRatePercent).toBe(0);
  });

  it('excludes cancelled orders and out-of-window orders from revenue', async () => {
    const ctx = createTestContext();
    const customer = await ctx.customers.register({
      fullName: 'Cancel Buyer',
      email: 'cancel-report@example.com',
      phone: '01712345679',
      password: 'buyer-pass-123',
    });
    const { variant } = await findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
    const order = await ctx.checkout.placeOrder({
      customerId: customer.id,
      lines: [
        { productId: 'sneakers-court', variantId: variant.id, quantity: 1 },
      ],
      address: {
        fullName: 'Cancel Buyer',
        phone: '01712345679',
        addressLine: 'House 5, Road 2, Mirpur 10',
        city: 'Dhaka',
        district: 'Dhaka',
      },
      paymentMethod: 'cod',
    });
    await ctx.ordersService.transition(order.orderNumber, {
      status: 'cancelled',
    });
    const summary = await ctx.reports.summary();
    expect(summary.orderCount).toBe(0);
    expect(summary.revenueMinor).toBe(0);

    const past = await ctx.reports.summary({
      from: '2020-01-01T00:00:00.000Z',
      to: '2020-01-31T00:00:00.000Z',
    });
    expect(past.orderCount).toBe(0);
  });
});
