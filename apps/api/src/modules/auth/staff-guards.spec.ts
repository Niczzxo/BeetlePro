import { describe, expect, it } from 'vitest';
import type { PermissionKey } from '@dostelo/types';
import { REQUIRE_PERMISSIONS_KEY } from '../../common/auth/decorators';
import { CustomersController } from '../customers/customers.controller';
import { InventoryController } from '../inventory/inventory.controller';
import { AdminOrdersController } from '../orders/admin-orders.controller';
import { PaymentsController } from '../payments/payments.controller';

/**
 * Phase 4 chunk 2 wired the admin portal to the API, which meant
 * closing the staff-shaped reads that were still unguarded:
 * payment reconciliation reads, inventory reads, the staff
 * customer list and the staff order reads. These assertions pin
 * the permission metadata on each handler so a future refactor
 * cannot silently drop a guard. End-to-end 401 and 403 behaviour
 * is covered by the PermissionsGuard tests in
 * auth.service.spec.ts.
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

describe('Staff read guards (Phase 4 chunk 2)', () => {
  it('guards the payment reconciliation reads with payments.read', () => {
    expect(requiredPermissions(PaymentsController.prototype, 'list')).toEqual([
      'payments.read',
    ]);
    expect(
      requiredPermissions(PaymentsController.prototype, 'summary'),
    ).toEqual(['payments.read']);
    expect(requiredPermissions(PaymentsController.prototype, 'get')).toEqual([
      'payments.read',
    ]);
  });

  it('guards the inventory reads with inventory.read', () => {
    expect(
      requiredPermissions(InventoryController.prototype, 'listStock'),
    ).toEqual(['inventory.read']);
    expect(
      requiredPermissions(InventoryController.prototype, 'getStock'),
    ).toEqual(['inventory.read']);
  });

  it('guards the staff customer list with customers.read', () => {
    expect(requiredPermissions(CustomersController.prototype, 'list')).toEqual(
      ['customers.read'],
    );
  });

  it('guards the staff order reads with orders.read', () => {
    expect(
      requiredPermissions(AdminOrdersController.prototype, 'list'),
    ).toEqual(['orders.read']);
    expect(
      requiredPermissions(AdminOrdersController.prototype, 'detail'),
    ).toEqual(['orders.read']);
  });
});
