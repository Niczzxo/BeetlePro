import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { permissionsForRoles } from '@dostelo/types';
import type { AuthPrincipal } from '../../common/auth/principal';
import { createTestContext } from '../../testing/test-context';

/**
 * Marketing service tests: campaign records with draft and
 * scheduled states, scheduling rules, cancellation finality, and
 * the honest not-configured sending state (the test environment
 * carries no messaging credentials).
 */
const actor: AuthPrincipal = {
  type: 'admin',
  id: 'admin-marketing-1',
  name: 'Marketing Tester',
  roles: ['super-admin'],
  permissions: permissionsForRoles(['super-admin']),
};

describe('MarketingService', () => {
  it('creates a draft campaign with a not-configured sending state', async () => {
    const ctx = createTestContext();
    const campaign = await ctx.marketing.create(
      {
        name: 'Eid offer announcement',
        channel: 'whatsapp',
        audienceNote: 'Customers who ordered in the last 90 days',
      },
      actor,
    );
    expect(campaign.status).toBe('draft');
    expect(campaign.sending.configured).toBe(false);
    expect(campaign.sending.missing).toContain('WHATSAPP_ACCESS_TOKEN');
    expect(campaign.sending.missing).toContain('WHATSAPP_PHONE_NUMBER_ID');
  });

  it('schedules with a future time and refuses a past one', async () => {
    const ctx = createTestContext();
    const future = new Date(Date.now() + 60 * 60_000).toISOString();
    const campaign = await ctx.marketing.create(
      {
        name: 'Weekend SMS',
        channel: 'sms',
        audienceNote: 'All registered customers',
        scheduledFor: future,
      },
      actor,
    );
    expect(campaign.status).toBe('scheduled');
    expect(campaign.scheduledFor).toBe(future);

    const past = new Date(Date.now() - 60_000).toISOString();
    await expect(
      ctx.marketing.create(
        {
          name: 'Too late',
          channel: 'sms',
          audienceNote: 'All',
          scheduledFor: past,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to schedule without a time and keeps cancelled campaigns closed', async () => {
    const ctx = createTestContext();
    const campaign = await ctx.marketing.create(
      {
        name: 'Draft only',
        channel: 'email',
        audienceNote: 'Newsletter list',
      },
      actor,
    );
    await expect(
      ctx.marketing.update(campaign.id, { status: 'scheduled' }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    const cancelled = await ctx.marketing.update(
      campaign.id,
      { status: 'cancelled' },
      actor,
    );
    expect(cancelled.status).toBe('cancelled');
    await expect(
      ctx.marketing.update(campaign.id, { status: 'draft' }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
