import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CustomersModule } from '../customers/customers.module';
import { OrdersModule } from '../orders/orders.module';
import { VisitorsModule } from '../visitors/visitors.module';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { CrmRepository } from './repositories/crm.repository';
import { InMemoryCrmRepository } from './repositories/in-memory-crm.repository';

/**
 * CRM module (Phase 5): the customer timeline (orders, linked
 * visitor activity, notes, tags) and staff notes and tags.
 */
@Module({
  imports: [CustomersModule, OrdersModule, VisitorsModule, AuditModule],
  controllers: [CrmController],
  providers: [
    CrmService,
    { provide: CrmRepository, useClass: InMemoryCrmRepository },
  ],
  exports: [CrmService],
})
export class CrmModule {}
