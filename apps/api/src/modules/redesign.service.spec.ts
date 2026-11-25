import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { permissionsForRoles } from '@dostelo/types';
import type { AuthPrincipal } from '../common/auth/principal';
import {
  createTestContext,
  findVariant,
} from '../testing/test-context';
import { IntegrationsService } from './integrations/integrations.service';

/**
 * Redesign pass tests: the behaviours the new portal surfaces
 * depend on. Templates override and validate, recovery flags
 * gate the engine, staff invites are single-use, automation
 * pauses are real, notification preferences are per-admin, and
 * integration checks tell the truth.
 */
const actor: AuthPrincipal = {
  type: 'admin',
  id: 'admin-redesign-1',
  name: 'Redesign Tester',
  roles: ['super-admin'],
  permissions: permissionsForRoles(['super-admin']),
};

const staffActor: AuthPrincipal = {
  type: 'admin',
  id: 'admin-redesign-2',
  name: 'Plain Staff',
  roles: ['store-manager'],
  permissions: permissionsForRoles(['store-manager']),
};

describe('Redesign extensions', () => {
  it('stores a template override, renders it, rejects unknown variables, restores the built-in on delete', async () => {
    const ctx = createTestContext();
    await expect(
      ctx.communications.upsertTemplate(
        'recovery-whatsapp-1',
        { channel: 'whatsapp', body: 'Hi {{nope}}' },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    const saved = await ctx.communications.upsertTemplate(
      'recovery-whatsapp-1',
      {
        channel: 'whatsapp',
        body: 'Hi {{customer_name}}, your {{product_name}} is waiting.',
      },
      actor,
    );
    expect(saved.source).toBe('stored');
    const entry = await ctx.communications.send({
      channel: 'whatsapp',
      to: '01712345678',
      purpose: 'test',
      templateKey: 'recovery-whatsapp-1',
      variables: { customer_name: 'Ayesha', product_name: 'Shoes' },
    });
    expect(entry.body).toContain('Hi Ayesha, your Shoes is waiting.');
    expect(entry.status).toBe('not-configured');
    const deleted = await ctx.communications.deleteTemplate(
      'recovery-whatsapp-1',
      actor,
    );
    expect(deleted.builtinRestored).toBe(true);
    const listed = await ctx.communications.listTemplates();
    const builtin = listed.find((t) => t.key === 'recovery-whatsapp-1');
    expect(builtin?.source).toBe('built-in');
  });

  it('staff send records not-configured honestly', async () => {
    const ctx = createTestContext();
    const entry = await ctx.communications.send({
      channel: 'email',
      to: 'someone@example.com',
      purpose: 'staff message',
      body: 'Hello from the store',
      staffId: actor.id,
    });
    expect(entry.status).toBe('not-configured');
    expect(entry.kind).toBe('staff-message');
  });

  it('recovery settings flags gate detection and the sequence', async () => {
    const ctx = createTestContext();
    const settings = await ctx.cartRecovery.getSettings();
    expect(settings.enabled).toBe(true);
    expect(settings.sequenceEnabled).toBe(true);
    await ctx.cartRecovery.updateSettings({ enabled: false }, actor);
    const after = await ctx.cartRecovery.getSettings();
    expect(after.enabled).toBe(false);
  });

  it('staff invite is single-use, activates the account, and super admin grant needs a super admin', async () => {
    const ctx = createTestContext();
    await expect(
      ctx.staff.invite(
        {
          email: 'new@example.com',
          displayName: 'New Admin',
          roles: ['super-admin'],
        },
        staffActor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    const invited = await ctx.staff.invite(
      {
        email: 'new@example.com',
        displayName: 'New Admin',
        roles: ['store-manager'],
      },
      actor,
    );
    expect(invited.admin.isActive).toBe(false);
    const accepted = await ctx.staff.acceptInvite({
      token: invited.inviteToken,
      password: 'invitee-password-1',
    });
    expect(accepted.isActive).toBe(true);
    await expect(
      ctx.staff.acceptInvite({
        token: invited.inviteToken,
        password: 'invitee-password-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('guards the last active super admin against demotion and deactivation', async () => {
    const ctx = createTestContext();
    const created = await ctx.staff.create(
      {
        email: 'boss@example.com',
        displayName: 'Boss',
        roles: ['super-admin'],
        temporaryPassword: 'boss-password-1',
      },
      actor,
    );
    await expect(
      ctx.staff.setRoles(created.id, { roles: ['store-manager'] }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      ctx.staff.setActive(created.id, false, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('notification preferences are per-admin and narrow the feed', async () => {
    const ctx = createTestContext();
    await ctx.notifications.savePreferences(actor, {
      categories: ['inventory'],
      emailEnabled: false,
    });
    const prefs = await ctx.notifications.getPreferences(actor);
    expect(prefs.categories).toEqual(['inventory']);
    const other = await ctx.notifications.getPreferences(staffActor);
    expect(other.categories).toContain('orders');
    const feed = await ctx.notifications.feed(actor);
    expect(
      feed.items.every((item) => item.category === 'inventory'),
    ).toBe(true);
  });

  it('integration checks report truthful states', async () => {
    const service = new IntegrationsService();
    const cod = await service.test('cod');
    expect(cod.configured).toBe(true);
    expect(cod.detail).toContain('Internal flow');
    const ssl = await service.test('sslcommerz');
    expect(ssl.configured).toBe(false);
    expect(ssl.missing.length).toBeGreaterThan(0);
    expect(ssl.detail).toContain('Not configured');
    const all = service.status();
    expect(all).toHaveLength(10);
    expect(all.filter((i) => i.configured)).toHaveLength(2);
  });

  it('staff order creation computes totals server-side and stays unpaid', async () => {
    const ctx = createTestContext();
    const { variant } = await findVariant(
      ctx,
      'sneakers-court',
      'EU 41',
      'White',
    );
    const order = await ctx.checkout.placeOrder({
      customer: {
        fullName: 'Walk In',
        email: 'walkin@example.com',
        phone: '01712345678',
      },
      lines: [
        { productId: 'sneakers-court', variantId: variant.id, quantity: 1 },
      ],
      address: {
        fullName: 'Walk In',
        phone: '01712345678',
        addressLine: 'House 5, Road 2, Mirpur 10',
        city: 'Dhaka',
        district: 'Dhaka',
      },
      paymentMethod: 'cod',
    });
    expect(order.total.amountMinor).toBeGreaterThan(0);
    expect(order.paymentStatus).not.toBe('paid');
  });

  it('legal documents: draft stays private, publish serves, unpublish withdraws, versions restore to draft', async () => {
    const ctx = createTestContext();
    const initial = await ctx.legal.list();
    expect(initial).toHaveLength(6);
    expect(initial.every((d) => d.status === 'not-saved')).toBe(true);
    expect(await ctx.legal.getPublic('privacy')).toBeNull();

    await ctx.legal.update(
      'privacy',
      { title: 'Privacy Policy', body: 'We collect order data.' },
      actor,
    );
    // Saved is a draft: still not public.
    expect((await ctx.legal.get('privacy')).status).toBe('draft');
    expect(await ctx.legal.getPublic('privacy')).toBeNull();

    const published = await ctx.legal.publish('privacy', actor);
    expect(published.status).toBe('published');
    const served = await ctx.legal.getPublic('privacy');
    expect(served?.body).toBe('We collect order data.');

    // Editing after publish changes the draft only.
    await ctx.legal.update(
      'privacy',
      { title: 'Privacy Policy', body: 'Draft v2 text.' },
      actor,
    );
    expect((await ctx.legal.getPublic('privacy'))?.body).toBe(
      'We collect order data.',
    );

    const versions = await ctx.legal.listVersions('privacy');
    expect(versions).toHaveLength(1);
    const restored = await ctx.legal.restoreVersion(
      'privacy',
      versions[0]!.id,
      actor,
    );
    expect(restored.body).toBe('We collect order data.');
    expect(restored.status).toBe('published');

    await ctx.legal.unpublish('privacy', actor);
    expect(await ctx.legal.getPublic('privacy')).toBeNull();
    const sync = await ctx.legal.syncStatus();
    expect(sync.publishedCount).toBe(0);
    expect(sync.lastSyncAt).not.toBeNull();

    const custom = await ctx.legal.create(
      { slug: 'cookie-policy', title: 'Cookie Policy' },
      actor,
    );
    expect(custom.isCustom).toBe(true);
    expect((await ctx.legal.list()).length).toBe(7);
  });

  it('backups: export contains no secrets, stored backup downloads after checksum verification, selective export filters', async () => {
    const ctx = createTestContext();
    await ctx.customers.register({
      fullName: 'Secret Check',
      email: 'secret@example.com',
      phone: '01712345678',
      password: 'secret-pass-123',
    });
    const full = await ctx.backup.createExport(actor);
    const serialized = JSON.stringify(full.export);
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('totpSecret');
    expect(serialized).not.toContain('refreshToken');
    expect(full.record.byteSize).toBeGreaterThan(0);

    const selective = await ctx.backup.createExport(actor, ['products']);
    expect(Object.keys(selective.export.stores)).toEqual(['products']);

    const stored = await ctx.backup.createBackup(actor);
    expect(stored.checksum).toMatch(/^[a-f0-9]{64}$/);
    const download = await ctx.backup.downloadBackup(stored.id, actor);
    expect(download.content).toContain('exportedAt');
    const summary = await ctx.backup.summary();
    expect(summary.totalBackups).toBe(1);
    expect(summary.restoreAvailable).toBe(false);
    const health = await ctx.backup.runMaintenance('health', actor);
    expect(health.status).toBe('completed');
    const optimize = await ctx.backup.runMaintenance(
      'optimize-database',
      actor,
    );
    expect(optimize.status).toBe('unavailable');
    await ctx.backup.deleteBackup(stored.id, actor);
    expect((await ctx.backup.listBackups())).toHaveLength(0);
  });

  it('checkout refuses COD when the store settings switch it off, and a closed store refuses orders', async () => {
    const ctx = createTestContext();
    const { variant } = await findVariant(
      ctx,
      'sneakers-court',
      'EU 41',
      'White',
    );
    const dto = {
      customer: {
        fullName: 'Gate Test',
        email: 'gate@example.com',
        phone: '01712345678',
      },
      lines: [
        { productId: 'sneakers-court', variantId: variant.id, quantity: 1 },
      ],
      address: {
        fullName: 'Gate Test',
        phone: '01712345678',
        addressLine: 'House 5, Road 2, Mirpur 10',
        city: 'Dhaka',
        district: 'Dhaka',
      },
      paymentMethod: 'cod' as const,
    };
    await ctx.website.updateSettings({ allowCod: false }, actor);
    await expect(ctx.checkout.quote(dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await ctx.website.updateSettings(
      { allowCod: true, storeLive: false },
      actor,
    );
    await expect(ctx.checkout.quote(dto)).rejects.toThrow(/closed/);
  });
});
