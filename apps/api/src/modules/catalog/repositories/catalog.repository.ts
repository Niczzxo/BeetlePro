import type { Category, Product, ProductVariant } from '@dostelo/types';
import type { Tx } from '../../../prisma/prisma.service';

export interface ProductWithVariant {
  product: Product;
  variant: ProductVariant;
}

/**
 * Catalog persistence seam. Services depend on this interface only.
 * The Prisma implementation satisfies the same contract against
 * the Category, Product, ProductVariant and ProductMedia models in
 * packages/database/prisma/schema.prisma. All methods are async
 * (the Prisma binding is I/O-bound) and accept an optional
 * transaction client for the transactional flows in
 * docs/PRISMA_MIGRATION.md; the in-memory binding ignores it.
 */
export abstract class CatalogRepository {
  abstract listProducts(tx?: Tx): Promise<Product[]>;
  abstract findByIdOrSlug(key: string, tx?: Tx): Promise<Product | null>;
  abstract findVariant(
    productId: string,
    variantId: string,
    tx?: Tx,
  ): Promise<ProductWithVariant | null>;
  abstract listCategories(tx?: Tx): Promise<Category[]>;
  abstract findCategoryBySlugOrName(
    key: string,
    tx?: Tx,
  ): Promise<Category | null>;
}
