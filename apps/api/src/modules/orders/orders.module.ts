import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersController } from './orders.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { OrdersService } from './orders.service';
import { OrdersRepository } from './repositories/orders.repository';
import { InMemoryOrdersRepository } from './repositories/in-memory-orders.repository';

@Module({
  imports: [InventoryModule, AuditModule],
  controllers: [OrdersController, AdminOrdersController],
  providers: [
    OrdersService,
    { provide: OrdersRepository, useClass: InMemoryOrdersRepository },
  ],
  exports: [OrdersService, OrdersRepository],
})
export class OrdersModule {}
