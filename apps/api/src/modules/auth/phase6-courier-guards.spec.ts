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
import { CourierWebhooksController } from '../shipping/courier-webhooks.controller';
import { ShippingController } from '../shipping/shipping.controller';

/**
 * Phase 6, chunk 2 guard pins: the permission metadata on the
 * shipping staff handlers (the matrix's existing shipping.read
 * and shipping.edit keys), the courier webhook route carrying
 * no staff permission (its trust is the configured secret and
 * signature, like the payment webhooks), the matrix facts
 * behind the shipping keys, and through-the-guard denials for
 * roles outside delivery work.
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
    id: 'admin-shipping',
    name: 'Shipping Admin',
    roles,
    permissions: permissionsForRoles(roles),
  };
}

describe('Phase 6 chunk 2 shipping guards', () => {
  it('guards the shipment reads with shipping.read', () => {
    expect(
      requiredPermissions(ShippingController.prototype, 'list'),
    ).toEqual(['shipping.read']);
    expect(
      requiredPermissions(ShippingController.prototype, 'detail'),
    ).toEqual(['shipping.read']);
  });

  it('guards booking and refresh with shipping.edit', () => {
    expect(
      requiredPermissions(ShippingController.prototype, 'create'),
    ).toEqual(['shipping.edit']);
    expect(
      requiredPermissions(ShippingController.prototype, 'refresh'),
    ).toEqual(['shipping.edit']);
  });

  it('leaves the courier webhook route without a staff permission requirement', () => {
    expect(
      requiredPermissions(CourierWebhooksController.prototype, 'handle'),
    ).toBeUndefined();
  });

  it('knows the shipping keys in the full permission set', () => {
    expect(ALL_PERMISSION_KEYS).toContain('shipping.read');
    expect(ALL_PERMISSION_KEYS).toContain('shipping.edit');
  });

  it('matches the matrix: delivery and store managers hold the shipping keys', () => {
    for (const role of ['delivery-manager', 'store-manager'] as const) {
      expect(roleHasPermission(role, 'shipping.read')).toBe(true);
      expect(roleHasPermission(role, 'shipping.edit')).toBe(true);
    }
    expect(roleHasPermission('sales-agent', 'shipping.read')).toBe(false);
    expect(roleHasPermission('analyst', 'shipping.read')).toBe(false);
    expect(roleHasPermission('accountant', 'shipping.edit')).toBe(false);
    expect(roleHasPermission('support-agent', 'shipping.read')).toBe(false);
  });

  it('denies a sales agent through the guard and allows a delivery manager', () => {
    expect(
      guardAllows(adminPrincipal(['sales-agent']), ['shipping.read']),
    ).toBe(false);
    expect(
      guardAllows(adminPrincipal(['delivery-manager']), ['shipping.edit']),
    ).toBe(true);
    expect(
      guardAllows(adminPrincipal(['analyst']), ['shipping.edit']),
    ).toBe(false);
  });
});
