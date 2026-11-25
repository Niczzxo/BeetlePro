import { Injectable } from '@nestjs/common';
import type { ProductReview as ReviewRow } from '@prisma/client';
import type { ProductReview } from '@dostelo/types';
import {
  fromEnum,
  iso,
  toEnum,
} from '../../../prisma/prisma.helpers';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import {
  ReviewsRepository,
  type ReviewFilter,
} from './reviews.repository';

function toDomain(row: ReviewRow): ProductReview {
  return {
    id: row.id,
    productId: row.productId,
    customerId: row.customerId,
    authorName: row.authorName,
    rating: row.rating,
    title: row.title,
    body: row.body,
    status: fromEnum(row.status),
    source: row.source as ProductReview['source'],
    verified: row.verified,
    verificationNote: row.verificationNote,
    orderNumber: row.orderNumber,
    flagReason: row.flagReason,
    replies: (row.replies as unknown as ProductReview['replies']) ?? [],
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

/** Prisma reviews repository over the ProductReview model. */
@Injectable()
export class PrismaReviewsRepository extends ReviewsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma.client;
  }

  async create(
    review: ProductReview,
    tx?: Tx,
  ): Promise<ProductReview> {
    const row = await this.db(tx).productReview.create({
      data: {
        id: review.id,
        productId: review.productId,
        customerId: review.customerId,
        authorName: review.authorName,
        rating: review.rating,
        title: review.title,
        body: review.body,
        status: toEnum<ReviewRow['status']>(review.status),
        source: review.source,
        verified: review.verified,
        verificationNote: review.verificationNote,
        orderNumber: review.orderNumber,
        flagReason: review.flagReason,
        replies: review.replies as unknown as import('@prisma/client').Prisma.InputJsonValue,
      },
    });
    return toDomain(row);
  }

  async save(review: ProductReview, tx?: Tx): Promise<void> {
    await this.db(tx).productReview.update({
      where: { id: review.id },
      data: {
        customerId: review.customerId,
        authorName: review.authorName,
        rating: review.rating,
        title: review.title,
        body: review.body,
        status: toEnum<ReviewRow['status']>(review.status),
        source: review.source,
        verified: review.verified,
        verificationNote: review.verificationNote,
        orderNumber: review.orderNumber,
        flagReason: review.flagReason,
        replies: review.replies as unknown as import('@prisma/client').Prisma.InputJsonValue,
      },
    });
  }

  async findById(
    id: string,
    tx?: Tx,
  ): Promise<ProductReview | null> {
    const row = await this.db(tx).productReview.findUnique({
      where: { id },
    });
    return row ? toDomain(row) : null;
  }

  async list(
    filter?: ReviewFilter,
    tx?: Tx,
  ): Promise<ProductReview[]> {
    const rows = await this.db(tx).productReview.findMany({
      where: {
        productId: filter?.productId,
        status: filter?.status ? toEnum<ReviewRow['status']>(filter.status) : undefined,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toDomain);
  }
}
