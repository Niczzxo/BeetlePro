import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';
import { ReturnsRepository } from './repositories/returns.repository';
import { InMemoryReturnsRepository } from './repositories/in-memory-returns.repository';
import { PrismaReturnsRepository } from './repositories/prisma-returns.repository';

/**
 * Returns module: return and exchange requests against delivered
 * orders, restock on approval through the inventory repository,
 * and the refund hand-off into Payments.
 */
@Module({
  imports: [OrdersModule, InventoryModule, PaymentsModule, AuditModule],
  controllers: [ReturnsController],
  providers: [
    ReturnsService,
    {
      provide: ReturnsRepository,
      useClass: process.env.DATABASE_URL
        ? PrismaReturnsRepository
        : InMemoryReturnsRepository,
    },
  ],
  exports: [ReturnsService, ReturnsRepository],
})
export class ReturnsModule {}
