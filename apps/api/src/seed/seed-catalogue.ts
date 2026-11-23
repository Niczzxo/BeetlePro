import { money, type Category, type Product } from '@dostelo/types';
import { slugify } from '../common/parse-body';
import { SEED_CATEGORIES, SEED_PRODUCTS } from './catalog.seed';

/**
 * Builds the seed catalogue as domain objects, shared by the
 * in-memory SeedService and the Prisma seed service so both
 * bindings start from exactly the same catalogue.
 *
 * The seed data is generated from apps/storefront/src/data/
 * products.ts (see scripts/generate-seed.mjs), which carries the
 * legacy storefront's own products, prices and stock. Mapping
 * notes:
 *
 * - Storefront prices are whole taka; domain Money is minor
 *   units, so prices are multiplied by 100. A compare-at price
 *   of 0 in the storefront data means none, and maps to null.
 * - The storefront tracks stock per product, not per variant.
 *   Each generated size/colour variant therefore carries the
 *   product's stock figure, and the inventory module owns stock
 *   from there. Per-variant stock management arrives with the
 *   admin portal phase.
 * - Variant ids and SKUs are derived deterministically from the
 *   product id, colour and size so re-seeding is stable.
 * - Category ids are `cat-<slug>` of the category name.
 */
export function buildSeedCatalogue(now: string): {
  categories: Category[];
  products: Product[];
} {
  const categories: Category[] = [];
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
    categories.push(category);
    categoryIdByName.set(category.name, category.id);
  });

  const products: Product[] = [];
  for (const seed of SEED_PRODUCTS) {
    let categoryId = categoryIdByName.get(seed.cat);
    if (!categoryId) {
      const slug = slugify(seed.cat);
      const category: Category = {
        id: `cat-${slug}`,
        slug,
        name: seed.cat,
        parentId: null,
        position: categories.length,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      categories.push(category);
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
          compareAtPrice: seed.was > 0 ? money(seed.was * 100) : null,
          stock: seed.stock,
          isActive: true,
        };
      }),
    );

    products.push({
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
    });
  }

  return { categories, products };
}
