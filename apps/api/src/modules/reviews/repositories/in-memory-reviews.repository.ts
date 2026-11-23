import { Injectable } from '@nestjs/common';
import type { ProductReview } from '@dostelo/types';
import { InMemoryDatabase } from '../../../store/in-memory.store';
import {
  ReviewsRepository,
  type ReviewFilter,
} from './reviews.repository';

@Injectable()
export class InMemoryReviewsRepository extends ReviewsRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async create(review: ProductReview): Promise<ProductReview> {
    this.db.productReviews.set(review.id, review);
    return review;
  }

  async save(review: ProductReview): Promise<void> {
    this.db.productReviews.set(review.id, review);
  }

  async findById(id: string): Promise<ProductReview | null> {
    return this.db.productReviews.get(id) ?? null;
  }

  async list(filter?: ReviewFilter): Promise<ProductReview[]> {
    return [...this.db.productReviews.values()]
      .filter(
        (review) =>
          (!filter?.productId || review.productId === filter.productId) &&
          (!filter?.status || review.status === filter.status),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
