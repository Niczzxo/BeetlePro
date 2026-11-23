import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isMfaChallenge,
  permissionsForRoles,
  roleHasPermission,
  type AdminRole,
  type PermissionKey,
} from '@dostelo/types';
import type { CheckoutRequest } from '@dostelo/validation';
import { REQUIRE_PERMISSIONS_KEY } from '../../common/auth/decorators';
import { PermissionsGuard } from '../../common/auth/guards';
import { verifyAccessToken } from '../../common/auth/jwt';
import type { AuthPrincipal } from '../../common/auth/principal';
import { totpNow } from '../../common/auth/totp';
import { hashPassword } from '../../common/password';
import { RateLimiter } from '../../common/rate-limit';
import type { StoredAdminUser } from '../../store/in-memory.store';
import {
  createTestContext,
  findVariant,
  type TestContext,
} from '../../testing/test-context';

const DHAKA_ADDRESS = {
  fullName: 'Auth Buyer',
  phone: '01712345678',
  addressLine: 'House 5, Road 2, Mirpur 10',
  city: 'Dhaka',
  district: 'Dhaka',
};

function adminPrincipal(
  roles: AdminRole[],
  id = 'admin-test',
): AuthPrincipal {
  return {
    type: 'admin',
    id,
    name: 'Test Admin',
    roles,
    permissions: permissionsForRoles(roles),
  };
}

async function createAdmin(
  ctx: TestContext,
  roles: AdminRole[],
  password = 'admin-password-1',
): Promise<StoredAdminUser> {
  const now = new Date().toISOString();
  const admin: StoredAdminUser = {
    id: randomUUID(),
    email: `admin-${randomUUID().slice(0, 8)}@dostelo.example`,
    displayName: 'Test Admin',
    passwordHash: await hashPassword(password),
    roles,
    isActive: true,
    mfaSecret: null,
    mfaEnabled: false,
    createdAt: now,
    updatedAt: now,
  };
  ctx.adminsRepo.create(admin);
  return admin;
}

async function registerCustomer(ctx: TestContext) {
  return ctx.customers.register({
    fullName: 'Login Buyer',
    email: `login-${randomUUID().slice(0, 8)}@example.com`,
    phone: `017${Math.floor(10000000 + Math.random() * 89999999)}`,
    password: 'password123',
  });
}

async function placeBkashOrder(ctx: TestContext) {
  const customer = await registerCustomer(ctx);
  const { variant } = findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
  const request: CheckoutRequest = {
    lines: [
      { productId: 'sneakers-court', variantId: variant.id, quantity: 1 },
    ],
    customerId: customer.id,
    address: DHAKA_ADDRESS,
    paymentMethod: 'bkash',
  };
  const order = ctx.checkout.placeOrder(request);
  const payment = ctx.paymentsRepo.listByOrder(order.id).at(-1);
  if (!payment) throw new Error('checkout created no payment attempt');
  return { customer, order, payment };
}

describe('Customer auth', () => {
  it('registers and logs in with email and phone identifiers', async () => {
    const ctx = createTestContext();
    const { customer, tokens } = await ctx.auth.registerCustomer({
      fullName: 'New Buyer',
      email: 'new-buyer@example.com',
      phone: '01712345678',
      password: 'password123',
    });
    expect(customer.email).toBe('new-buyer@example.com');
    expect(tokens.tokenType).toBe('Bearer');
    const claims = verifyAccessToken(tokens.accessToken);
    expect(claims?.typ).toBe('customer');
    expect(claims?.sub).toBe(customer.id);

    const byEmail = await ctx.auth.loginCustomer(
      { identifier: 'new-buyer@example.com', password: 'password123' },
      '127.0.0.1',
    );
    expect(byEmail.principal.id).toBe(customer.id);
    const byPhone = await ctx.auth.loginCustomer(
      { identifier: '01712345678', password: 'password123' },
      '127.0.0.1',
    );
    expect(byPhone.principal.id).toBe(customer.id);
    expect(
      ctx.audit.list({ action: 'auth.login.succeeded' }),
    ).toHaveLength(2);
  });

  it('rejects a wrong password and audits the failure', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    await expect(
      ctx.auth.loginCustomer(
        { identifier: customer.email as string, password: 'wrong-pass' },
        '127.0.0.1',
      ),
    ).rejects.toThrow(UnauthorizedException);
    const failures = ctx.audit.list({ action: 'auth.login.failed' });
    expect(failures).toHaveLength(1);
    expect(failures[0]?.actorId).toBe(customer.id);
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    const first = await ctx.auth.loginCustomer(
      { identifier: customer.email as string, password: 'password123' },
      null,
    );
    const second = ctx.auth.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.principal.id).toBe(customer.id);
    // Reusing the rotated token is treated as a leak.
    expect(() => ctx.auth.refresh(first.refreshToken)).toThrow(
      /reuse detected/,
    );
    // And the whole family, including the newest token, is dead.
    expect(() => ctx.auth.refresh(second.refreshToken)).toThrow(
      UnauthorizedException,
    );
  });

  it('logout revokes the session', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    const tokens = await ctx.auth.loginCustomer(
      { identifier: customer.email as string, password: 'password123' },
      null,
    );
    expect(ctx.auth.logout(tokens.refreshToken)).toEqual({
      revoked: true,
    });
    expect(() => ctx.auth.refresh(tokens.refreshToken)).toThrow(
      UnauthorizedException,
    );
  });
});

