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

  async listProducts(): Promise<Product[]> {
    return [...this.db.products.values()].map((product) =>
      this.withLiveStock(product),
    );
  }

  async findByIdOrSlug(key: string): Promise<Product | null> {
    const product =
      this.db.products.get(key) ??
      [...this.db.products.values()].find((p) => p.slug === key);
    return product ? this.withLiveStock(product) : null;
  }

  async findVariant(
    productId: string,
    variantId: string,
  ): Promise<ProductWithVariant | null> {
    const product = await this.findByIdOrSlug(productId);
    if (!product) return null;
    const variant = product.variants.find((v) => v.id === variantId);
    return variant ? { product, variant } : null;
  }

  async listCategories(): Promise<Category[]> {
    return [...this.db.categories.values()].sort(
      (a, b) => a.position - b.position,
    );
  }

  async findCategoryBySlugOrName(key: string): Promise<Category | null> {
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
