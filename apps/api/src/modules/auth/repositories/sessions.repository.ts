import type { StoredSession } from '../../../store/in-memory.store';

/**
 * Refresh-token session persistence seam, mirroring the Prisma
 * Session model (with the Phase 4 family fields). Only token
 * hashes are ever stored.
 */
export abstract class SessionsRepository {
  abstract create(session: StoredSession): void;
  abstract save(session: StoredSession): void;
  abstract findById(id: string): StoredSession | null;
  abstract findByRefreshHash(hash: string): StoredSession | null;
  abstract listByFamily(familyId: string): StoredSession[];
}
