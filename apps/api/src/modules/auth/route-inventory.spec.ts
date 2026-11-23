import { describe, expect, it } from 'vitest';
import type { PermissionKey } from '@dostelo/types';
import { AppModule } from '../../app.module';
import { REQUIRE_PERMISSIONS_KEY } from '../../common/auth/decorators';
import { AuthGuard, PermissionsGuard } from '../../common/auth/guards';

/**
 * Route guard inventory (Phase 7 security review).
 *
 * The route table is enumerated from the real Nest module
 * metadata, not typed by hand, and every route must appear in
 * the classified table below with the expected protection:
 *
 * - staff: AuthGuard plus PermissionsGuard plus exactly the
 *   listed permission keys. A new staff route that ships
 *   without a guard, or a guard dropped in a refactor, fails
 *   here before it can fail in production.
 * - authenticated: AuthGuard only. These routes serve a
 *   signed-in principal and enforce ownership or role rules in
 *   the handler (own profile, own orders, own MFA, own visitor
 *   link).
 * - public: no AuthGuard. Each entry is public by design:
 *   storefront reads, guest carts and checkout, auth entry
 *   points, first-party event ingestion, the recovery link
 *   (the token is the credential), order tracking by order
 *   number, and the signature-verified webhook receivers.
 *
 * Adding any route to the API fails this spec until a human
 * classifies it in the table. That friction is the point.
 */

type RouteCategory = 'staff' | 'authenticated' | 'public';

interface ExpectedRoute {
  method: string;
  path: string;
  category: RouteCategory;
  permissions?: PermissionKey[];
}

const staff = (
  method: string,
  path: string,
  permissions: PermissionKey[],
): ExpectedRoute => ({ method, path, category: 'staff', permissions });
const authenticated = (method: string, path: string): ExpectedRoute => ({
  method,
  path,
  category: 'authenticated',
});
const pub = (method: string, path: string): ExpectedRoute => ({
  method,
  path,
  category: 'public',
});

