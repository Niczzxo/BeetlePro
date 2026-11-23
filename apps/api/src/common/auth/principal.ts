import type { AdminRole, PermissionKey } from '@dostelo/types';
import type { AccessTokenClaims } from './jwt';

/**
 * The authenticated principal attached to a request by AuthGuard.
 * Customers hold no permissions; staff permissions are the union
 * across their roles, resolved at token issue time from
 * ROLE_PERMISSIONS in @dostelo/types.
 */
export interface AuthPrincipal {
  type: 'customer' | 'admin';
  /** Customer id or admin user id. */
  id: string;
  name: string;
  roles: AdminRole[];
  permissions: PermissionKey[];
}

export function principalFromClaims(
  claims: AccessTokenClaims,
): AuthPrincipal {
  return {
    type: claims.typ,
    id: claims.sub,
    name: claims.name,
    roles: claims.roles ?? [],
    permissions: claims.perms ?? [],
  };
}

export function principalHasPermission(
  principal: AuthPrincipal,
  key: PermissionKey,
): boolean {
  return principal.type === 'admin' && principal.permissions.includes(key);
}
