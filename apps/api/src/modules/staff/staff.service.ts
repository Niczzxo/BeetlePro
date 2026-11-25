import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AdminRole, StaffMemberView } from '@dostelo/types';
import type {
  AcceptInvite,
  CreateStaff,
  InviteStaff,
  StaffProfileUpdate,
  StaffRolesUpdate,
} from '@dostelo/validation';
import { hashPassword } from '../../common/password';
import type { AuthPrincipal } from '../../common/auth/principal';
import type { StoredAdminUser } from '../../store/in-memory.store';
import { AuditService } from '../audit/audit.service';
import { AdminsRepository } from '../auth/repositories/admins.repository';
import { SessionsRepository } from '../auth/repositories/sessions.repository';
import { StaffInvitationsRepository } from './repositories/staff-invitations.repository';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

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
    @Optional()
    private readonly invitations?: StaffInvitationsRepository,
  ) {}

  /** Only a super admin may grant the super admin role. */
  private assertCanGrant(
    roles: AdminRole[],
    actor?: AuthPrincipal | null,
  ): void {
    if (!roles.includes('super-admin')) return;
    if (!actor || !actor.roles.includes('super-admin')) {
      throw new BadRequestException(
        'Only a super admin can assign the Super Admin role',
      );
    }
  }

  /** The last active super admin can never be deactivated or
   * demoted: the store would lock itself out of its own portal. */
  private async assertNotLastSuperAdmin(
    admin: StoredAdminUser,
  ): Promise<void> {
    if (!admin.isActive || !admin.roles.includes('super-admin')) return;
    const all = await this.admins.list();
    const activeSupers = all.filter(
      (item) => item.isActive && item.roles.includes('super-admin'),
    );
    if (activeSupers.length <= 1) {
      throw new BadRequestException(
        'This is the last active super admin account; it cannot be deactivated or demoted',
      );
    }
  }

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
      lastActiveAt:
        sessions.length > 0
          ? sessions
              .map((session) => session.createdAt)
              .sort()
              .at(-1) ?? null
          : null,
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
    this.assertCanGrant(dto.roles, actor);
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
    this.assertCanGrant(dto.roles, actor);
    const admin = await this.requireAdmin(id);
    if (
      admin.roles.includes('super-admin') &&
      !dto.roles.includes('super-admin')
    ) {
      await this.assertNotLastSuperAdmin(admin);
    }
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
    if (!isActive) {
      await this.assertNotLastSuperAdmin(admin);
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

  async updateProfile(
    id: string,
    dto: StaffProfileUpdate,
    actor?: AuthPrincipal | null,
  ): Promise<StaffMemberView> {
    const admin = await this.requireAdmin(id);
    admin.displayName = dto.displayName;
    admin.updatedAt = new Date().toISOString();
    await this.admins.save(admin);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'staff.profile-updated',
        entityType: 'admin-user',
        entityId: admin.id,
        metadata: { displayName: admin.displayName },
      });
    }
    return this.toView(admin);
  }

  /**
   * Invite a staff member (Staff redesign). No password is set
   * by the inviter and nothing is emailed (no provider exists):
   * the account is created inactive with an unusable random
   * password hash, and a one-time token is returned once for the
   * inviter to hand over. The invitee sets their own password
   * through acceptInvite; only then does the account activate.
   * The token is stored as a SHA-256 hash with a 72 hour expiry
   * and is single-use.
   */
  async invite(
    dto: InviteStaff,
    actor?: AuthPrincipal | null,
  ): Promise<{ admin: StaffMemberView; inviteToken: string; expiresAt: string }> {
    if (!this.invitations) {
      throw new BadRequestException(
        'Invitations are not available in this service configuration',
      );
    }
    this.assertCanGrant(dto.roles, actor);
    const existing = await this.admins.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException(
        `A staff account already exists for ${dto.email}`,
      );
    }
    const now = new Date();
    const nowIso = now.toISOString();
    const admin: StoredAdminUser = {
      id: randomUUID(),
      email: dto.email,
      displayName: dto.displayName,
      passwordHash: await hashPassword(randomBytes(32).toString('hex')),
      roles: [...new Set(dto.roles)],
      isActive: false,
      mfaSecret: null,
      mfaEnabled: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await this.admins.create(admin);
    const token = `${randomUUID()}.${randomBytes(24).toString('hex')}`;
    const expiresAt = new Date(
      now.getTime() + 72 * 60 * 60 * 1000,
    ).toISOString();
    await this.invitations.create({
      id: randomUUID(),
      adminUserId: admin.id,
      tokenHash: sha256(token),
      expiresAt,
      usedAt: null,
      createdAt: nowIso,
    });
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'staff.invited',
        entityType: 'admin-user',
        entityId: admin.id,
        metadata: { email: admin.email, roles: admin.roles, expiresAt },
      });
    }
    return { admin: await this.toView(admin), inviteToken: token, expiresAt };
  }

  /** Accept an invitation: verifies the token hash, its expiry
   * and single use, sets the invitee's own password and
   * activates the account. */
  async acceptInvite(dto: AcceptInvite): Promise<StaffMemberView> {
    if (!this.invitations) {
      throw new BadRequestException(
        'Invitations are not available in this service configuration',
      );
    }
    const invitation = await this.invitations.findByTokenHash(
      sha256(dto.token),
    );
    if (!invitation) {
      throw new BadRequestException('This invitation link is not valid');
    }
    if (invitation.usedAt) {
      throw new BadRequestException(
        'This invitation link has already been used',
      );
    }
    if (invitation.expiresAt <= new Date().toISOString()) {
      throw new BadRequestException('This invitation link has expired');
    }
    const admin = await this.requireAdmin(invitation.adminUserId);
    admin.passwordHash = await hashPassword(dto.password);
    admin.isActive = true;
    admin.updatedAt = new Date().toISOString();
    await this.admins.save(admin);
    invitation.usedAt = new Date().toISOString();
    await this.invitations.save(invitation);
    if (this.audit) {
      await this.audit.record({
        actorType: 'admin',
        actorId: admin.id,
        actorRole: admin.roles[0] ?? null,
        action: 'staff.invite-accepted',
        entityType: 'admin-user',
        entityId: admin.id,
        metadata: { email: admin.email },
      });
    }
    return this.toView(admin);
  }

  private async requireAdmin(id: string): Promise<StoredAdminUser> {
    const admin = await this.admins.findById(id);
    if (!admin) {
      throw new NotFoundException(`Staff account not found: ${id}`);
    }
    return admin;
  }
}
