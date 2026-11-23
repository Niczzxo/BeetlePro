import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersController } from './orders.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { OrdersService } from './orders.service';
import { OrdersRepository } from './repositories/orders.repository';
import { InMemoryOrdersRepository } from './repositories/in-memory-orders.repository';
import { PrismaOrdersRepository } from './repositories/prisma-orders.repository';

@Module({
  imports: [InventoryModule, AuditModule],
  controllers: [OrdersController, AdminOrdersController],
  providers: [
    OrdersService,
    { provide: OrdersRepository, useClass: process.env.DATABASE_URL ? PrismaOrdersRepository : InMemoryOrdersRepository },
  ],
  exports: [OrdersService, OrdersRepository],
})
export class OrdersModule {}
