import type { ProductReview, ReviewStatus } from '@dostelo/types';
import type { Tx } from '../../../prisma/prisma.service';

export interface ReviewFilter {
  productId?: string;
  status?: ReviewStatus;
}

/** Reviews persistence seam, over the ProductReview model in the
 * Prisma implementation. */
export abstract class ReviewsRepository {
  abstract create(
    review: ProductReview,
    tx?: Tx,
  ): Promise<ProductReview>;
  abstract save(review: ProductReview, tx?: Tx): Promise<void>;
  abstract findById(
    id: string,
    tx?: Tx,
  ): Promise<ProductReview | null>;
  abstract list(
    filter?: ReviewFilter,
    tx?: Tx,
  ): Promise<ProductReview[]>;
}
