import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CustomersModule } from '../customers/customers.module';
import { OrdersModule } from '../orders/orders.module';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyRepository } from './repositories/loyalty.repository';
import { InMemoryLoyaltyRepository } from './repositories/in-memory-loyalty.repository';
import { PrismaLoyaltyRepository } from './repositories/prisma-loyalty.repository';

/**
 * Loyalty module: derived point balances (delivered orders at
 * the stored earn rate) plus audited staff adjustments and the
 * rules editor over the settings seam. The SettingsRepository
 * binding comes from the global StoreModule or PrismaModule,
 * following the existing settings consumers.
 */
@Module({
  imports: [CustomersModule, OrdersModule, AuditModule],
  controllers: [LoyaltyController],
  providers: [
    LoyaltyService,
    {
      provide: LoyaltyRepository,
      useClass: process.env.DATABASE_URL
        ? PrismaLoyaltyRepository
        : InMemoryLoyaltyRepository,
    },
  ],
  exports: [LoyaltyService, LoyaltyRepository],
})
export class LoyaltyModule {}
