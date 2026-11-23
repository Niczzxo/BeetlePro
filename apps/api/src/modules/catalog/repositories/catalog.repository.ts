import type { Category, Product, ProductVariant } from '@dostelo/types';

export interface ProductWithVariant {
  product: Product;
  variant: ProductVariant;
}

/**
 * Catalog persistence seam. Services depend on this interface only.
 * The Prisma implementation will satisfy the same contract against
 * the Category, Product, ProductVariant and ProductMedia models in
 * packages/database/prisma/schema.prisma.
 */
export abstract class CatalogRepository {
  abstract listProducts(): Product[];
  abstract findByIdOrSlug(key: string): Product | null;
  abstract findVariant(
    productId: string,
    variantId: string,
  ): ProductWithVariant | null;
  abstract listCategories(): Category[];
  abstract findCategoryBySlugOrName(key: string): Category | null;
}
