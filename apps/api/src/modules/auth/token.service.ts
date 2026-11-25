import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AuthTokens } from '@dostelo/types';
import { signAccessToken } from '../../common/auth/jwt';
import type { AuthPrincipal } from '../../common/auth/principal';
import type { StoredSession } from '../../store/in-memory.store';
import { SessionsRepository } from './repositories/sessions.repository';

export const REFRESH_TOKEN_TTL_DAYS = Number(
  process.env.AUTH_REFRESH_TTL_DAYS ?? 30,
);

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Token pair mechanics: short-lived JWT access tokens (see
 * common/auth/jwt for the implementation choice) plus opaque
 * refresh tokens. Refresh tokens are 32 random bytes, base64url;
 * only their SHA-256 hash is stored, in a Session record. Every
 * refresh rotates: the old session is revoked and points at its
 * successor in the same family.
 */
@Injectable()
export class TokenService {
  constructor(private readonly sessions: SessionsRepository) {}

  /** Issues a pair. Pass an existing familyId to continue a
   * family (rotation); omit it to start a new one (login). */
  async issuePair(
    principal: AuthPrincipal,
    familyId?: string,
  ): Promise<{ tokens: AuthTokens; session: StoredSession }> {
    const refreshToken = randomBytes(32).toString('base64url');
    const now = new Date();
    const session: StoredSession = {
      id: randomUUID(),
      subjectType: principal.type,
      subjectId: principal.id,
      familyId: familyId ?? randomUUID(),
      refreshTokenHash: hashRefreshToken(refreshToken),
      replacedById: null,
      revokedAt: null,
      expiresAt: new Date(
        now.getTime() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString(),
      createdAt: now.toISOString(),
    };
    await this.sessions.create(session);
    const { token, expiresIn } = signAccessToken({
      subjectId: principal.id,
      subjectType: principal.type,
      roles: principal.roles,
      permissions: principal.permissions,
      name: principal.name,
    });
    return {
      session,
      tokens: {
        accessToken: token,
        refreshToken,
        tokenType: 'Bearer',
        expiresIn,
        principal: {
          type: principal.type,
          id: principal.id,
          roles: principal.roles,
          permissions: principal.permissions,
        },
      },
    };
  }

  async findSessionByRefreshToken(token: string): Promise<StoredSession | null> {
    return this.sessions.findByRefreshHash(hashRefreshToken(token));
  }

  /** Marks a session revoked. With replacedById set, this is a
   * rotation; without it, a logout or a security revocation. */
  async revoke(session: StoredSession, replacedById: string | null): Promise<void> {
    session.revokedAt = new Date().toISOString();
    session.replacedById = replacedById;
    await this.sessions.save(session);
  }

  /** Revokes every still-active session in a family. Used when a
   * rotated token is reused, which means the token chain leaked. */
  async listBySubject(
    subjectType: 'customer' | 'admin',
    subjectId: string,
  ): Promise<StoredSession[]> {
    return this.sessions.listBySubject(subjectType, subjectId);
  }

  async revokeFamily(familyId: string): Promise<void> {
    for (const session of await this.sessions.listByFamily(familyId)) {
      if (!session.revokedAt) {
        session.revokedAt = new Date().toISOString();
        await this.sessions.save(session);
      }
    }
  }
}
