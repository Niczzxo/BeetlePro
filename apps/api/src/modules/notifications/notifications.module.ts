import { Module } from '@nestjs/common';
import { CartRecoveryModule } from '../cart-recovery/cart-recovery.module';
import { CatalogModule } from '../catalog/catalog.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from './repositories/notifications.repository';
import { InMemoryNotificationsRepository } from './repositories/in-memory-notifications.repository';
import { PrismaNotificationsRepository } from './repositories/prisma-notifications.repository';

/**
 * Notifications module: a staff feed derived from orders, stock
 * and recovery records, with per-staff read marks as the only
 * stored state.
 */
@Module({
  imports: [OrdersModule, InventoryModule, CatalogModule, CartRecoveryModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    {
      provide: NotificationsRepository,
      useClass: process.env.DATABASE_URL
        ? PrismaNotificationsRepository
        : InMemoryNotificationsRepository,
    },
  ],
  exports: [NotificationsService, NotificationsRepository],
})
export class NotificationsModule {}
