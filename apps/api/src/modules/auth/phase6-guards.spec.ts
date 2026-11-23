import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSION_KEYS,
  permissionsForRoles,
  roleHasPermission,
  type PermissionKey,
} from '@dostelo/types';
import { REQUIRE_PERMISSIONS_KEY } from '../../common/auth/decorators';
import { PermissionsGuard } from '../../common/auth/guards';
import type { AuthPrincipal } from '../../common/auth/principal';
import { CartRecoveryController } from '../cart-recovery/cart-recovery.controller';
import { RecoveryController } from '../cart-recovery/recovery.controller';
import { CommunicationsController } from '../communications/communications.controller';

/**
 * Phase 6 guard pins: the permission metadata on the new staff
 * handlers, the matrix facts behind the recovery and
 * communications keys, the public recovery token route carrying
 * no permission requirement, and through-the-guard denials for
 * roles outside the buyer pipeline.
 */
function requiredPermissions(
  prototype: object,
  handlerName: string,
): PermissionKey[] | undefined {
  const handler = (prototype as Record<string, unknown>)[handlerName];
  expect(typeof handler).toBe('function');
  return Reflect.getMetadata(
    REQUIRE_PERMISSIONS_KEY,
    handler as object,
  ) as PermissionKey[] | undefined;
}

function guardAllows(
  principal: AuthPrincipal,
  required: PermissionKey[],
): boolean {
  const handler = (): void => undefined;
  Reflect.defineMetadata(REQUIRE_PERMISSIONS_KEY, required, handler);
  const guard = new PermissionsGuard(new Reflector());
  const context = {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({ headers: {}, user: principal }),
    }),
  };
  try {
    return guard.canActivate(context as never);
  } catch (error) {
    if (error instanceof ForbiddenException) return false;
    throw error;
  }
}

function adminPrincipal(
  roles: AuthPrincipal['roles'],
): AuthPrincipal {
  return {
    type: 'admin',
    id: 'admin-phase6',
    name: 'Phase 6 Admin',
    roles,
    permissions: permissionsForRoles(roles),
  };
}

describe('Phase 6 staff guards', () => {
  it('guards the cart recovery reads with recovery.read', () => {
    expect(
      requiredPermissions(CartRecoveryController.prototype, 'list'),
    ).toEqual(['recovery.read']);
    expect(
      requiredPermissions(CartRecoveryController.prototype, 'detail'),
    ).toEqual(['recovery.read']);
    expect(
      requiredPermissions(CartRecoveryController.prototype, 'getSettings'),
    ).toEqual(['recovery.read']);
  });

  it('guards the cart recovery actions with recovery.edit', () => {
    expect(
      requiredPermissions(CartRecoveryController.prototype, 'scan'),
    ).toEqual(['recovery.edit']);
    expect(
      requiredPermissions(
        CartRecoveryController.prototype,
        'updateSettings',
      ),
    ).toEqual(['recovery.edit']);
    expect(
      requiredPermissions(CartRecoveryController.prototype, 'cancel'),
    ).toEqual(['recovery.edit']);
    expect(
      requiredPermissions(CartRecoveryController.prototype, 'runStep'),
    ).toEqual(['recovery.edit']);
  });

  it('guards the communication log with communications.read and call logging with recovery.edit', () => {
    expect(
      requiredPermissions(CommunicationsController.prototype, 'listLog'),
    ).toEqual(['communications.read']);
    expect(
      requiredPermissions(CommunicationsController.prototype, 'logCall'),
    ).toEqual(['recovery.edit']);
  });

  it('leaves the public recovery token route without a permission requirement', () => {
    expect(
      requiredPermissions(RecoveryController.prototype, 'getByToken'),
    ).toBeUndefined();
  });

  it('knows the new keys in the full permission set', () => {
    expect(ALL_PERMISSION_KEYS).toContain('recovery.read');
    expect(ALL_PERMISSION_KEYS).toContain('recovery.edit');
    expect(ALL_PERMISSION_KEYS).toContain('communications.read');
  });

  it('matches the matrix: the buyer pipeline roles hold the recovery keys', () => {
    for (const role of ['crm-manager', 'sales-agent', 'store-manager'] as const) {
      expect(roleHasPermission(role, 'recovery.read')).toBe(true);
      expect(roleHasPermission(role, 'recovery.edit')).toBe(true);
      expect(roleHasPermission(role, 'communications.read')).toBe(true);
    }
    expect(roleHasPermission('analyst', 'recovery.read')).toBe(true);
    expect(roleHasPermission('analyst', 'recovery.edit')).toBe(false);
    expect(roleHasPermission('marketing-manager', 'communications.read')).toBe(
      true,
    );
    expect(roleHasPermission('marketing-manager', 'recovery.edit')).toBe(
      false,
    );
    expect(roleHasPermission('support-agent', 'recovery.read')).toBe(false);
    expect(roleHasPermission('support-agent', 'communications.read')).toBe(
      false,
    );
    expect(roleHasPermission('accountant', 'recovery.read')).toBe(false);
  });

  it('denies a support agent through the guard and allows a sales agent', () => {
    expect(
      guardAllows(adminPrincipal(['support-agent']), ['recovery.read']),
    ).toBe(false);
    expect(
      guardAllows(adminPrincipal(['sales-agent']), ['recovery.edit']),
    ).toBe(true);
    expect(
      guardAllows(adminPrincipal(['analyst']), ['recovery.edit']),
    ).toBe(false);
  });
});
