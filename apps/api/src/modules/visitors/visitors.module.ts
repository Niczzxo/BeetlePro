import { Module } from '@nestjs/common';
import { RateLimitGuard, RateLimiter } from '../../common/rate-limit';
import { VisitorsController } from './visitors.controller';
import { VisitorsService } from './visitors.service';
import { VisitorsRepository } from './repositories/visitors.repository';
import { InMemoryVisitorsRepository } from './repositories/in-memory-visitors.repository';
import { PrismaVisitorsRepository } from './repositories/prisma-visitors.repository';

/**
 * Visitors module (Phase 5): first-party event ingestion, consent
 * records and identity linking. Buyer Intelligence, Leads, CRM
 * and Checkout build on the exported service and repository.
 */
@Module({
  controllers: [VisitorsController],
  providers: [
    VisitorsService,
    RateLimiter,
    RateLimitGuard,
    { provide: VisitorsRepository, useClass: process.env.DATABASE_URL ? PrismaVisitorsRepository : InMemoryVisitorsRepository },
  ],
  exports: [VisitorsService, VisitorsRepository],
})
export class VisitorsModule {}
