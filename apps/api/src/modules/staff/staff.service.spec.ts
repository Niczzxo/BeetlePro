import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { isMfaChallenge, permissionsForRoles } from '@dostelo/types';
import type { AuthPrincipal } from '../../common/auth/principal';
import { createTestContext } from '../../testing/test-context';

/**
 * Staff service tests: account creation with a temporary
 * password (the new account can sign in, and no hash ever
 * appears in a view), duplicate refusal, role changes,
 * deactivation blocking sign-in, and forced logout.
 */
const actor: AuthPrincipal = {
  type: 'admin',
  id: 'admin-staff-1',
  name: 'Staff Tester',
  roles: ['super-admin'],
  permissions: permissionsForRoles(['super-admin']),
};

describe('StaffService', () => {
  it('creates an account that can sign in, without exposing secrets', async () => {
    const ctx = createTestContext();
    const created = await ctx.staff.create(
      {
        email: 'agent@example.com',
        displayName: 'Sales Agent One',
        roles: ['sales-agent'],
        temporaryPassword: 'temp-pass-123',
      },
      actor,
    );
    expect(created.email).toBe('agent@example.com');
    expect(created.roles).toEqual(['sales-agent']);
    expect(created.isActive).toBe(true);
    expect(JSON.stringify(created)).not.toContain('passwordHash');
    expect(JSON.stringify(created)).not.toContain('scrypt');

    const login = await ctx.auth.loginAdmin(
      {
        email: 'agent@example.com',
        password: 'temp-pass-123',
      },
      null,
    );
    if (isMfaChallenge(login)) throw new Error('unexpected MFA challenge');
    expect(login.accessToken).toBeTruthy();
    expect(login.principal.id).toBe(created.id);

    const list = await ctx.staff.list();
    expect(list.map((entry) => entry.email)).toContain('agent@example.com');
  });

  it('refuses a duplicate email', async () => {
    const ctx = createTestContext();
    await ctx.staff.create(
      {
        email: 'dupe@example.com',
        displayName: 'First',
        roles: ['analyst'],
        temporaryPassword: 'temp-pass-123',
      },
      actor,
    );
    await expect(
      ctx.staff.create(
        {
          email: 'dupe@example.com',
          displayName: 'Second',
          roles: ['analyst'],
          temporaryPassword: 'temp-pass-123',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('changes roles, deactivates (blocking sign-in) and reactivates', async () => {
    const ctx = createTestContext();
    const created = await ctx.staff.create(
      {
        email: 'roles@example.com',
        displayName: 'Role Holder',
        roles: ['analyst'],
        temporaryPassword: 'temp-pass-123',
      },
      actor,
    );
    const updated = await ctx.staff.setRoles(
      created.id,
      { roles: ['support-agent', 'analyst'] },
      actor,
    );
    expect(updated.roles).toEqual(['support-agent', 'analyst']);

    const deactivated = await ctx.staff.setActive(created.id, false, actor);
    expect(deactivated.isActive).toBe(false);
    await expect(
      ctx.auth.loginAdmin(
        {
          email: 'roles@example.com',
          password: 'temp-pass-123',
        },
        null,
      ),
    ).rejects.toThrow(/disabled/);

    await ctx.staff.setActive(created.id, true, actor);
    const login = await ctx.auth.loginAdmin(
      {
        email: 'roles@example.com',
        password: 'temp-pass-123',
      },
      null,
    );
    if (isMfaChallenge(login)) throw new Error('unexpected MFA challenge');
    expect(login.accessToken).toBeTruthy();
  });

  it('revokes sessions on forced logout so refresh fails', async () => {
    const ctx = createTestContext();
    const created = await ctx.staff.create(
      {
        email: 'sessions@example.com',
        displayName: 'Session Holder',
        roles: ['analyst'],
        temporaryPassword: 'temp-pass-123',
      },
      actor,
    );
    const login = await ctx.auth.loginAdmin(
      {
        email: 'sessions@example.com',
        password: 'temp-pass-123',
      },
      null,
    );
    if (isMfaChallenge(login)) throw new Error('unexpected MFA challenge');
    const refreshToken = login.refreshToken;
    expect(refreshToken).toBeTruthy();

    const before = await ctx.staff.list();
    expect(
      before.find((entry) => entry.id === created.id)!.activeSessions,
    ).toBe(1);

    const result = await ctx.staff.revokeSessionsFor(created.id, actor);
    expect(result.revoked).toBe(1);
    await expect(ctx.auth.refresh(refreshToken)).rejects.toThrow();
  });
});
