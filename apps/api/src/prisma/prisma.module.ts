import { Global, Module } from '@nestjs/common';
import { OrderEventBus } from '../store/order-event-bus';
import { PrismaService } from './prisma.service';
import { PrismaSeedService } from '../seed/prisma-seed.service';
import { AutomationExecutionsRepository } from '../store/automation-executions.repository';
import { PrismaAutomationExecutionsRepository } from '../store/prisma-automation-executions.repository';
import { PrismaSettingsRepository } from '../store/prisma-settings.repository';
import { SettingsRepository } from '../store/settings.repository';
import {
  PrismaTransactionRunner,
  TransactionRunner,
} from './transaction-runner';

/**
 * Global Prisma module (docs/PRISMA_MIGRATION.md): the Prisma
 * counterpart of StoreModule. AppModule imports this instead of
 * StoreModule when DATABASE_URL is set; repository providers in
 * each feature module then bind their Prisma classes, which
 * inject PrismaService from here. OrderEventBus is provided in
 * both bindings because orders and payments use it either way.
 * PrismaSeedService seeds the catalogue on startup when the
 * Product table is empty, and SettingsRepository binds its
 * Prisma implementation over the StoreSettings singleton.
 */
@Global()
@Module({
  providers: [
    PrismaService,
    PrismaSeedService,
    OrderEventBus,
    { provide: TransactionRunner, useClass: PrismaTransactionRunner },
    { provide: SettingsRepository, useClass: PrismaSettingsRepository },
    {
      provide: AutomationExecutionsRepository,
      useClass: PrismaAutomationExecutionsRepository,
    },
  ],
  exports: [
    PrismaService,
    OrderEventBus,
    TransactionRunner,
    SettingsRepository,
    AutomationExecutionsRepository,
  ],
})
export class PrismaModule {}
