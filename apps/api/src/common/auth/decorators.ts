import {
  createParamDecorator,
  SetMetadata,
  type ExecutionContext,
} from '@nestjs/common';
import type { PermissionKey } from '@dostelo/types';
import type { AuthPrincipal } from './principal';

export const REQUIRE_PERMISSIONS_KEY = 'dostelo:require-permissions';
export const IS_PUBLIC_KEY = 'dostelo:is-public';

/**
 * Marks a route (or controller) as requiring staff permissions.
 * AuthGuard must run first; PermissionsGuard enforces these keys.
 * A route with AuthGuard but no RequirePermission accepts any
 * authenticated principal.
 */
export const RequirePermission = (...keys: PermissionKey[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, keys);

/** Marks a route as not needing a token even inside a guarded
 * controller. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Injects the AuthPrincipal that AuthGuard attached, or null. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal | null => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user?: AuthPrincipal }>();
    return request.user ?? null;
  },
);

/** Injects the client IP for audit records, or null. */
export const ClientIp = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ ip?: string }>();
    return request.ip ?? null;
  },
);
