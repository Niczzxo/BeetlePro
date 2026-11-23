import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import type { AdminRole, PermissionKey } from '@dostelo/types';

/**
 * Minimal HS256 JWT implementation on Node crypto.
 *
 * Why hand-rolled instead of the jsonwebtoken package: the token
 * shape here is small and fixed (one issuer, one algorithm, one
 * secret), Node's HMAC plus timingSafeEqual covers it without a
 * new dependency, and pinning alg to HS256 in the verifier avoids
 * the algorithm-confusion class of bugs entirely. If the platform
 * later needs JWKS or multiple issuers, swap this file for a
 * vetted library; the call sites only use the two functions
 * below.
 */

export interface AccessTokenClaims {
  sub: string;
  typ: 'customer' | 'admin';
  roles: AdminRole[];
  perms: PermissionKey[];
  name: string;
  iat: number;
  exp: number;
  jti: string;
}

export const ACCESS_TOKEN_TTL_SECONDS = Number(
  process.env.AUTH_ACCESS_TTL_SECONDS ?? 900,
);

let ephemeralSecret: string | null = null;

/**
 * The signing secret. Production must set AUTH_SECRET. When it is
 * unset (local development and tests), an ephemeral per-process
 * secret is generated and a warning is logged: tokens simply stop
 * verifying on restart. A secret is never hardcoded here.
 */
export function getAuthSecret(): string {
  const configured = process.env.AUTH_SECRET;
  if (configured && configured.length >= 16) return configured;
  if (!ephemeralSecret) {
    ephemeralSecret = randomBytes(32).toString('hex');
    console.warn(
      '[auth] AUTH_SECRET is not set (or too short). Using an ephemeral per-process secret: access tokens will not survive a restart. Set AUTH_SECRET in production.',
    );
  }
  return ephemeralSecret;
}

function base64urlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64');
}

function sign(signingInput: string): string {
  return base64urlEncode(
    createHmac('sha256', getAuthSecret()).update(signingInput).digest(),
  );
}

export function signAccessToken(input: {
  subjectId: string;
  subjectType: 'customer' | 'admin';
  roles: AdminRole[];
  permissions: PermissionKey[];
  name: string;
}): { token: string; expiresIn: number } {
  const now = Math.floor(Date.now() / 1000);
  const claims: AccessTokenClaims = {
    sub: input.subjectId,
    typ: input.subjectType,
    roles: input.roles,
    perms: input.permissions,
    name: input.name,
    iat: now,
    exp: now + ACCESS_TOKEN_TTL_SECONDS,
    jti: randomUUID(),
  };
  const header = base64urlEncode(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  );
  const payload = base64urlEncode(JSON.stringify(claims));
  const signature = sign(`${header}.${payload}`);
  return {
    token: `${header}.${payload}.${signature}`,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

/** Verifies signature and expiry. Returns null for anything
 * malformed, forged or expired; callers turn null into a 401. */
export function verifyAccessToken(token: string): AccessTokenClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts as [
    string,
    string,
    string,
  ];
  let header: { alg?: string };
  let claims: AccessTokenClaims;
  try {
    header = JSON.parse(base64urlDecode(headerPart).toString('utf8'));
    claims = JSON.parse(base64urlDecode(payloadPart).toString('utf8'));
  } catch {
    return null;
  }
  if (header.alg !== 'HS256') return null;
  const expected = sign(`${headerPart}.${payloadPart}`);
  const given = Buffer.from(signaturePart);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    return null;
  }
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) {
    return null;
  }
  if (typeof claims.sub !== 'string' || !claims.sub) return null;
  if (claims.typ !== 'customer' && claims.typ !== 'admin') return null;
  return claims;
}
