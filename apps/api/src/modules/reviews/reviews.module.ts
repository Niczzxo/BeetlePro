import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { OrdersModule } from '../orders/orders.module';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { ReviewsRepository } from './repositories/reviews.repository';
import { InMemoryReviewsRepository } from './repositories/in-memory-reviews.repository';
import { PrismaReviewsRepository } from './repositories/prisma-reviews.repository';

/**
 * Reviews module: staff-entered product reviews with moderation
 * (approve, hide) and a server-checked verified-purchase source.
 */
@Module({
  imports: [CatalogModule, OrdersModule, AuditModule],
  controllers: [ReviewsController],
  providers: [
    ReviewsService,
    {
      provide: ReviewsRepository,
      useClass: process.env.DATABASE_URL
        ? PrismaReviewsRepository
        : InMemoryReviewsRepository,
    },
  ],
  exports: [ReviewsService, ReviewsRepository],
})
export class ReviewsModule {}
