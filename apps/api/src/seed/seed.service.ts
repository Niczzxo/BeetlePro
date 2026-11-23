import { Injectable, type OnModuleInit } from '@nestjs/common';
import { money, type Category, type Product } from '@dostelo/types';
import { slugify } from '../common/parse-body';
import { InMemoryDatabase } from '../store/in-memory.store';
import { SEED_CATEGORIES, SEED_PRODUCTS } from './catalog.seed';

/**
 * Seeds the in-memory store with the real Dostelo catalogue.
 *
 * The seed data is generated from apps/storefront/src/data/
 * products.ts (see scripts/generate-seed.mjs), which carries the
 * legacy storefront's own products, prices and stock. Mapping notes:
 *
 * - Storefront prices are whole taka; domain Money is minor units,
 *   so prices are multiplied by 100. A compare-at price of 0 in the
 *   storefront data means none, and maps to null.
 * - The storefront tracks stock per product, not per variant. Each
 *   generated size/colour variant therefore starts with the
 *   product's stock figure in the inventory stock map, and the
 *   inventory module owns stock from there. Per-variant stock
 *   management arrives with the admin portal phase.
 * - Variant ids and SKUs are derived deterministically from the
 *   product id, colour and size so re-seeding is stable.
 */
@Injectable()
export class SeedService implements OnModuleInit {
  constructor(private readonly db: InMemoryDatabase) {}

  onModuleInit(): void {
    if (this.db.products.size > 0) return;
    const now = new Date().toISOString();

    const categoryIdByName = new Map<string, string>();
    SEED_CATEGORIES.forEach((seedCategory, index) => {
      const slug = slugify(seedCategory.name);
      const category: Category = {
        id: `cat-${slug}`,
        slug,
        name: seedCategory.name,
        parentId: null,
        position: index,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      this.db.categories.set(category.id, category);
      categoryIdByName.set(category.name, category.id);
    });

    for (const seed of SEED_PRODUCTS) {
      let categoryId = categoryIdByName.get(seed.cat);
      if (!categoryId) {
        const slug = slugify(seed.cat);
        const category: Category = {
          id: `cat-${slug}`,
          slug,
          name: seed.cat,
          parentId: null,
          position: this.db.categories.size,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        };
        this.db.categories.set(category.id, category);
        categoryIdByName.set(category.name, category.id);
        categoryId = category.id;
      }

      const colours: (string | null)[] =
        seed.vars.length > 0
          ? seed.vars.map((variant) => variant[0])
          : [null];
      const variants = colours.flatMap((colour) =>
        seed.sizes.map((size) => {
          const variantId = [
            seed.id,
            slugify(colour ?? 'std'),
            slugify(size),
          ].join('--');
          return {
            id: variantId,
            productId: seed.id,
            sku: variantId.toUpperCase(),
            name: colour ? `${colour} / ${size}` : size,
            size,
            colour,
            price: money(seed.price * 100),
            compareAtPrice:
              seed.was > 0 ? money(seed.was * 100) : null,
            stock: seed.stock,
            isActive: true,
          };
        }),
      );

      const product: Product = {
        id: seed.id,
        slug: seed.id,
        name: seed.name,
        categoryId,
        description: seed.desc,
        status: 'active',
        isFeatured: seed.badge === 'Bestseller',
        isBestSeller: seed.badge === 'Bestseller',
        isNewArrival: seed.badge === 'New',
        tags: seed.badge ? [seed.badge] : [],
        variants,
        media: seed.gallery.map((url, index) => ({
          id: `${seed.id}-media-${index}`,
          productId: seed.id,
          type: 'image' as const,
          url,
          alt: seed.name,
          position: index,
        })),
        createdAt: now,
        updatedAt: now,
      };
      this.db.products.set(product.id, product);
      for (const variant of variants) {
        this.db.stock.set(variant.id, {
          productId: seed.id,
          onHand: seed.stock,
          reserved: 0,
        });
      }
    }
  }
}
