import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { permissionsForRoles } from '@dostelo/types';
import type { AuthPrincipal } from '../../common/auth/principal';
import { createTestContext } from '../../testing/test-context';

/**
 * Legal service tests: the six documents from the master
 * structure exist as label defaults until staff save content,
 * saves round-trip, and unknown slugs are refused with a 404.
 */
const actor: AuthPrincipal = {
  type: 'admin',
  id: 'admin-legal-1',
  name: 'Legal Tester',
  roles: ['super-admin'],
  permissions: permissionsForRoles(['super-admin']),
};

describe('LegalService', () => {
  it('lists the six documents as unstored defaults', async () => {
    const ctx = createTestContext();
    const items = await ctx.legal.list();
    expect(items.map((doc) => doc.slug)).toEqual([
      'privacy',
      'terms',
      'returns',
      'refund',
      'shipping',
      'warranty',
    ]);
    expect(items.every((doc) => doc.stored === false)).toBe(true);
    expect(items[0]!.title).toBe('Privacy Policy');
  });

  it('saves and re-reads a document', async () => {
    const ctx = createTestContext();
    const saved = await ctx.legal.update(
      'privacy',
      { title: 'Privacy Policy', body: 'We collect order details only.' },
      actor,
    );
    expect(saved.stored).toBe(true);
    expect(saved.updatedById).toBe(actor.id);
    const reread = await ctx.legal.get('privacy');
    expect(reread.body).toBe('We collect order details only.');
    const list = await ctx.legal.list();
    expect(list.find((doc) => doc.slug === 'privacy')!.stored).toBe(true);
    expect(list.find((doc) => doc.slug === 'terms')!.stored).toBe(false);
  });

  it('refuses an unknown slug', async () => {
    const ctx = createTestContext();
    await expect(ctx.legal.get('cookies')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
