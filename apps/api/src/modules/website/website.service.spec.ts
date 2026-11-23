import { describe, expect, it } from 'vitest';
import { permissionsForRoles } from '@dostelo/types';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  createTestContext,
  findVariant,
} from '../../testing/test-context';

/**
 * Website (store settings) service tests: defaults are the live
 * store values, partial updates merge, and the delivery fee
 * table the editor saves is the table checkout actually charges.
 */
const actor: AuthPrincipal = {
  type: 'admin',
  id: 'admin-website-1',
  name: 'Website Tester',
  roles: ['super-admin'],
  permissions: permissionsForRoles(['super-admin']),
};

describe('WebsiteService', () => {
  it('serves the defaults and merges partial updates', async () => {
    const ctx = createTestContext();
    const before = await ctx.website.getSettings();
    expect(before.storeName).toBe('Dostelo');
    expect(before.freeDeliveryOffer).toBe(false);
    expect(before.deliveryFees).toEqual({
      dhakaCityMinor: 7000,
      dhakaSubCityMinor: 10000,
      outsideDhakaMinor: 15000,
      codFeeMinor: 1000,
    });

    const updated = await ctx.website.updateSettings(
      { storeName: 'Dostelo BD', contactPhone: '01700000000' },
      actor,
    );
    expect(updated.storeName).toBe('Dostelo BD');
    expect(updated.contactPhone).toBe('01700000000');
    expect(updated.deliveryFees.dhakaCityMinor).toBe(7000);
    const reread = await ctx.website.getSettings();
    expect(reread.storeName).toBe('Dostelo BD');
  });

  it('drives checkout fees from the saved table', async () => {
    const ctx = createTestContext();
    await ctx.website.updateSettings(
      {
        deliveryFees: {
          dhakaCityMinor: 8000,
          dhakaSubCityMinor: 11000,
          outsideDhakaMinor: 16000,
          codFeeMinor: 1500,
        },
      },
      actor,
    );
    const customer = await ctx.customers.register({
      fullName: 'Fee Buyer',
      email: 'fee@example.com',
      phone: '01712345678',
      password: 'buyer-pass-123',
    });
    // A second order for this customer, so the first-order free
    // delivery does not mask the fee table.
    const { variant } = await findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
    const address = {
      fullName: 'Fee Buyer',
      phone: '01712345678',
      addressLine: 'House 5, Road 2, Mirpur 10',
      city: 'Dhaka',
      district: 'Dhaka',
    };
    await ctx.checkout.placeOrder({
      customerId: customer.id,
      lines: [
        { productId: 'sneakers-court', variantId: variant.id, quantity: 1 },
      ],
      address,
      paymentMethod: 'cod',
    });
    const quote = await ctx.checkout.quote({
      customerId: customer.id,
      lines: [
        { productId: 'sneakers-court', variantId: variant.id, quantity: 1 },
      ],
      address,
      paymentMethod: 'cod',
    });
    expect(quote.deliveryFee.amountMinor).toBe(8000);
    expect(quote.codFee.amountMinor).toBe(1500);
  });
});
