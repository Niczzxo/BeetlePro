import type { Tx } from '../../../prisma/prisma.service';
import type { StoredAdminUser } from '../../../store/in-memory.store';

/**
 * Staff account persistence seam, mirroring the User plus
 * AdminUser models in the Prisma schema. Password hashes and the
 * TOTP secret never leave the API.
 */
export abstract class AdminsRepository {
  abstract create(
    admin: StoredAdminUser,
    tx?: Tx,
  ): Promise<StoredAdminUser>;
  abstract save(admin: StoredAdminUser, tx?: Tx): Promise<void>;
  abstract findById(
    id: string,
    tx?: Tx,
  ): Promise<StoredAdminUser | null>;
  abstract findByEmail(
    email: string,
    tx?: Tx,
  ): Promise<StoredAdminUser | null>;
  /** Every staff account, oldest first (Staff Management). */
  abstract list(tx?: Tx): Promise<StoredAdminUser[]>;
  abstract count(tx?: Tx): Promise<number>;
}
