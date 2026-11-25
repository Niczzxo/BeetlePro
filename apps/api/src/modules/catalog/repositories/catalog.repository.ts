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
/** Reference counts that block a hard product delete: order
 * lines, cart lines, live stock reservations and reviews. A
 * referenced product is archived instead of deleted, so order
 * history never loses the product it points at. */
export interface ProductReferenceCounts {
  orderItems: number;
  cartItems: number;
  reservations: number;
  reviews: number;
}

export abstract class CatalogRepository {
  abstract listProducts(tx?: Tx): Promise<Product[]>;
  abstract findByIdOrSlug(key: string, tx?: Tx): Promise<Product | null>;
  /** Persists a fully built product (the service assigns ids and
   * validates uniqueness). New variants also initialise their
   * stock record at the given on-hand quantity. */
  abstract createProduct(product: Product, tx?: Tx): Promise<Product>;
  /** Replaces a product's fields, media and variant set. Variants
   * are matched by id; variants absent from the incoming set are
   * kept (the update shape never deletes variants). Stock records
   * follow the incoming on-hand values and keep their reserved
   * quantities. */
  abstract updateProduct(product: Product, tx?: Tx): Promise<Product>;
  abstract deleteProduct(id: string, tx?: Tx): Promise<boolean>;
  abstract countProductReferences(
    id: string,
    tx?: Tx,
  ): Promise<ProductReferenceCounts>;
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
