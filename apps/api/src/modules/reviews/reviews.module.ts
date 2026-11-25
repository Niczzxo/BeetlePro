import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { CommunicationsModule } from '../communications/communications.module';
import { CustomersModule } from '../customers/customers.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { OrdersModule } from '../orders/orders.module';
import { PublicReviewsController } from './public-reviews.controller';
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
  imports: [
    CatalogModule,
    OrdersModule,
    AuditModule,
    LoyaltyModule,
    CommunicationsModule,
    CustomersModule,
  ],
  controllers: [ReviewsController, PublicReviewsController],
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
