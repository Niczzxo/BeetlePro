import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MarketingController } from './marketing.controller';
import { MarketingService } from './marketing.service';
import { MarketingRepository } from './repositories/marketing.repository';
import { InMemoryMarketingRepository } from './repositories/in-memory-marketing.repository';
import { PrismaMarketingRepository } from './repositories/prisma-marketing.repository';

/**
 * Marketing module: campaign records with draft, scheduled and
 * cancelled states, and honest per-channel send-readiness.
 */
@Module({
  imports: [AuditModule],
  controllers: [MarketingController],
  providers: [
    MarketingService,
    {
      provide: MarketingRepository,
      useClass: process.env.DATABASE_URL
        ? PrismaMarketingRepository
        : InMemoryMarketingRepository,
    },
  ],
  exports: [MarketingService, MarketingRepository],
})
export class MarketingModule {}
