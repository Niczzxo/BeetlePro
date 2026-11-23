import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { StaffMemberView } from '@dostelo/types';
import type {
  CreateStaff,
  StaffRolesUpdate,
} from '@dostelo/validation';
import { hashPassword } from '../../common/password';
import type { AuthPrincipal } from '../../common/auth/principal';
import type { StoredAdminUser } from '../../store/in-memory.store';
import { AuditService } from '../audit/audit.service';
import { AdminsRepository } from '../auth/repositories/admins.repository';
import { SessionsRepository } from '../auth/repositories/sessions.repository';

/**
 * Staff management (admin master structure module 21) over the
 * existing admins and sessions seams. Creating an account sets a
 * temporary password chosen by the creating admin, who hands it
 * over out of band; nothing here ever returns a password hash or
 * an MFA secret. Deactivation blocks new logins (AuthService
 * checks isActive) and forced logout revokes the account's
 * refresh sessions.
 */
@Injectable()
export class StaffService {
  constructor(
    private readonly admins: AdminsRepository,
    private readonly sessions: SessionsRepository,
    @Optional() private readonly audit?: AuditService,
  ) {}

  private async toView(admin: StoredAdminUser): Promise<StaffMemberView> {
    const sessions = await this.sessions.listBySubject('admin', admin.id);
    const now = new Date().toISOString();
    return {
      id: admin.id,
      email: admin.email,
      displayName: admin.displayName,
      roles: admin.roles,
      isActive: admin.isActive,
      mfaEnabled: admin.mfaEnabled,
      activeSessions: sessions.filter(
        (session) => !session.revokedAt && session.expiresAt > now,
      ).length,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    };
  }

  async list(): Promise<StaffMemberView[]> {
    const admins = await this.admins.list();
    const views: StaffMemberView[] = [];
    for (const admin of admins) {
      views.push(await this.toView(admin));
    }
    return views;
  }

  async create(
    dto: CreateStaff,
    actor?: AuthPrincipal | null,
  ): Promise<StaffMemberView> {
    const existing = await this.admins.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException(
        `A staff account already exists for ${dto.email}`,
      );
    }
    const now = new Date().toISOString();
    const admin: StoredAdminUser = {
      id: randomUUID(),
      email: dto.email,
      displayName: dto.displayName,
      passwordHash: await hashPassword(dto.temporaryPassword),
      roles: [...new Set(dto.roles)],
      isActive: true,
      mfaSecret: null,
      mfaEnabled: false,
      createdAt: now,
      updatedAt: now,
    };
    await this.admins.create(admin);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'staff.created',
        entityType: 'admin-user',
        entityId: admin.id,
        metadata: { email: admin.email, roles: admin.roles },
      });
    }
    return this.toView(admin);
  }

  async setRoles(
    id: string,
    dto: StaffRolesUpdate,
    actor?: AuthPrincipal | null,
  ): Promise<StaffMemberView> {
    const admin = await this.requireAdmin(id);
    admin.roles = [...new Set(dto.roles)];
    admin.updatedAt = new Date().toISOString();
    await this.admins.save(admin);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'staff.roles-updated',
        entityType: 'admin-user',
        entityId: admin.id,
        metadata: { roles: admin.roles },
      });
    }
    return this.toView(admin);
  }

  async setActive(
    id: string,
    isActive: boolean,
    actor?: AuthPrincipal | null,
  ): Promise<StaffMemberView> {
    const admin = await this.requireAdmin(id);
    if (!isActive && actor && actor.id === admin.id) {
      throw new BadRequestException(
        'You cannot deactivate your own account',
      );
    }
    admin.isActive = isActive;
    admin.updatedAt = new Date().toISOString();
    await this.admins.save(admin);
    if (!isActive) {
      await this.revokeSessions(admin.id);
    }
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: isActive ? 'staff.activated' : 'staff.deactivated',
        entityType: 'admin-user',
        entityId: admin.id,
        metadata: { email: admin.email },
      });
    }
    return this.toView(admin);
  }

  /** Forced logout: revokes every live refresh session the
   * account holds. Access tokens already issued stay valid until
   * they expire (they are short-lived JWTs); refresh is cut off
   * immediately. */
  async revokeSessionsFor(
    id: string,
    actor?: AuthPrincipal | null,
  ): Promise<{ revoked: number }> {
    const admin = await this.requireAdmin(id);
    const revoked = await this.revokeSessions(admin.id);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'staff.sessions-revoked',
        entityType: 'admin-user',
        entityId: admin.id,
        metadata: { revoked },
      });
    }
    return { revoked };
  }

  private async revokeSessions(adminId: string): Promise<number> {
    const sessions = await this.sessions.listBySubject('admin', adminId);
    const now = new Date().toISOString();
    let revoked = 0;
    for (const session of sessions) {
      if (!session.revokedAt) {
        session.revokedAt = now;
        await this.sessions.save(session);
        revoked += 1;
      }
    }
    return revoked;
  }

  private async requireAdmin(id: string): Promise<StoredAdminUser> {
    const admin = await this.admins.findById(id);
    if (!admin) {
      throw new NotFoundException(`Staff account not found: ${id}`);
    }
    return admin;
  }
}