describe('Admin auth and seeding', () => {
  const savedEnv: Record<string, string | undefined> = {};
  afterEach(() => {
    for (const key of [
      'ADMIN_SEED_EMAIL',
      'ADMIN_SEED_PASSWORD',
      'ADMIN_SEED_ROLE',
    ]) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it('answers a clear not-seeded error when no admin exists', async () => {
    const ctx = createTestContext();
    delete process.env.ADMIN_SEED_EMAIL;
    delete process.env.ADMIN_SEED_PASSWORD;
    await expect(
      ctx.auth.loginAdmin(
        { email: 'owner@dostelo.example', password: 'whatever-1' },
        null,
      ),
    ).rejects.toThrow(ServiceUnavailableException);
    await expect(
      ctx.auth.loginAdmin(
        { email: 'owner@dostelo.example', password: 'whatever-1' },
        null,
      ),
    ).rejects.toThrow(/not configured/);
  });

  it('seeds from the environment and logs the admin in', async () => {
    const ctx = createTestContext();
    savedEnv.ADMIN_SEED_EMAIL = process.env.ADMIN_SEED_EMAIL;
    savedEnv.ADMIN_SEED_PASSWORD = process.env.ADMIN_SEED_PASSWORD;
    savedEnv.ADMIN_SEED_ROLE = process.env.ADMIN_SEED_ROLE;
    process.env.ADMIN_SEED_EMAIL = 'owner@dostelo.example';
    process.env.ADMIN_SEED_PASSWORD = 'seed-password-1';
    delete process.env.ADMIN_SEED_ROLE;

    const seeded = await ctx.auth.seedAdminFromEnvironment();
    expect(seeded?.email).toBe('owner@dostelo.example');
    expect(seeded?.roles).toEqual(['super-admin']);
    expect(
      ctx.audit.list({ action: 'admin.seeded' }),
    ).toHaveLength(1);

    const tokens = await ctx.auth.loginAdmin(
      { email: 'owner@dostelo.example', password: 'seed-password-1' },
      null,
    );
    if (isMfaChallenge(tokens)) {
      throw new Error('fresh seed must not require MFA');
    }
    expect(tokens.principal.roles).toEqual(['super-admin']);
    expect(tokens.principal.permissions).toContain('payments.refund');
    expect(tokens.principal.permissions).toContain('audit.read');

    await expect(
      ctx.auth.loginAdmin(
        { email: 'owner@dostelo.example', password: 'nope-nope' },
        null,
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(
      ctx.audit.list({ action: 'admin.login.failed' }),
    ).toHaveLength(1);
  });
});

describe('RBAC guard', () => {
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

  it('matches the roles matrix for the guarded endpoints', () => {
    expect(roleHasPermission('sales-agent', 'payments.refund')).toBe(false);
    expect(roleHasPermission('accountant', 'payments.refund')).toBe(true);
    expect(roleHasPermission('accountant', 'payments.verify')).toBe(true);
    expect(roleHasPermission('support-agent', 'inventory.adjust')).toBe(
      false,
    );
    expect(roleHasPermission('product-manager', 'inventory.adjust')).toBe(
      true,
    );
    expect(roleHasPermission('sales-agent', 'orders.edit')).toBe(false);
    expect(roleHasPermission('delivery-manager', 'orders.edit')).toBe(true);
    expect(roleHasPermission('store-manager', 'audit.read')).toBe(true);
    expect(roleHasPermission('analyst', 'audit.read')).toBe(false);
  });

  it('allows and denies through the guard', () => {
    expect(
      guardAllows(adminPrincipal(['sales-agent']), ['payments.refund']),
    ).toBe(false);
    expect(
      guardAllows(adminPrincipal(['accountant']), ['payments.refund']),
    ).toBe(true);
    expect(
      guardAllows(adminPrincipal(['support-agent']), ['inventory.adjust']),
    ).toBe(false);
    expect(
      guardAllows(adminPrincipal(['store-manager']), ['inventory.adjust']),
    ).toBe(true);
    // A customer principal never satisfies a staff permission.
    const customer: AuthPrincipal = {
      type: 'customer',
      id: 'cust-1',
      name: 'Buyer',
      roles: [],
      permissions: [],
    };
    expect(guardAllows(customer, ['orders.edit'])).toBe(false);
  });
});

describe('Audit trail for staff actions', () => {
  it('records an order status transition with its actor', async () => {
    const ctx = createTestContext();
    const { order } = await placeBkashOrder(ctx);
    const manager = adminPrincipal(['store-manager']);
    ctx.ordersService.transition(
      order.orderNumber,
      { status: 'confirmed' },
      manager,
    );
    const entries = ctx.audit.list({
      action: 'order.status.transition',
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.actorType).toBe('admin');
    expect(entries[0]?.actorRole).toBe('store-manager');
    expect(entries[0]?.metadata).toMatchObject({
      orderNumber: order.orderNumber,
      from: 'pending',
      to: 'confirmed',
    });
  });

  it('records a payment verify and a refund with their actors', async () => {
    const ctx = createTestContext();
    const { payment } = await placeBkashOrder(ctx);
    const accountant = adminPrincipal(['accountant']);
    ctx.payments.confirmManualPayment(payment.id, {
      senderNumber: '01712345678',
      transactionId: 'TXN-AUDIT-1',
    });
    ctx.payments.verifyManualPayment(
      payment.id,
      { decision: 'paid' },
      accountant,
    );
    const refund = await ctx.payments.requestRefund(
      payment.id,
      { reason: 'Audit test refund' },
      accountant,
    );
    expect(refund.status).toBe('manual-pending');
    const actions = ctx.audit.list({ actorId: accountant.id }).map(
      (entry) => entry.action,
    );
    expect(actions).toContain('payment.verified');
    expect(actions).toContain('payment.refund.requested');
  });

  it('records an inventory adjustment with its actor', async () => {
    const ctx = createTestContext();
    const { variant } = findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
    const manager = adminPrincipal(['product-manager']);
    ctx.inventoryService.adjust(variant.id, { delta: 5 }, manager);
    const entries = ctx.audit.list({ action: 'inventory.adjusted' });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.entityId).toBe(variant.id);
    expect(entries[0]?.metadata).toMatchObject({ delta: 5 });
  });
});

describe('Admin MFA (TOTP)', () => {
  it('enrols, enables, then requires a code at login', async () => {
    const ctx = createTestContext();
    const admin = await createAdmin(ctx, ['super-admin']);
    const principal = adminPrincipal(['super-admin'], admin.id);

    const before = await ctx.auth.loginAdmin(
      { email: admin.email, password: 'admin-password-1' },
      null,
    );
    expect(isMfaChallenge(before)).toBe(false);

    const enrolment = ctx.auth.enrollMfa(principal, null);
    expect(enrolment.otpauthUrl).toContain('otpauth://totp/');
    expect(enrolment.otpauthUrl).toContain(enrolment.secret);
    ctx.auth.enableMfa(principal, totpNow(enrolment.secret), null);
    expect(
      ctx.audit.list({ action: 'admin.mfa.enabled' }),
    ).toHaveLength(1);

    const challenged = await ctx.auth.loginAdmin(
      { email: admin.email, password: 'admin-password-1' },
      null,
    );
    if (!isMfaChallenge(challenged)) {
      throw new Error('login with MFA on must return a challenge');
    }
    await expect(
      Promise.resolve().then(() =>
        ctx.auth.exchangeMfaChallenge(challenged.challengeId, '000000', null),
      ),
    ).rejects.toThrow(UnauthorizedException);

    const stored = ctx.adminsRepo.findById(admin.id);
    if (!stored?.mfaSecret) throw new Error('MFA secret missing');
    const tokens = ctx.auth.exchangeMfaChallenge(
      challenged.challengeId,
      totpNow(stored.mfaSecret),
      null,
    );
    expect(tokens.principal.id).toBe(admin.id);
    // The challenge is single-use.
    expect(() =>
      ctx.auth.exchangeMfaChallenge(
        challenged.challengeId,
        totpNow(stored.mfaSecret as string),
        null,
      ),
    ).toThrow(UnauthorizedException);
  });
});

describe('Rate limiter', () => {
  it('blocks after the documented limit inside the window', () => {
    const limiter = new RateLimiter();
    const options = { limit: 10, windowMs: 60_000 };
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(limiter.hit('1.2.3.4:buyer@example.com', options)).toBe(true);
    }
    expect(limiter.hit('1.2.3.4:buyer@example.com', options)).toBe(false);
    // A different identifier has its own bucket.
    expect(limiter.hit('1.2.3.4:other@example.com', options)).toBe(true);
  });
});
