import { Global, Module } from '@nestjs/common';
import {
  NoopTransactionRunner,
  TransactionRunner,
} from '../prisma/transaction-runner';
import { SeedService } from '../seed/seed.service';
import { InMemoryDatabase } from './in-memory.store';
import { InMemorySettingsRepository } from './in-memory-settings.repository';
import { OrderEventBus } from './order-event-bus';
import { SettingsRepository } from './settings.repository';

/**
 * Global store module for the in-memory binding: one
 * InMemoryDatabase per process, seeded on startup. Repository
 * providers across modules read and write it through their
 * interfaces. AppModule imports this module only when
 * DATABASE_URL is unset; with DATABASE_URL set it imports
 * PrismaModule instead and the repository providers bind their
 * Prisma classes (docs/PRISMA_MIGRATION.md). The transaction
 * runner is the no-op variant here: the in-memory store is
 * single-threaded, so transactional flows are already atomic.
 */
@Global()
@Module({
  providers: [
    InMemoryDatabase,
    SeedService,
    OrderEventBus,
    { provide: SettingsRepository, useClass: InMemorySettingsRepository },
    { provide: TransactionRunner, useClass: NoopTransactionRunner },
  ],
  exports: [
    InMemoryDatabase,
    OrderEventBus,
    SettingsRepository,
    TransactionRunner,
  ],
})
export class StoreModule {}
