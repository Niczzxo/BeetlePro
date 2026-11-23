import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditRepository } from './repositories/audit.repository';
import { InMemoryAuditRepository } from './repositories/in-memory-audit.repository';

/**
 * Audit module (Phase 4): the append-only trail for sensitive
 * actions, plus its guarded staff read. Other modules import this
 * to record; nothing imports back, so there are no cycles.
 */
@Module({
  controllers: [AuditController],
  providers: [
    AuditService,
    { provide: AuditRepository, useClass: InMemoryAuditRepository },
  ],
  exports: [AuditService, AuditRepository],
})
export class AuditModule {}
