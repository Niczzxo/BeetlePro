import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { CheckoutRequest } from '@dostelo/validation';
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

const SAVAR_ADDRESS = {
  fullName: 'Test Buyer',
  phone: '01712345678',
  addressLine: 'Savar Bazar Stand',
  city: 'Dhaka',
  district: 'Dhaka',
};

function requestFor(
  ctx: TestContext,
  overrides: Partial<CheckoutRequest> = {},
): CheckoutRequest {
  const { variant } = findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
  return {
    lines: [
      {
        productId: 'sneakers-court',
        variantId: variant.id,
        quantity: 1,
      },
    ],
    address: DHAKA_ADDRESS,
    paymentMethod: 'cod',
    ...overrides,
  };
}

async function registerCustomer(ctx: TestContext) {
  return ctx.customers.register({
    fullName: 'Repeat Buyer',
    email: 'repeat@example.com',
    phone: '01812345678',
    password: 'password123',
  });
}

describe('CheckoutService totals', () => {
  it('waives the zone fee on a first order but still charges the COD fee', () => {
    const ctx = createTestContext();
    const quote = ctx.checkout.quote(requestFor(ctx));
    // Court White Sneakers: 1850 taka = 185000 minor.
    expect(quote.subtotal.amountMinor).toBe(185000);
    expect(quote.zone).toBe('dhaka-city');
    expect(quote.deliveryFee.amountMinor).toBe(0);
    expect(quote.firstOrderFreeDelivery).toBe(true);
    expect(quote.freeDeliveryReason).toBe('first-order');
    // COD adds its 10 taka even when delivery is free.
    expect(quote.codFee.amountMinor).toBe(1000);
    expect(quote.total.amountMinor).toBe(186000);
  });

  it('charges the Dhaka city fee of 70 taka on a second order', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    const first = ctx.checkout.placeOrder(
      requestFor(ctx, { customerId: customer.id }),
    );
    expect(first.deliveryFee.amountMinor).toBe(0);
    expect(first.firstOrderFreeDelivery).toBe(true);

    const quote = ctx.checkout.quote(
      requestFor(ctx, { customerId: customer.id }),
    );
    expect(quote.deliveryFee.amountMinor).toBe(7000);
    expect(quote.firstOrderFreeDelivery).toBe(false);
    expect(quote.codFee.amountMinor).toBe(1000);
    expect(quote.total.amountMinor).toBe(185000 + 7000 + 1000);
  });

  it('charges the sub city fee of 100 taka for a Savar address', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    ctx.checkout.placeOrder(requestFor(ctx, { customerId: customer.id }));
    const quote = ctx.checkout.quote(
      requestFor(ctx, {
        customerId: customer.id,
        address: SAVAR_ADDRESS,
      }),
    );
    expect(quote.zone).toBe('dhaka-sub-city');
    expect(quote.deliveryFee.amountMinor).toBe(10000);
    expect(quote.codFee.amountMinor).toBe(1000);
    expect(quote.total.amountMinor).toBe(185000 + 10000 + 1000);
  });

  it('charges 150 taka outside Dhaka and no COD fee for online payment', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    ctx.checkout.placeOrder(requestFor(ctx, { customerId: customer.id }));
    const quote = ctx.checkout.quote(
      requestFor(ctx, {
        customerId: customer.id,
        paymentMethod: 'bkash',
        address: {
          ...DHAKA_ADDRESS,
          addressLine: 'Zindabazar',
          city: 'Sylhet',
          district: 'Sylhet',
        },
      }),
    );
    expect(quote.zone).toBe('outside-dhaka');
    expect(quote.deliveryFee.amountMinor).toBe(15000);
    expect(quote.codFee.amountMinor).toBe(0);
    expect(quote.total.amountMinor).toBe(185000 + 15000);
  });

  it('waives the zone fee for everyone while the admin offer switch is on', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    ctx.checkout.placeOrder(requestFor(ctx, { customerId: customer.id }));
    ctx.db.settings.freeDeliveryOffer = true;
    const quote = ctx.checkout.quote(
      requestFor(ctx, { customerId: customer.id }),
    );
    expect(quote.deliveryFee.amountMinor).toBe(0);
    expect(quote.freeDeliveryReason).toBe('admin-offer');
    expect(quote.firstOrderFreeDelivery).toBe(false);
    expect(quote.codFee.amountMinor).toBe(1000);
  });
});

describe('CheckoutService order placement', () => {
  it('creates a pending order with a legacy BP number and reserves stock', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    const { variant } = findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
    const before = ctx.inventoryService.availableFor(variant.id);
    const order = ctx.checkout.placeOrder(
      requestFor(ctx, {
        customerId: customer.id,
        lines: [
          {
            productId: 'sneakers-court',
            variantId: variant.id,
            quantity: 2,
          },
        ],
      }),
    );
    expect(order.orderNumber).toMatch(/^BP-\d{6}$/);
    expect(order.status).toBe('pending');
    expect(order.customerId).toBe(customer.id);
    expect(order.total.amountMinor).toBe(2 * 185000 + 1000);
    expect(ctx.inventoryService.availableFor(variant.id)).toBe(before - 2);
    const stock = ctx.inventoryService.getStock(variant.id);
    expect(stock.reserved).toBe(2);
    // The order is recorded against the customer.
    expect(ctx.orders.countByCustomer(customer.id)).toBe(1);
    expect(ctx.orders.listStatusEvents(order.id)).toHaveLength(1);
  });

  it('rejects an order that exceeds available stock', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    const { variant } = findVariant(ctx, 'canvas-classic', 'EU 41');
    // Classic Canvas Shoes stock is 32 per variant.
    expect(() =>
      ctx.checkout.placeOrder(
        requestFor(ctx, {
          customerId: customer.id,
          lines: [
            {
              productId: 'canvas-classic',
              variantId: variant.id,
              quantity: 40,
            },
          ],
        }),
      ),
    ).toThrow(BadRequestException);
    expect(ctx.orders.countByCustomer(customer.id)).toBe(0);
  });

  it('requires a customer to place an order', () => {
    const ctx = createTestContext();
    expect(() => ctx.checkout.placeOrder(requestFor(ctx))).toThrow(
      BadRequestException,
    );
  });
});
