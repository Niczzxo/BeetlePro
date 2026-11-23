import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { permissionsForRoles } from '@dostelo/types';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  createTestContext,
  findVariant,
} from '../../testing/test-context';

/**
 * Reviews service tests: staff-entered reviews start pending,
 * the verified-purchase source is earned only by a delivered
 * order containing the product, and moderation moves reviews
 * between pending, approved and hidden.
 */
const actor: AuthPrincipal = {
  type: 'admin',
  id: 'admin-reviews-1',
  name: 'Reviews Tester',
  roles: ['super-admin'],
  permissions: permissionsForRoles(['super-admin']),
};

const DHAKA_ADDRESS = {
  fullName: 'Review Buyer',
  phone: '01712345678',
  addressLine: 'House 5, Road 2, Mirpur 10',
  city: 'Dhaka',
  district: 'Dhaka',
};

describe('ReviewsService', () => {
  it('creates a pending staff-entered review and moderates it', async () => {
    const ctx = createTestContext();
    const review = await ctx.reviews.create(
      {
        productId: 'sneakers-court',
        authorName: 'Phone Caller',
        rating: 5,
        body: 'Very comfortable, called to say thanks.',
      },
      actor,
    );
    expect(review.status).toBe('pending');
    expect(review.source).toBe('staff-entered');
    expect(review.productId).toBe('sneakers-court');

    const approved = await ctx.reviews.setStatus(
      review.id,
      'approved',
      actor,
    );
    expect(approved.status).toBe('approved');
    const hidden = await ctx.reviews.setStatus(review.id, 'hidden', actor);
    expect(hidden.status).toBe('hidden');
    const listed = await ctx.reviews.list({ status: 'hidden' });
    expect(listed.map((entry) => entry.id)).toEqual([review.id]);
  });

  it('refuses a review for an unknown product', async () => {
    const ctx = createTestContext();
    await expect(
      ctx.reviews.create(
        {
          productId: 'no-such-product',
          authorName: 'Nobody',
          rating: 3,
          body: 'Text',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks verified-purchase only with a delivered order for the product', async () => {
    const ctx = createTestContext();
    const customer = await ctx.customers.register({
      fullName: 'Verified Buyer',
      email: 'verified@example.com',
      phone: '01712345673',
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
    const beforeDelivery = await ctx.reviews.create(
      {
        productId: 'sneakers-court',
        customerId: customer.id,
        authorName: 'Verified Buyer',
        rating: 4,
        body: 'Good so far.',
      },
      actor,
    );
    expect(beforeDelivery.source).toBe('staff-entered');

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
    const afterDelivery = await ctx.reviews.create(
      {
        productId: 'sneakers-court',
        customerId: customer.id,
        authorName: 'Verified Buyer',
        rating: 5,
        body: 'Wore them all week.',
      },
      actor,
    );
    expect(afterDelivery.source).toBe('verified-purchase');
  });
});
