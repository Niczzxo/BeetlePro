import type { Tx } from '../../../prisma/prisma.service';
import type { NotificationReadRecord } from '../../../store/in-memory.store';

/**
 * Notification read-state seam. The feed itself is derived by
 * the service from orders, stock and recovery records; only the
 * read marks are stored.
 */
export abstract class NotificationsRepository {
  abstract listReads(
    adminUserId: string,
    tx?: Tx,
  ): Promise<NotificationReadRecord[]>;
  /** Marks keys read for the staff member. Keys already marked
   * are left as they are. Returns how many were newly marked. */
  abstract markRead(
    adminUserId: string,
    keys: string[],
    tx?: Tx,
  ): Promise<number>;
}
