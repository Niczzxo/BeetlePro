import { Injectable } from '@nestjs/common';
import type { Category, Product } from '@dostelo/types';
import { slugify } from '../../../common/parse-body';
import { InMemoryDatabase } from '../../../store/in-memory.store';
import {
  CatalogRepository,
  type ProductWithVariant,
} from './catalog.repository';

/**
 * In-memory catalog repository over the seeded store. Variant stock
 * is overlaid from the inventory stock map on every read, so the
 * stock map stays the single source of truth after seeding.
 */
@Injectable()
export class InMemoryCatalogRepository extends CatalogRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  private withLiveStock(product: Product): Product {
    return {
      ...product,
      variants: product.variants.map((variant) => {
        const record = this.db.stock.get(variant.id);
        return record ? { ...variant, stock: record.onHand } : variant;
      }),
    };
  }

  listProducts(): Product[] {
    return [...this.db.products.values()].map((product) =>
      this.withLiveStock(product),
    );
  }

  findByIdOrSlug(key: string): Product | null {
    const product =
      this.db.products.get(key) ??
      [...this.db.products.values()].find((p) => p.slug === key);
    return product ? this.withLiveStock(product) : null;
  }

  findVariant(
    productId: string,
    variantId: string,
  ): ProductWithVariant | null {
    const product = this.findByIdOrSlug(productId);
    if (!product) return null;
    const variant = product.variants.find((v) => v.id === variantId);
    return variant ? { product, variant } : null;
  }

  listCategories(): Category[] {
    return [...this.db.categories.values()].sort(
      (a, b) => a.position - b.position,
    );
  }

  findCategoryBySlugOrName(key: string): Category | null {
    const slug = slugify(key);
    return (
      [...this.db.categories.values()].find(
        (category) =>
          category.slug === slug ||
          category.name.toLowerCase() === key.toLowerCase(),
      ) ?? null
    );
  }
}