const EXPECTED_ROUTES: ExpectedRoute[] = [
  // Staff: /v1/admin surfaces.
  staff('GET', '/v1/admin/audit-log', ['audit.read']),
  staff('GET', '/v1/admin/buyer-intelligence/sessions', ['buyers.read']),
  staff('GET', '/v1/admin/buyer-intelligence/sessions/:sessionId', [
    'buyers.read',
  ]),
  staff('GET', '/v1/admin/orders', ['orders.read']),
  staff('GET', '/v1/admin/orders/:orderNumber', ['orders.read']),
  // Staff: cart recovery operations.
  staff('GET', '/v1/cart-recovery', ['recovery.read']),
  staff('GET', '/v1/cart-recovery/settings', ['recovery.read']),
  staff('PUT', '/v1/cart-recovery/settings', ['recovery.edit']),
  staff('POST', '/v1/cart-recovery/scan', ['recovery.edit']),
  staff('GET', '/v1/cart-recovery/:id', ['recovery.read']),
  staff('POST', '/v1/cart-recovery/:id/cancel', ['recovery.edit']),
  staff('POST', '/v1/cart-recovery/:id/run-step', ['recovery.edit']),
  // Staff: communications.
  staff('GET', '/v1/communications/log', ['communications.read']),
  staff('POST', '/v1/communications/calls', ['recovery.edit']),
  // Staff: CRM.
  staff('GET', '/v1/crm/customers/:id/timeline', ['customers.read']),
  staff('POST', '/v1/crm/customers/:id/notes', ['customers.edit']),
  staff('POST', '/v1/crm/customers/:id/tags', ['customers.edit']),
  staff('DELETE', '/v1/crm/customers/:id/tags/:tag', ['customers.edit']),
  // Staff: customers, inventory, leads.
  staff('GET', '/v1/customers', ['customers.read']),
  staff('GET', '/v1/inventory', ['inventory.read']),
  staff('GET', '/v1/inventory/:variantId', ['inventory.read']),
  staff('POST', '/v1/inventory/:variantId/adjust', ['inventory.adjust']),
  staff('POST', '/v1/leads', ['leads.create']),
  staff('GET', '/v1/leads', ['leads.read']),
  staff('GET', '/v1/leads/:id', ['leads.read']),
  staff('POST', '/v1/leads/:id/assign', ['leads.assign']),
  staff('POST', '/v1/leads/:id/status', ['leads.edit']),
  staff('POST', '/v1/leads/:id/follow-ups', ['leads.edit']),
  staff('GET', '/v1/leads/:id/follow-ups', ['leads.read']),
  staff('POST', '/v1/leads/:id/follow-ups/:taskId/complete', [
    'leads.edit',
  ]),
  staff('POST', '/v1/leads/:id/contact-attempts', ['leads.contact']),
  staff('GET', '/v1/leads/:id/contact-attempts', ['leads.read']),
  staff('POST', '/v1/leads/:id/opt-out', ['leads.edit']),
  // Staff: orders and payments.
  staff('POST', '/v1/orders/:orderNumber/status', ['orders.edit']),
  staff('GET', '/v1/payments', ['payments.read']),
  staff('GET', '/v1/payments/summary', ['payments.read']),
  staff('GET', '/v1/payments/:paymentId', ['payments.read']),
  staff('POST', '/v1/payments/:paymentId/verify', ['payments.verify']),
  staff('POST', '/v1/payments/:paymentId/refunds', ['payments.refund']),
  staff('POST', '/v1/payments/:paymentId/refunds/:refundId/confirm', [
    'payments.refund',
  ]),
  // Staff: shipping.
  staff('POST', '/v1/shipping', ['shipping.edit']),
  staff('GET', '/v1/shipping', ['shipping.read']),
  staff('GET', '/v1/shipping/:id', ['shipping.read']),
  staff('POST', '/v1/shipping/:id/refresh', ['shipping.edit']),
  // Authenticated principals (ownership enforced in handlers).
  authenticated('GET', '/v1/customers/:id'),
  authenticated('GET', '/v1/orders'),
  authenticated('POST', '/v1/auth/admin/mfa/enroll'),
  authenticated('POST', '/v1/auth/admin/mfa/enable'),
  authenticated('POST', '/v1/auth/admin/mfa/disable'),
  authenticated('POST', '/v1/visitors/link'),
  // Public by design.
  pub('GET', '/health'),
  pub('GET', '/v1/catalog/products'),
  pub('GET', '/v1/catalog/products/:key'),
  pub('GET', '/v1/catalog/categories'),
  pub('POST', '/v1/carts'),
  pub('GET', '/v1/carts/:id'),
  pub('POST', '/v1/carts/:id/lines'),
  pub('PATCH', '/v1/carts/:id/lines/:lineId'),
  pub('DELETE', '/v1/carts/:id/lines/:lineId'),
  pub('POST', '/v1/checkout/quote'),
  pub('POST', '/v1/checkout/place-order'),
  pub('POST', '/v1/auth/register'),
  pub('POST', '/v1/auth/login'),
  pub('POST', '/v1/auth/refresh'),
  pub('POST', '/v1/auth/logout'),
  pub('POST', '/v1/auth/admin/login'),
  pub('POST', '/v1/auth/admin/mfa/exchange'),
  pub('POST', '/v1/customers/register'),
  pub('POST', '/v1/visitor-events'),
  pub('POST', '/v1/visitors/consent'),
  pub('GET', '/v1/recovery/:token'),
  pub('GET', '/v1/orders/:orderNumber'),
  pub('POST', '/v1/payments/initiate'),
  pub('POST', '/v1/payments/:paymentId/confirm'),
  pub('POST', '/v1/webhooks/:gateway'),
  pub('POST', '/v1/webhooks/couriers/:courier'),
];

const METHOD_NAMES: Record<number, string> = {
  0: 'GET',
  1: 'POST',
  2: 'PUT',
  3: 'DELETE',
  4: 'PATCH',
  5: 'ALL',
  6: 'OPTIONS',
  7: 'HEAD',
  8: 'SEARCH',
};

interface ActualRoute {
  method: string;
  path: string;
  guards: Set<unknown>;
  permissions: PermissionKey[];
}

