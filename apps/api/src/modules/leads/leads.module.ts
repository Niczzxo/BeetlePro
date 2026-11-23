import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BuyerIntelligenceModule } from '../buyer-intelligence/buyer-intelligence.module';
import { CustomersModule } from '../customers/customers.module';
import { OrdersModule } from '../orders/orders.module';
import { VisitorsModule } from '../visitors/visitors.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { LeadsRepository } from './repositories/leads.repository';
import { InMemoryLeadsRepository } from './repositories/in-memory-leads.repository';
import { PrismaLeadsRepository } from './repositories/prisma-leads.repository';

/**
 * Leads module (Phase 5): the lead pipeline, assignment,
 * follow-up tasks, contact attempts and opt-out suppression.
 * On startup the service registers its candidate evaluation with
 * the visitors service, so ingestion and linking can raise
 * candidates without a circular module dependency.
 */
@Module({
  imports: [
    VisitorsModule,
    BuyerIntelligenceModule,
    CustomersModule,
    OrdersModule,
    AuditModule,
  ],
  controllers: [LeadsController],
  providers: [
    LeadsService,
    { provide: LeadsRepository, useClass: process.env.DATABASE_URL ? PrismaLeadsRepository : InMemoryLeadsRepository },
  ],
  exports: [LeadsService, LeadsRepository],
})
export class LeadsModule {}
