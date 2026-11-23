import { describe, expect, it } from 'vitest';
import { permissionsForRoles } from '@dostelo/types';
import type { AuthPrincipal } from '../../common/auth/principal';
import { createTestContext } from '../../testing/test-context';

/**
 * Backup service tests: an export assembles the core stores,
 * strips password hashes from customer records, records its own
 * counts, and lands in the export history with an audit entry.
 */
const actor: AuthPrincipal = {
  type: 'admin',
  id: 'admin-backup-1',
  name: 'Backup Tester',
  roles: ['super-admin'],
  permissions: permissionsForRoles(['super-admin']),
};

describe('BackupService', () => {
  it('exports the core stores with counts and no password hashes', async () => {
    const ctx = createTestContext();
    await ctx.customers.register({
      fullName: 'Export Buyer',
      email: 'export@example.com',
      phone: '01712345678',
      password: 'buyer-pass-123',
    });
    const result = await ctx.backup.createExport(actor);
    expect(result.record.counts['products']).toBe(22);
    expect(result.record.counts['categories']).toBe(8);
    expect(result.record.counts['customers']).toBe(1);
    expect(result.record.counts['settings']).toBe(1);
    expect(result.export.stores['products']).toHaveLength(22);
    const serialized = JSON.stringify(result.export);
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('scrypt');

    const history = await ctx.backup.listExports();
    expect(history).toHaveLength(1);
    expect(history[0]!.id).toBe(result.record.id);
    expect(history[0]!.requestedById).toBe(actor.id);

    const auditEntries = await ctx.audit.list({ action: 'backup.exported' });
    expect(auditEntries).toHaveLength(1);
  });
});