function collectControllers(
  moduleClass: unknown,
  seen: Set<unknown>,
  out: object[],
): void {
  if (typeof moduleClass !== 'function' || seen.has(moduleClass)) return;
  seen.add(moduleClass);
  const controllers =
    (Reflect.getMetadata('controllers', moduleClass) as object[]) ?? [];
  out.push(...controllers);
  const imports =
    (Reflect.getMetadata('imports', moduleClass) as unknown[]) ?? [];
  for (const entry of imports) {
    if (typeof entry === 'function') {
      collectControllers(entry, seen, out);
    } else if (entry && typeof entry === 'object' && 'module' in entry) {
      collectControllers((entry as { module: unknown }).module, seen, out);
    }
  }
}

function joinPath(base: string, sub: string): string {
  const joined = `/${base}/${sub}`.replace(/\/+/g, '/');
  return joined.length > 1 && joined.endsWith('/')
    ? joined.slice(0, -1)
    : joined;
}

function enumerateRoutes(): ActualRoute[] {
  const controllers: object[] = [];
  collectControllers(AppModule, new Set(), controllers);
  const routes: ActualRoute[] = [];
  for (const controller of controllers) {
    const base = (Reflect.getMetadata('path', controller) as string) ?? '';
    const classGuards =
      (Reflect.getMetadata('__guards__', controller) as unknown[]) ?? [];
    const classPermissions =
      (Reflect.getMetadata(REQUIRE_PERMISSIONS_KEY, controller) as
        | PermissionKey[]
        | undefined) ?? [];
    const proto = (controller as { prototype: object }).prototype;
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue;
      const handler = (proto as Record<string, unknown>)[name];
      if (typeof handler !== 'function') continue;
      const methodCode = Reflect.getMetadata('method', handler) as
        | number
        | undefined;
      if (methodCode === undefined) continue;
      const sub = (Reflect.getMetadata('path', handler) as string) ?? '';
      const guards = new Set<unknown>(classGuards);
      for (const guard of (Reflect.getMetadata('__guards__', handler) as
        | unknown[]) ?? []) {
        guards.add(guard);
      }
      const permissions =
        (Reflect.getMetadata(REQUIRE_PERMISSIONS_KEY, handler) as
          | PermissionKey[]
          | undefined) ?? classPermissions;
      routes.push({
        method: METHOD_NAMES[methodCode] ?? String(methodCode),
        path: joinPath(base, sub),
        guards,
        permissions,
      });
    }
  }
  return routes;
}

describe('route guard inventory', () => {
  const actual = enumerateRoutes();
  const byKey = new Map(
    actual.map((route) => [`${route.method} ${route.path}`, route]),
  );

  it('classifies every route the API serves, with no extras', () => {
    const expectedKeys = EXPECTED_ROUTES.map(
      (route) => `${route.method} ${route.path}`,
    ).sort();
    const actualKeys = [...byKey.keys()].sort();
    expect(actualKeys).toEqual(expectedKeys);
  });

  it('guards every staff route with AuthGuard, PermissionsGuard and its permission', () => {
    for (const expected of EXPECTED_ROUTES) {
      if (expected.category !== 'staff') continue;
      const route = byKey.get(`${expected.method} ${expected.path}`);
      expect(route, `${expected.method} ${expected.path}`).toBeDefined();
      expect(route?.guards.has(AuthGuard)).toBe(true);
      expect(route?.guards.has(PermissionsGuard)).toBe(true);
      expect(route?.permissions).toEqual(expected.permissions);
    }
  });

  it('requires a token on every authenticated route', () => {
    for (const expected of EXPECTED_ROUTES) {
      if (expected.category !== 'authenticated') continue;
      const route = byKey.get(`${expected.method} ${expected.path}`);
      expect(route?.guards.has(AuthGuard)).toBe(true);
    }
  });

  it('keeps every public route free of AuthGuard', () => {
    for (const expected of EXPECTED_ROUTES) {
      if (expected.category !== 'public') continue;
      const route = byKey.get(`${expected.method} ${expected.path}`);
      expect(route?.guards.has(AuthGuard)).toBe(false);
    }
  });
});
