import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryRepository } from './repositories/inventory.repository';
import { InMemoryInventoryRepository } from './repositories/in-memory-inventory.repository';

@Module({
  imports: [AuditModule],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    { provide: InventoryRepository, useClass: InMemoryInventoryRepository },
  ],
  exports: [InventoryService, InventoryRepository],
})
export class InventoryModule {}
