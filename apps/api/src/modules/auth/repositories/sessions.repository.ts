import type { Tx } from '../../../prisma/prisma.service';
import type { StoredSession } from '../../../store/in-memory.store';

/**
 * Refresh-token session persistence seam, mirroring the Prisma
 * Session model (with the Phase 4 family fields). Only token
 * hashes are ever stored.
 */
export abstract class SessionsRepository {
  abstract create(session: StoredSession, tx?: Tx): Promise<void>;
  abstract save(session: StoredSession, tx?: Tx): Promise<void>;
  abstract findById(
    id: string,
    tx?: Tx,
  ): Promise<StoredSession | null>;
  abstract findByRefreshHash(
    hash: string,
    tx?: Tx,
  ): Promise<StoredSession | null>;
  abstract listByFamily(
    familyId: string,
    tx?: Tx,
  ): Promise<StoredSession[]>;
  /** Every session belonging to one principal (Staff Management:
   * active session counts and forced logout). */
  abstract listBySubject(
    subjectType: 'customer' | 'admin',
    subjectId: string,
    tx?: Tx,
  ): Promise<StoredSession[]>;
}
