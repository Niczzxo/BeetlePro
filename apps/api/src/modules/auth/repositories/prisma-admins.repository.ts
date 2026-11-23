import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { date, iso } from '../../../prisma/prisma.helpers';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import type { StoredAdminUser } from '../../../store/in-memory.store';
import { AdminsRepository } from './admins.repository';

/**
 * Prisma staff account repository. The schema splits a staff
 * account across User (identity, display name, password hash),
 * AdminUser (active flag, MFA state) and Role rows joined by
 * AdminUserRole, where Role.key is the AdminRole key itself
 * ('super-admin', 'store-manager', ...). This implementation
 * joins and flattens them back into StoredAdminUser, creating
 * Role rows on first use.
 */
@Injectable()
export class PrismaAdminsRepository extends AdminsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma.client;
  }

  private async load(id: string, tx?: Tx): Promise<StoredAdminUser | null> {
    const db = this.db(tx);
    const row = await db.adminUser.findUnique({
      where: { id },
      include: { user: true, roles: { include: { role: true } } },
    });
    if (!row) return null;
    return {
      id: row.id,
      email: row.user.email ?? '',
      displayName: row.displayName,
      passwordHash: row.user.passwordHash ?? '',
      roles: row.roles.map(
        (entry) => entry.role.key as StoredAdminUser['roles'][number],
      ),
      isActive: row.isActive,
      mfaSecret: row.mfaSecret,
      mfaEnabled: row.mfaEnabled,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  /** Ensures a Role row exists per role key and returns the
   * AdminUserRole create inputs. */
  private async roleLinks(
    roles: StoredAdminUser['roles'],
    tx?: Tx,
  ): Promise<{ roleId: string }[]> {
    const db = this.db(tx);
    const links: { roleId: string }[] = [];
    for (const key of roles) {
      const role = await db.role.upsert({
        where: { key },
        create: { key, name: key },
        update: {},
      });
      links.push({ roleId: role.id });
    }
    return links;
  }

  async create(
    admin: StoredAdminUser,
    tx?: Tx,
  ): Promise<StoredAdminUser> {
    const db = this.db(tx);
    const userId = randomUUID();
    await db.user.create({
      data: {
        id: userId,
        email: admin.email,
        passwordHash: admin.passwordHash,
        name: admin.displayName,
      },
    });
    await db.adminUser.create({
      data: {
        id: admin.id,
        userId,
        displayName: admin.displayName,
        isActive: admin.isActive,
        mfaSecret: admin.mfaSecret,
        mfaEnabled: admin.mfaEnabled,
        createdAt: date(admin.createdAt),
        updatedAt: date(admin.updatedAt),
        roles: { create: await this.roleLinks(admin.roles, tx) },
      },
    });
    return (await this.load(admin.id, tx)) ?? admin;
  }

  async save(admin: StoredAdminUser, tx?: Tx): Promise<void> {
    const db = this.db(tx);
    const existing = await db.adminUser.findUnique({
      where: { id: admin.id },
    });
    if (!existing) {
      await this.create(admin, tx);
      return;
    }
    await db.user.update({
      where: { id: existing.userId },
      data: {
        email: admin.email,
        passwordHash: admin.passwordHash,
        name: admin.displayName,
      },
    });
    await db.adminUserRole.deleteMany({
      where: { adminUserId: admin.id },
    });
    await db.adminUser.update({
      where: { id: admin.id },
      data: {
        displayName: admin.displayName,
        isActive: admin.isActive,
        mfaSecret: admin.mfaSecret,
        mfaEnabled: admin.mfaEnabled,
        updatedAt: date(admin.updatedAt),
        roles: { create: await this.roleLinks(admin.roles, tx) },
      },
    });
  }

  async findById(
    id: string,
    tx?: Tx,
  ): Promise<StoredAdminUser | null> {
    return this.load(id, tx);
  }

  async findByEmail(
    email: string,
    tx?: Tx,
  ): Promise<StoredAdminUser | null> {
    const row = await this.db(tx).adminUser.findFirst({
      where: { user: { email: { equals: email, mode: 'insensitive' } } },
    });
    return row ? this.load(row.id, tx) : null;
  }

  async count(tx?: Tx): Promise<number> {
    return this.db(tx).adminUser.count();
  }
}
