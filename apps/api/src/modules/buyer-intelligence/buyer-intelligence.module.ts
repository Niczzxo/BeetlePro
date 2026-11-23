import { Module } from '@nestjs/common';
import { VisitorsModule } from '../visitors/visitors.module';
import { BuyerIntelligenceController } from './buyer-intelligence.controller';
import { BuyerIntelligenceService } from './buyer-intelligence.service';

/**
 * Buyer Intelligence module (Phase 5): staff session reads and
 * the transparent lead score. Owns no persistence; it reads the
 * visitors module's records through its service.
 */
@Module({
  imports: [VisitorsModule],
  controllers: [BuyerIntelligenceController],
  providers: [BuyerIntelligenceService],
  exports: [BuyerIntelligenceService],
})
export class BuyerIntelligenceModule {}
