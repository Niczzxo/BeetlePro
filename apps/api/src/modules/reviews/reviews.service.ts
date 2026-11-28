import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  REVIEW_TRANSITIONS,
  type ProductReview,
  type ReviewReply,
  type ReviewSource,
  type ReviewStatus,
} from '@dostelo/types';
import type {
  CreateReview,
  ReviewRequestCreate,
} from '@dostelo/validation';
import type { AuthPrincipal } from '../../common/auth/principal';
import { AuditService } from '../audit/audit.service';
import { CatalogRepository } from '../catalog/repositories/catalog.repository';
import { CommunicationsService } from '../communications/communications.service';
import { CustomersRepository } from '../customers/repositories/customers.repository';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { OrdersRepository } from '../orders/repositories/orders.repository';
import {
  ReviewsRepository,
  type ReviewFilter,
} from './repositories/reviews.repository';

/**
 * Product reviews and moderation (admin master structure module
 * 16). Reviews are staff-entered and always start pending and
 * unverified. Verification is a server check, never a toggle:
 * when a customer and an order are named, the server confirms
 * that customer has a delivered order containing the product
 * (the named order, when one is given) and only then marks the
 * review verified, recording the reason either way. Moderation
 * follows the transition map and is audited; approving a
 * verified review awards loyalty points through the loyalty
 * rules engine when that rule is active.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly reviews: ReviewsRepository,
    private readonly catalog: CatalogRepository,
    private readonly orders: OrdersRepository,
    @Optional() private readonly audit?: AuditService,
    @Optional() private readonly loyalty?: LoyaltyService,
    @Optional() private readonly communications?: CommunicationsService,
    @Optional() private readonly customers?: CustomersRepository,
  ) {}

  async create(
    dto: CreateReview,
    actor?: AuthPrincipal | null,
  ): Promise<ProductReview> {
    const product = await this.catalog.findByIdOrSlug(dto.productId);
    if (!product) {
      throw new BadRequestException(`Unknown product: ${dto.productId}`);
    }
    let verified = false;
    let verificationNote: string | null =
      'Not verified: no customer was supplied to check a purchase against.';
    if (dto.customerId) {
      const customerOrders = await this.orders.listByCustomer(dto.customerId);
      const candidates = dto.orderNumber
        ? customerOrders.filter(
            (order) => order.orderNumber === dto.orderNumber,
          )
        : customerOrders;
      const match = candidates.find(
        (order) =>
          order.status === 'delivered' &&
          order.items.some((item) => item.productId === product.id),
      );
      if (match) {
        verified = true;
        verificationNote = `Verified against delivered order ${match.orderNumber} containing this product.`;
      } else if (dto.orderNumber && candidates.length === 0) {
        verificationNote = `Not verified: order ${dto.orderNumber} was not found for this customer.`;
      } else if (dto.orderNumber) {
        verificationNote = `Not verified: order ${dto.orderNumber} is not a delivered order containing this product.`;
      } else {
        verificationNote =
          'Not verified: this customer has no delivered order containing this product.';
      }
    }
    const source: ReviewSource = verified
      ? 'verified-purchase'
      : 'staff-entered';
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
      verified,
      verificationNote,
      orderNumber: dto.orderNumber ?? null,
      flagReason: null,
      replies: [],
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
          verified: review.verified,
        },
      });
    }
    return review;
  }

  async list(filter?: ReviewFilter): Promise<ProductReview[]> {
    return this.reviews.list(filter);
  }

  /** Published reviews for one product: the public read the
   * Next.js storefront uses for ratings. The static Pages site
   * does not read this store; it keeps its own built-in reviews
   * section. */
  async listPublic(productId: string): Promise<ProductReview[]> {
    const product = await this.catalog.findByIdOrSlug(productId);
    if (!product) return [];
    const all = await this.reviews.list({ productId: product.id });
    return all.filter((review) => review.status === 'approved');
  }

  /** The public read model the storefront product page renders:
   * the approved reviews plus the rating summary computed here,
   * server-side, from exactly those reviews (average, count and
   * the per-star distribution). The client never averages or
   * counts on its own. */
  async listPublicWithSummary(
    productId: string,
  ): Promise<{ items: ProductReview[]; summary: { average: number; count: number; distribution: Record<string, number> } }> {
    const items = await this.listPublic(productId);
    const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    let total = 0;
    for (const review of items) {
      total += review.rating;
      const key = String(Math.min(5, Math.max(1, Math.round(review.rating))));
      distribution[key] = (distribution[key] ?? 0) + 1;
    }
    return {
      items,
      summary: {
        average: items.length ? total / items.length : 0,
        count: items.length,
        distribution,
      },
    };
  }

  async setStatus(
    id: string,
    status: ReviewStatus,
    actor?: AuthPrincipal | null,
    reason?: string,
  ): Promise<ProductReview> {
    const review = await this.reviews.findById(id);
    if (!review) {
      throw new NotFoundException(`Review not found: ${id}`);
    }
    if (review.status !== status) {
      const allowed = REVIEW_TRANSITIONS[review.status];
      if (!allowed.includes(status)) {
        throw new BadRequestException(
          `Review ${id} cannot move from ${review.status} to ${status}`,
        );
      }
    }
    review.status = status;
    if (status === 'flagged') review.flagReason = reason ?? null;
    if (status === 'approved' || status === 'pending') {
      review.flagReason = null;
    }
    review.updatedAt = new Date().toISOString();
    await this.reviews.save(review);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'review.status-changed',
        entityType: 'product-review',
        entityId: review.id,
        metadata: {
          status,
          reason: reason ?? null,
          productId: review.productId,
        },
      });
    }
    if (status === 'approved' && review.verified && this.loyalty) {
      await this.loyalty.awardForReview(review);
    }
    return review;
  }

  async addReply(
    id: string,
    body: string,
    actor?: AuthPrincipal | null,
  ): Promise<ProductReview> {
    const review = await this.reviews.findById(id);
    if (!review) {
      throw new NotFoundException(`Review not found: ${id}`);
    }
    const reply: ReviewReply = {
      id: randomUUID(),
      authorId: actor?.id ?? null,
      authorName: actor?.name ?? 'Staff',
      body,
      createdAt: new Date().toISOString(),
    };
    review.replies = [...review.replies, reply];
    review.updatedAt = new Date().toISOString();
    await this.reviews.save(review);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'review.reply-added',
        entityType: 'product-review',
        entityId: review.id,
        metadata: { replyId: reply.id },
      });
    }
    return review;
  }

  async deleteReply(
    id: string,
    replyId: string,
    actor?: AuthPrincipal | null,
  ): Promise<ProductReview> {
    const review = await this.reviews.findById(id);
    if (!review) {
      throw new NotFoundException(`Review not found: ${id}`);
    }
    review.replies = review.replies.filter((reply) => reply.id !== replyId);
    review.updatedAt = new Date().toISOString();
    await this.reviews.save(review);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'review.reply-deleted',
        entityType: 'product-review',
        entityId: review.id,
        metadata: { replyId },
      });
    }
    return review;
  }

  /**
   * Send a review request to a customer through the honest
   * provider path. The send is recorded in the communication
   * log with purpose 'review-request'; with no provider
   * configured it records not-configured, exactly like every
   * other send. There is no public request link flow: a link
   * nothing public can open would be decoration.
   */
  async requestReview(
    dto: ReviewRequestCreate,
    actor?: AuthPrincipal | null,
  ) {
    if (!this.communications || !this.customers) {
      throw new BadRequestException(
        'Review requests are not available in this service configuration',
      );
    }
    const customer = await this.customers.findById(dto.customerId);
    if (!customer) {
      throw new NotFoundException(`Customer not found: ${dto.customerId}`);
    }
    const to = dto.channel === 'email' ? customer.email : customer.phone;
    return this.communications.send({
      channel: dto.channel,
      to,
      customerId: customer.id,
      purpose: 'review-request',
      staffId: actor?.id ?? null,
      subject: 'How was your Dostelo purchase?',
      body: 'We would love your review of your recent Dostelo purchase. Reply to this message with your rating and a few words.',
      variables: {
        firstName: customer.fullName.split(' ')[0] ?? '',
        customer_name: customer.fullName,
      },
    });
  }
}
