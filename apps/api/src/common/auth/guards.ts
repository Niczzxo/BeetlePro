import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PermissionKey } from '@dostelo/types';
import {
  IS_PUBLIC_KEY,
  REQUIRE_PERMISSIONS_KEY,
} from './decorators';
import { verifyAccessToken } from './jwt';
import {
  principalFromClaims,
  type AuthPrincipal,
} from './principal';

interface RequestWithUser {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthPrincipal;
}

function bearerToken(request: RequestWithUser): string | null {
  const header = request.headers['authorization'];
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? (match[1] as string).trim() : null;
}

/**
 * Authenticates the bearer access token and attaches the
 * principal as request.user. Routes marked @Public pass through.
 * Stateless: verification is HMAC plus expiry only; revocation
 * lives on the refresh-token side (sessions), and access tokens
 * are short-lived to bound that window.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = bearerToken(request);
    const claims = token ? verifyAccessToken(token) : null;
    if (!claims) {
      throw new UnauthorizedException(
        'A valid access token is required for this route',
      );
    }
    request.user = principalFromClaims(claims);
    return true;
  }
}

/**
 * Enforces @RequirePermission keys against the principal. Runs
 * after AuthGuard. Customers hold no staff permissions, so a
 * permission-marked route always rejects a customer token with
 * 403, and rejects a staff token missing any required key with a
 * 403 naming the permission.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException(
        'A valid access token is required for this route',
      );
    }
    for (const key of required) {
      if (user.type !== 'admin' || !user.permissions.includes(key)) {
        throw new ForbiddenException(
          `Missing required permission: ${key}`,
        );
      }
    }
    return true;
  }
}
