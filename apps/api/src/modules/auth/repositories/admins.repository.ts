import type { StoredAdminUser } from '../../../store/in-memory.store';

/**
 * Staff account persistence seam, mirroring the User plus
 * AdminUser models in the Prisma schema. Password hashes and the
 * TOTP secret never leave the API.
 */
export abstract class AdminsRepository {
  abstract create(admin: StoredAdminUser): StoredAdminUser;
  abstract save(admin: StoredAdminUser): void;
  abstract findById(id: string): StoredAdminUser | null;
  abstract findByEmail(email: string): StoredAdminUser | null;
  abstract count(): number;
}
