import type { AuditLogEntry } from '@dostelo/types';
import type { Tx } from '../../../prisma/prisma.service';

export interface AuditFilter {
  actorId?: string;
  actorType?: AuditLogEntry['actorType'];
  action?: string;
  /** Inclusive ISO date bounds on createdAt. */
  from?: string;
  to?: string;
  limit?: number;
}

/**
 * Audit persistence seam. The trail is append-only: there is
 * deliberately no update or delete operation. The Prisma
 * implementation maps to the AuditLog model.
 */
export abstract class AuditRepository {
  abstract append(entry: AuditLogEntry, tx?: Tx): Promise<void>;
  abstract list(
    filter: AuditFilter,
    tx?: Tx,
  ): Promise<AuditLogEntry[]>;
}
