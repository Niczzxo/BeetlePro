import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
  type OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ADMIN_ROLES,
  permissionsForRoles,
  type AdminLoginResult,
  type AdminRole,
  type AuthTokens,
  type Customer,
} from '@dostelo/types';
import type {
  AdminLogin,
  CustomerLogin,
  CustomerRegistration,
} from '@dostelo/validation';
import { hashPassword, verifyPassword } from '../../common/password';
import {
  buildOtpauthUrl,
  generateTotpSecret,
  verifyTotp,
} from '../../common/auth/totp';
import type { AuthPrincipal } from '../../common/auth/principal';
import type { StoredAdminUser } from '../../store/in-memory.store';
import { AuditService } from '../audit/audit.service';
import { CustomersService } from '../customers/customers.service';
import { AdminsRepository } from './repositories/admins.repository';
import { TokenService } from './token.service';

interface MfaChallengeRecord {
  adminId: string;
  expiresAt: number;
  attempts: number;
}

const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MFA_CHALLENGE_MAX_ATTEMPTS = 5;

/**
 * Authentication (Phase 4, chunk 1).
 *
 * Customers: register delegates to the customers module (which
 * hashes with scrypt); login verifies against that hash. Staff:
 * admin accounts exist only when seeded from ADMIN_SEED_EMAIL and
 * ADMIN_SEED_PASSWORD; there are no default credentials anywhere
 * in code. Both get the same token pair: a short-lived JWT access
 * token and a rotating refresh token (see TokenService). Admin
 * accounts can enrol in TOTP MFA; with MFA on, password login
 * returns a challenge and only the code exchange issues tokens.
 */
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly challenges = new Map<string, MfaChallengeRecord>();

  constructor(
    private readonly customers: CustomersService,
    private readonly admins: AdminsRepository,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    void this.seedAdminFromEnvironment();
  }

  // ----------------------------------------------------------------
  // Admin seeding
  // ----------------------------------------------------------------

  /**
   * Creates the first staff account from the environment when
   * both variables are set and no account with that email exists.
   * ADMIN_SEED_ROLE picks the role (default super-admin). With
   * the variables absent, no admin exists and admin login says so.
   */
  async seedAdminFromEnvironment(): Promise<StoredAdminUser | null> {
    const email = process.env.ADMIN_SEED_EMAIL?.trim();
    const password = process.env.ADMIN_SEED_PASSWORD;
    if (!email || !password) return null;
    const existing = this.admins.findByEmail(email);
    if (existing) return existing;
    const requestedRole = process.env.ADMIN_SEED_ROLE?.trim();
    const role: AdminRole = ADMIN_ROLES.includes(
      requestedRole as AdminRole,
    )
      ? (requestedRole as AdminRole)
      : 'super-admin';
    const now = new Date().toISOString();
    const admin: StoredAdminUser = {
      id: randomUUID(),
      email,
      displayName: email.split('@')[0] ?? email,
      passwordHash: await hashPassword(password),
      roles: [role],
      isActive: true,
      mfaSecret: null,
      mfaEnabled: false,
      createdAt: now,
      updatedAt: now,
    };
    this.admins.create(admin);
    this.audit.record({
      actorType: 'system',
      actorId: null,
      action: 'admin.seeded',
      entityType: 'admin-user',
      entityId: admin.id,
      metadata: { email, role },
    });
    return admin;
  }

  // ----------------------------------------------------------------
  // Customers
  // ----------------------------------------------------------------

  async registerCustomer(
    dto: CustomerRegistration,
  ): Promise<{ customer: Customer; tokens: AuthTokens }> {
    const customer = await this.customers.register(dto);
    const tokens = this.tokens.issuePair({
      type: 'customer',
      id: customer.id,
      name: customer.fullName,
      roles: [],
      permissions: [],
    }).tokens;
    return { customer, tokens };
  }

  async loginCustomer(
    dto: CustomerLogin,
    ip: string | null,
  ): Promise<AuthTokens> {
    const customer = await this.customers.verifyCredentials(
      dto.identifier,
      dto.password,
    );
    if (!customer) {
      const known = this.customers.findStoredByIdentifier(dto.identifier);
      this.audit.record({
        actorType: 'customer',
        actorId: known?.id ?? null,
        action: 'auth.login.failed',
        entityType: 'customer',
        entityId: known?.id ?? null,
        metadata: { identifier: dto.identifier },
        ipAddress: ip,
      });
      throw new UnauthorizedException('Invalid credentials');
    }
    this.audit.record({
      actorType: 'customer',
      actorId: customer.id,
      action: 'auth.login.succeeded',
      entityType: 'customer',
      entityId: customer.id,
      ipAddress: ip,
    });
    return this.tokens.issuePair({
      type: 'customer',
      id: customer.id,
      name: customer.fullName,
      roles: [],
      permissions: [],
    }).tokens;
  }

  // ----------------------------------------------------------------
  // Admins
  // ----------------------------------------------------------------

  async loginAdmin(
    dto: AdminLogin,
    ip: string | null,
  ): Promise<AdminLoginResult> {
    const admin = this.admins.findByEmail(dto.email);
    if (!admin) {
      if (this.admins.count() === 0) {
        throw new ServiceUnavailableException(
          'Admin login is not configured: no admin account has been seeded. Set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD and restart the API.',
        );
      }
      this.recordAdminLoginFailure(null, dto.email, ip, 'unknown-email');
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!admin.isActive) {
      this.recordAdminLoginFailure(admin, dto.email, ip, 'inactive');
      throw new UnauthorizedException('This admin account is disabled');
    }
    const passwordOk = await verifyPassword(
      dto.password,
      admin.passwordHash,
    );
    if (!passwordOk) {
      this.recordAdminLoginFailure(admin, dto.email, ip, 'bad-password');
      throw new UnauthorizedException('Invalid credentials');
    }
    if (admin.mfaEnabled && admin.mfaSecret) {
      const challengeId = randomUUID();
      const expiresAt = Date.now() + MFA_CHALLENGE_TTL_MS;
      this.challenges.set(challengeId, {
        adminId: admin.id,
        expiresAt,
        attempts: 0,
      });
      this.audit.record({
        actorType: 'admin',
        actorId: admin.id,
        actorRole: admin.roles[0] ?? null,
        action: 'auth.mfa.challenge',
        entityType: 'admin-user',
        entityId: admin.id,
        ipAddress: ip,
      });
      return {
        mfaRequired: true,
        challengeId,
        expiresAt: new Date(expiresAt).toISOString(),
      };
    }
    return this.issueAdminTokens(admin, ip, { mfa: false });
  }

  /** Second step of MFA login: exchange a challenge plus a valid
   * TOTP code for the token pair. */
  exchangeMfaChallenge(
    challengeId: string,
    code: string,
    ip: string | null,
  ): AuthTokens {
    const challenge = this.challenges.get(challengeId);
    if (!challenge || challenge.expiresAt <= Date.now()) {
      this.challenges.delete(challengeId);
      throw new UnauthorizedException(
        'MFA challenge is unknown or has expired. Log in again.',
      );
    }
    const admin = this.admins.findById(challenge.adminId);
    if (!admin || !admin.mfaSecret) {
      this.challenges.delete(challengeId);
      throw new UnauthorizedException(
        'MFA challenge is unknown or has expired. Log in again.',
      );
    }
    challenge.attempts += 1;
    if (challenge.attempts > MFA_CHALLENGE_MAX_ATTEMPTS) {
      this.challenges.delete(challengeId);
      throw new UnauthorizedException(
        'Too many incorrect codes. Log in again.',
      );
    }
    if (!verifyTotp(admin.mfaSecret, code)) {
      this.audit.record({
        actorType: 'admin',
        actorId: admin.id,
        actorRole: admin.roles[0] ?? null,
        action: 'auth.mfa.failed',
        entityType: 'admin-user',
        entityId: admin.id,
        ipAddress: ip,
      });
      throw new UnauthorizedException('Invalid code');
    }
    this.challenges.delete(challengeId);
    return this.issueAdminTokens(admin, ip, { mfa: true });
  }

  // ----------------------------------------------------------------
  // MFA management (authenticated admin)
  // ----------------------------------------------------------------

  /** Starts enrolment: generates and stores a secret and returns
   * it with the otpauth URL for an authenticator app. MFA is not
   * active until enableMfa confirms a code from that secret. */
  enrollMfa(
    principal: AuthPrincipal,
    ip: string | null,
  ): { secret: string; otpauthUrl: string } {
    const admin = this.requireAdmin(principal);
    if (admin.mfaEnabled) {
      throw new BadRequestException(
        'MFA is already enabled on this account. Disable it before enrolling again.',
      );
    }
    const secret = generateTotpSecret();
    admin.mfaSecret = secret;
    admin.updatedAt = new Date().toISOString();
    this.admins.save(admin);
    this.audit.record({
      actorType: 'admin',
      actorId: admin.id,
      actorRole: admin.roles[0] ?? null,
      action: 'admin.mfa.enrolled',
      entityType: 'admin-user',
      entityId: admin.id,
      ipAddress: ip,
    });
    return {
      secret,
      otpauthUrl: buildOtpauthUrl({ secret, account: admin.email }),
    };
  }

  enableMfa(
    principal: AuthPrincipal,
    code: string,
    ip: string | null,
  ): { mfaEnabled: true } {
    const admin = this.requireAdmin(principal);
    if (admin.mfaEnabled) {
      throw new BadRequestException('MFA is already enabled');
    }
    if (!admin.mfaSecret) {
      throw new BadRequestException(
        'No MFA enrolment in progress. Enrol first, then enable with a code.',
      );
    }
    if (!verifyTotp(admin.mfaSecret, code)) {
      throw new UnauthorizedException('Invalid code');
    }
    admin.mfaEnabled = true;
    admin.updatedAt = new Date().toISOString();
    this.admins.save(admin);
    this.audit.record({
      actorType: 'admin',
      actorId: admin.id,
      actorRole: admin.roles[0] ?? null,
      action: 'admin.mfa.enabled',
      entityType: 'admin-user',
      entityId: admin.id,
      ipAddress: ip,
    });
    return { mfaEnabled: true };
  }

  disableMfa(
    principal: AuthPrincipal,
    code: string,
    ip: string | null,
  ): { mfaEnabled: false } {
    const admin = this.requireAdmin(principal);
    if (!admin.mfaEnabled || !admin.mfaSecret) {
      throw new BadRequestException('MFA is not enabled on this account');
    }
    if (!verifyTotp(admin.mfaSecret, code)) {
      throw new UnauthorizedException('Invalid code');
    }
    admin.mfaEnabled = false;
    admin.mfaSecret = null;
    admin.updatedAt = new Date().toISOString();
    this.admins.save(admin);
    this.audit.record({
      actorType: 'admin',
      actorId: admin.id,
      actorRole: admin.roles[0] ?? null,
      action: 'admin.mfa.disabled',
      entityType: 'admin-user',
      entityId: admin.id,
      ipAddress: ip,
    });
    return { mfaEnabled: false };
  }

  // ----------------------------------------------------------------
  // Refresh and logout
  // ----------------------------------------------------------------

  /**
   * Rotates a refresh token. Presenting an already-rotated token
   * means the chain leaked: the whole family is revoked and the
   * caller must log in again.
   */
  refresh(refreshToken: string): AuthTokens {
    const session = this.tokens.findSessionByRefreshToken(refreshToken);
    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (session.revokedAt) {
      if (session.replacedById) {
        this.tokens.revokeFamily(session.familyId);
        throw new UnauthorizedException(
          'Refresh token reuse detected. All sessions for this login have been revoked; log in again.',
        );
      }
      throw new UnauthorizedException('This session has been revoked');
    }
    if (session.expiresAt <= new Date().toISOString()) {
      this.tokens.revoke(session, null);
      throw new UnauthorizedException('Refresh token has expired');
    }
    const principal = this.principalForSession(session.subjectType, session.subjectId);
    if (!principal) {
      this.tokens.revokeFamily(session.familyId);
      throw new UnauthorizedException('The session owner no longer exists');
    }
    const issued = this.tokens.issuePair(principal, session.familyId);
    this.tokens.revoke(session, issued.session.id);
    return issued.tokens;
  }

  /** Revokes the session behind a refresh token. Idempotent:
   * unknown tokens answer as if revoked. */
  logout(refreshToken: string): { revoked: boolean } {
    const session = this.tokens.findSessionByRefreshToken(refreshToken);
    if (session && !session.revokedAt) {
      this.tokens.revoke(session, null);
      return { revoked: true };
    }
    return { revoked: false };
  }

  // ----------------------------------------------------------------
  // Internals
  // ----------------------------------------------------------------

  private principalForSession(
    type: 'customer' | 'admin',
    subjectId: string,
  ): AuthPrincipal | null {
    if (type === 'customer') {
      let customer: ReturnType<CustomersService['findStored']>;
      try {
        customer = this.customers.findStored(subjectId);
      } catch {
        return null;
      }
      return {
        type: 'customer',
        id: customer.id,
        name: customer.fullName,
        roles: [],
        permissions: [],
      };
    }
    const admin = this.admins.findById(subjectId);
    if (!admin || !admin.isActive) return null;
    return {
      type: 'admin',
      id: admin.id,
      name: admin.displayName,
      roles: admin.roles,
      permissions: permissionsForRoles(admin.roles),
    };
  }

  private issueAdminTokens(
    admin: StoredAdminUser,
    ip: string | null,
    metadata: { mfa: boolean },
  ): AuthTokens {
    this.audit.record({
      actorType: 'admin',
      actorId: admin.id,
      actorRole: admin.roles[0] ?? null,
      action: 'admin.login.succeeded',
      entityType: 'admin-user',
      entityId: admin.id,
      metadata,
      ipAddress: ip,
    });
    return this.tokens.issuePair({
      type: 'admin',
      id: admin.id,
      name: admin.displayName,
      roles: admin.roles,
      permissions: permissionsForRoles(admin.roles),
    }).tokens;
  }

  private recordAdminLoginFailure(
    admin: StoredAdminUser | null,
    email: string,
    ip: string | null,
    reason: string,
  ): void {
    this.audit.record({
      actorType: 'admin',
      actorId: admin?.id ?? null,
      actorRole: admin?.roles[0] ?? null,
      action: 'admin.login.failed',
      entityType: 'admin-user',
      entityId: admin?.id ?? null,
      metadata: { email, reason },
      ipAddress: ip,
    });
  }

  private requireAdmin(principal: AuthPrincipal): StoredAdminUser {
    if (principal.type !== 'admin') {
      throw new ForbiddenException('This action needs an admin account');
    }
    const admin = this.admins.findById(principal.id);
    if (!admin) {
      throw new UnauthorizedException('Admin account not found');
    }
    return admin;
  }
}
