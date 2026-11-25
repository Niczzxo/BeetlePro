import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CartRecoveryModule } from '../cart-recovery/cart-recovery.module';
import { CatalogModule } from '../catalog/catalog.module';
import { CustomersModule } from '../customers/customers.module';
import { LeadsModule } from '../leads/leads.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ShippingModule } from '../shipping/shipping.module';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { BackupRepository } from './repositories/backup.repository';
import { InMemoryBackupRepository } from './repositories/in-memory-backup.repository';
import { PrismaBackupRepository } from './repositories/prisma-backup.repository';

/**
 * Backup module: staff-triggered JSON exports of the core
 * stores plus the export record. SettingsRepository comes from
 * the global store or Prisma module.
 */
@Module({
  imports: [
    CatalogModule,
    CustomersModule,
    OrdersModule,
    PaymentsModule,
    LeadsModule,
    CartRecoveryModule,
    ShippingModule,
    AuditModule,
    IntegrationsModule,
  ],
  controllers: [BackupController],
  providers: [
    BackupService,
    {
      provide: BackupRepository,
      useClass: process.env.DATABASE_URL
        ? PrismaBackupRepository
        : InMemoryBackupRepository,
    },
  ],
  exports: [BackupService, BackupRepository],
})
export class BackupModule {}
