import { Global, Module } from '@nestjs/common';
import { SeedService } from '../seed/seed.service';
import { InMemoryDatabase } from './in-memory.store';
import { OrderEventBus } from './order-event-bus';

/**
 * Global store module: one InMemoryDatabase per process, seeded on
 * startup. Repository providers across modules read and write it
 * through their interfaces. When the Prisma implementation lands,
 * this module is replaced by a Prisma module exporting the same
 * repository tokens; module wiring elsewhere does not change.
 */
@Global()
@Module({
  providers: [InMemoryDatabase, SeedService, OrderEventBus],
  exports: [InMemoryDatabase, OrderEventBus],
})
export class StoreModule {}
