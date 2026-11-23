import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  createTestContext,
  findVariant,
} from '../../testing/test-context';

describe('CartsService stock validation', () => {
  it('computes line totals and the subtotal from catalog prices', () => {
    const ctx = createTestContext();
    const { variant } = findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
    const cart = ctx.cartsService.createCart({});
    const view = ctx.cartsService.addLine(cart.id, {
      productId: 'sneakers-court',
      variantId: variant.id,
      quantity: 2,
    });
    expect(view.items).toHaveLength(1);
    expect(view.items[0]?.lineTotal.amountMinor).toBe(2 * 185000);
    expect(view.subtotal.amountMinor).toBe(2 * 185000);
  });

  it('rejects adding more than the available stock', () => {
    const ctx = createTestContext();
    // Court White Sneakers stock is 24 per variant.
    const { variant } = findVariant(ctx, 'sneakers-court', 'EU 42', 'Black');
    const cart = ctx.cartsService.createCart({});
    expect(() =>
      ctx.cartsService.addLine(cart.id, {
        productId: 'sneakers-court',
        variantId: variant.id,
        quantity: 25,
      }),
    ).toThrow(BadRequestException);
  });

  it('counts the quantity already in the cart when validating', () => {
    const ctx = createTestContext();
    const { variant } = findVariant(ctx, 'sneakers-court', 'EU 42', 'Black');
    const cart = ctx.cartsService.createCart({});
    ctx.cartsService.addLine(cart.id, {
      productId: 'sneakers-court',
      variantId: variant.id,
      quantity: 24,
    });
    expect(() =>
      ctx.cartsService.addLine(cart.id, {
        productId: 'sneakers-court',
        variantId: variant.id,
        quantity: 1,
      }),
    ).toThrow(BadRequestException);
  });

  it('removes a line when its quantity is updated to zero', () => {
    const ctx = createTestContext();
    const { variant } = findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
    const cart = ctx.cartsService.createCart({});
    const view = ctx.cartsService.addLine(cart.id, {
      productId: 'sneakers-court',
      variantId: variant.id,
      quantity: 1,
    });
    const lineId = view.items[0]?.id as string;
    const after = ctx.cartsService.updateLine(cart.id, lineId, {
      quantity: 0,
    });
    expect(after.items).toHaveLength(0);
    expect(after.subtotal.amountMinor).toBe(0);
  });
});
