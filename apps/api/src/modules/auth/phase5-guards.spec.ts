import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import {
  permissionsForRoles,
  roleHasPermission,
  type PermissionKey,
} from '@dostelo/types';
import { REQUIRE_PERMISSIONS_KEY } from '../../common/auth/decorators';
import { PermissionsGuard } from '../../common/auth/guards';
import type { AuthPrincipal } from '../../common/auth/principal';
import { BuyerIntelligenceController } from '../buyer-intelligence/buyer-intelligence.controller';
import { CrmController } from '../crm/crm.controller';
import { LeadsController } from '../leads/leads.controller';

/**
 * Phase 5 guard pins: the permission metadata on every new staff
 * handler, the matrix facts behind them, and a through-the-guard
 * denial for a role without buyers.read (support-agent holds no
 * Buyer Intelligence access in the master structure matrix).
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
    id: 'admin-phase5',
    name: 'Phase 5 Admin',
    roles,
    permissions: permissionsForRoles(roles),
  };
}

describe('Phase 5 staff guards', () => {
  it('guards the Buyer Intelligence reads with buyers.read', () => {
    expect(
      requiredPermissions(BuyerIntelligenceController.prototype, 'listSessions'),
    ).toEqual(['buyers.read']);
    expect(
      requiredPermissions(BuyerIntelligenceController.prototype, 'getSession'),
    ).toEqual(['buyers.read']);
  });

  it('guards the lead endpoints with the leads keys', () => {
    expect(requiredPermissions(LeadsController.prototype, 'create')).toEqual([
      'leads.create',
    ]);
    expect(requiredPermissions(LeadsController.prototype, 'list')).toEqual([
      'leads.read',
    ]);
    expect(requiredPermissions(LeadsController.prototype, 'detail')).toEqual([
      'leads.read',
    ]);
    expect(requiredPermissions(LeadsController.prototype, 'assign')).toEqual([
      'leads.assign',
    ]);
    expect(
      requiredPermissions(LeadsController.prototype, 'changeStatus'),
    ).toEqual(['leads.edit']);
    expect(
      requiredPermissions(LeadsController.prototype, 'recordAttempt'),
    ).toEqual(['leads.contact']);
    expect(requiredPermissions(LeadsController.prototype, 'optOut')).toEqual([
      'leads.edit',
    ]);
  });

  it('guards the CRM endpoints with the customers keys', () => {
    expect(requiredPermissions(CrmController.prototype, 'timeline')).toEqual([
      'customers.read',
    ]);
    expect(requiredPermissions(CrmController.prototype, 'addNote')).toEqual([
      'customers.edit',
    ]);
    expect(requiredPermissions(CrmController.prototype, 'addTag')).toEqual([
      'customers.edit',
    ]);
    expect(requiredPermissions(CrmController.prototype, 'removeTag')).toEqual([
      'customers.edit',
    ]);
  });

  it('matches the matrix: support-agent and product-manager hold no buyers.read', () => {
    expect(roleHasPermission('support-agent', 'buyers.read')).toBe(false);
    expect(roleHasPermission('product-manager', 'buyers.read')).toBe(false);
    expect(roleHasPermission('crm-manager', 'buyers.read')).toBe(true);
    expect(roleHasPermission('crm-manager', 'buyers.contact')).toBe(true);
    expect(roleHasPermission('sales-agent', 'buyers.read')).toBe(true);
    expect(roleHasPermission('sales-agent', 'buyers.contact')).toBe(false);
    expect(roleHasPermission('analyst', 'buyers.read')).toBe(true);
    expect(roleHasPermission('sales-agent', 'leads.contact')).toBe(true);
    expect(roleHasPermission('analyst', 'leads.contact')).toBe(false);
  });

  it('denies a support-agent through the guard on a buyers.read route', () => {
    expect(
      guardAllows(adminPrincipal(['support-agent']), ['buyers.read']),
    ).toBe(false);
    expect(
      guardAllows(adminPrincipal(['crm-manager']), ['buyers.read']),
    ).toBe(true);
    // A customer token never holds staff permissions.
    const customer: AuthPrincipal = {
      type: 'customer',
      id: 'customer-1',
      name: 'Customer',
      roles: [],
      permissions: [],
    };
    expect(guardAllows(customer, ['buyers.read'])).toBe(false);
  });
});
