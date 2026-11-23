import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { permissionsForRoles } from '@dostelo/types';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  createTestContext,
  type TestContext,
} from '../../testing/test-context';

/**
 * Communications honesty (Phase 6): with no provider credentials
 * in the environment, every automated send is recorded as
 * not-configured and nothing is ever marked sent. Suppression
 * and consent refusals are recorded before any provider runs,
 * and staff call logging is a distinct, completed action.
 */
const actor: AuthPrincipal = {
  type: 'admin',
  id: 'admin-comms-1',
  name: 'Comms Tester',
  roles: ['crm-manager'],
  permissions: permissionsForRoles(['crm-manager']),
};

function clearProviderEnv(): void {
  for (const key of [
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'EMAIL_PROVIDER_API_KEY',
    'EMAIL_PROVIDER_API_URL',
    'EMAIL_FROM',
    'SMS_API_KEY',
    'SMS_API_URL',
    'SMS_SENDER_ID',
  ]) {
    delete process.env[key];
  }
}

describe('CommunicationsService', () => {
  beforeEach(() => {
    clearProviderEnv();
  });

  it('records a WhatsApp send as not-configured, never sent', async () => {
    const ctx: TestContext = createTestContext();
    const entry = await ctx.communications.send({
      channel: 'whatsapp',
      to: '01712345678',
      templateKey: 'recovery-whatsapp-1',
      variables: {
        firstName: 'Rahim',
        itemCount: 2,
        total: 'BDT 1850.00',
        recoveryLink: 'http://localhost:3000/recover/token123',
      },
      purpose: 'cart-recovery',
    });
    expect(entry.status).toBe('not-configured');
    expect(entry.detail).toContain('not configured');
    expect(entry.body).toContain('Rahim');
    expect(entry.body).toContain('token123');
    expect(entry.providerMessageId).toBeNull();
    const log = ctx.communications.listLog({});
    expect(log).toHaveLength(1);
    expect(log.every((item) => item.status !== 'sent')).toBe(true);
  });

  it('records an email send as not-configured too', async () => {
    const ctx = createTestContext();
    const entry = await ctx.communications.send({
      channel: 'email',
      to: 'buyer@example.com',
      templateKey: 'recovery-email-1',
      variables: {
        firstName: 'Rahim',
        itemCount: 1,
        total: 'BDT 950.00',
        recoveryLink: 'http://localhost:3000/recover/abc',
      },
      purpose: 'cart-recovery',
    });
    expect(entry.status).toBe('not-configured');
    expect(entry.subject).toBe('You left something in your Dostelo bag');
  });

  it('refuses a send to a suppressed phone and records the refusal', async () => {
    const ctx = createTestContext();
    ctx.leadsRepo.appendSuppression({
      id: randomUUID(),
      leadId: null,
      customerId: null,
      phone: '01712345678',
      reason: 'Opt-out recorded on a contact attempt',
      createdAt: new Date().toISOString(),
    });
    const entry = await ctx.communications.send({
      channel: 'whatsapp',
      to: '01712345678',
      body: 'Your bag is waiting',
      purpose: 'cart-recovery',
    });
    expect(entry.status).toBe('refused-suppressed');
  });

  it('refuses a send when the visitor denied marketing consent', async () => {
    const ctx = createTestContext();
    ctx.visitors.recordConsent({
      visitorId: 'visitor-denied-1',
      scope: 'marketing',
      status: 'denied',
    });
    const entry = await ctx.communications.send({
      channel: 'sms',
      to: '01712345678',
      visitorId: 'visitor-denied-1',
      body: 'Your bag is waiting',
      purpose: 'cart-recovery',
    });
    expect(entry.status).toBe('refused-consent');
  });

  it('refuses a send with no address for the channel', async () => {
    const ctx = createTestContext();
    const entry = await ctx.communications.send({
      channel: 'email',
      to: null,
      body: 'Your bag is waiting',
      purpose: 'cart-recovery',
    });
    expect(entry.status).toBe('refused-no-contact');
    expect(entry.toAddress).toBeNull();
  });

  it('a call step creates an awaiting-staff task, not a send', async () => {
    const ctx = createTestContext();
    const entry = await ctx.communications.send({
      channel: 'call',
      to: '01712345678',
      templateKey: 'recovery-call-1',
      variables: {
        firstName: 'Rahim',
        itemCount: 1,
        total: 'BDT 1850.00',
        recoveryLink: 'http://localhost:3000/recover/xyz',
      },
      purpose: 'cart-recovery',
    });
    expect(entry.status).toBe('awaiting-staff');
    expect(entry.kind).toBe('automated');
  });

  it('logs a manual call as a completed staff action', () => {
    const ctx = createTestContext();
    const entry = ctx.communications.logManualCall(
      {
        phone: '01712345678',
        outcome: 'answered',
        notes: 'Customer asked for a size exchange instead.',
      },
      actor,
    );
    expect(entry.status).toBe('logged');
    expect(entry.kind).toBe('manual-call');
    expect(entry.callOutcome).toBe('answered');
    expect(entry.staffId).toBe(actor.id);
    expect(entry.body).toContain('size exchange');
  });

  it('an opted-out call outcome suppresses the number for every channel', async () => {
    const ctx = createTestContext();
    ctx.communications.logManualCall(
      { phone: '01712345678', outcome: 'opted-out' },
      actor,
    );
    const send = await ctx.communications.send({
      channel: 'sms',
      to: '01712345678',
      body: 'Your bag is waiting',
      purpose: 'cart-recovery',
    });
    expect(send.status).toBe('refused-suppressed');
    const secondCall = ctx.communications.logManualCall(
      { phone: '01712345678', outcome: 'answered' },
      actor,
    );
    expect(secondCall.status).toBe('refused-suppressed');
  });

  it('rejects a template used on the wrong channel', async () => {
    const ctx = createTestContext();
    await expect(
      ctx.communications.send({
        channel: 'email',
        to: 'buyer@example.com',
        templateKey: 'recovery-whatsapp-1',
        variables: {},
        purpose: 'cart-recovery',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
