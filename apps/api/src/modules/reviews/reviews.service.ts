import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  ProductReview,
  ReviewSource,
  ReviewStatus,
} from '@dostelo/types';
import type { CreateReview } from '@dostelo/validation';
import type { AuthPrincipal } from '../../common/auth/principal';
import { AuditService } from '../audit/audit.service';
import { CatalogRepository } from '../catalog/repositories/catalog.repository';
import { OrdersRepository } from '../orders/repositories/orders.repository';
import {
  ReviewsRepository,
  type ReviewFilter,
} from './repositories/reviews.repository';

/**
 * Product reviews and moderation (admin master structure module
 * 16). The migrated storefront has no review submission surface,
 * so reviews are staff-entered and start pending. The source is
 * 'verified-purchase' only when the review names a customer who
 * actually has a delivered order containing the product; staff
 * cannot assert it otherwise.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly reviews: ReviewsRepository,
    private readonly catalog: CatalogRepository,
    private readonly orders: OrdersRepository,
    @Optional() private readonly audit?: AuditService,
  ) {}

  async create(
    dto: CreateReview,
    actor?: AuthPrincipal | null,
  ): Promise<ProductReview> {
    const product = await this.catalog.findByIdOrSlug(dto.productId);
    if (!product) {
      throw new BadRequestException(`Unknown product: ${dto.productId}`);
    }
    let source: ReviewSource = 'staff-entered';
    if (dto.customerId) {
      const customerOrders = await this.orders.listByCustomer(
        dto.customerId,
      );
      const verified = customerOrders.some(
        (order) =>
          order.status === 'delivered' &&
          order.items.some((item) => item.productId === product.id),
      );
      if (verified) source = 'verified-purchase';
    }
    const now = new Date().toISOString();
    const review: ProductReview = {
      id: randomUUID(),
      productId: product.id,
      customerId: dto.customerId ?? null,
      authorName: dto.authorName,
      rating: dto.rating,
      title: dto.title ?? null,
      body: dto.body,
      status: 'pending',
      source,
      createdAt: now,
      updatedAt: now,
    };
    await this.reviews.create(review);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'review.created',
        entityType: 'product-review',
        entityId: review.id,
        metadata: {
          productId: review.productId,
          rating: review.rating,
          source: review.source,
        },
      });
    }
    return review;
  }

  async list(filter?: ReviewFilter): Promise<ProductReview[]> {
    return this.reviews.list(filter);
  }

  async setStatus(
    id: string,
    status: ReviewStatus,
    actor?: AuthPrincipal | null,
  ): Promise<ProductReview> {
    const review = await this.reviews.findById(id);
    if (!review) {
      throw new NotFoundException(`Review not found: ${id}`);
    }
    review.status = status;
    review.updatedAt = new Date().toISOString();
    await this.reviews.save(review);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'review.status-changed',
        entityType: 'product-review',
        entityId: review.id,
        metadata: { status, productId: review.productId },
      });
    }
    return review;
  }
}
