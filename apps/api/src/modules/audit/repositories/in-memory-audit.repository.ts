import { Injectable } from '@nestjs/common';
import type { AuditLogEntry } from '@dostelo/types';
import { InMemoryDatabase } from '../../../store/in-memory.store';
import {
  AuditRepository,
  type AuditFilter,
} from './audit.repository';

@Injectable()
export class InMemoryAuditRepository extends AuditRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async append(entry: AuditLogEntry): Promise<void> {
    this.db.auditLogs.push(entry);
  }

  async list(filter: AuditFilter): Promise<AuditLogEntry[]> {
    const matches = this.db.auditLogs.filter((entry) => {
      if (filter.actorId && entry.actorId !== filter.actorId) return false;
      if (filter.actorType && entry.actorType !== filter.actorType) {
        return false;
      }
      if (filter.action && entry.action !== filter.action) return false;
      if (filter.from && entry.createdAt < filter.from) return false;
      if (filter.to && entry.createdAt > filter.to) return false;
      return true;
    });
    // Newest first for the admin reader.
    const sorted = [...matches].reverse();
    return filter.limit ? sorted.slice(0, filter.limit) : sorted;
  }
}
