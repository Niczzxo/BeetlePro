import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { permissionsForRoles } from '@dostelo/types';
import type { AuthPrincipal } from '../../common/auth/principal';
import { createTestContext } from '../../testing/test-context';

/**
 * Support service tests: staff-created tickets with the opening
 * message recorded, reply and internal-note behaviour, status
 * and assignment, and the closed-ticket guard.
 */
const actor: AuthPrincipal = {
  type: 'admin',
  id: 'admin-support-1',
  name: 'Support Tester',
  roles: ['super-admin'],
  permissions: permissionsForRoles(['super-admin']),
};

describe('SupportService', () => {
  it('creates a ticket with the opening message and replies move it to pending', async () => {
    const ctx = createTestContext();
    const ticket = await ctx.support.create(
      {
        customerName: 'Walk-in Buyer',
        customerPhone: '01712345678',
        subject: 'Shoe size exchange',
        message: 'The EU 41 is tight, can I swap for EU 42?',
      },
      actor,
    );
    expect(ticket.status).toBe('open');
    expect(ticket.messages).toHaveLength(1);
    expect(ticket.messages[0]!.authorType).toBe('customer');
    expect(ticket.messages[0]!.internal).toBe(false);

    const afterReply = await ctx.support.reply(
      ticket.id,
      { body: 'Yes, bring the pair to the store with the receipt.' },
      actor,
    );
    expect(afterReply.status).toBe('pending');
    expect(afterReply.messages).toHaveLength(2);
    expect(afterReply.messages[1]!.authorType).toBe('staff');

    const afterNote = await ctx.support.reply(
      ticket.id,
      { body: 'Customer called twice about this.', internal: true },
      actor,
    );
    expect(afterNote.status).toBe('pending');
    expect(afterNote.messages[2]!.internal).toBe(true);
  });

  it('assigns, resolves and refuses replies on a closed ticket', async () => {
    const ctx = createTestContext();
    const ticket = await ctx.support.create(
      {
        customerName: 'Caller',
        customerPhone: '01712345679',
        subject: 'Delivery delay',
        message: 'Order is two days late.',
      },
      actor,
    );
    const assigned = await ctx.support.assign(ticket.id, 'admin-9', actor);
    expect(assigned.assignedToId).toBe('admin-9');
    const resolved = await ctx.support.setStatus(
      ticket.id,
      { status: 'resolved' },
      actor,
    );
    expect(resolved.status).toBe('resolved');
    await ctx.support.setStatus(ticket.id, { status: 'closed' }, actor);
    await expect(
      ctx.support.reply(ticket.id, { body: 'Any update?' }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a ticket for an unknown customer id', async () => {
    const ctx = createTestContext();
    await expect(
      ctx.support.create(
        {
          customerId: 'no-such-customer',
          customerName: 'Ghost',
          customerPhone: '01712345670',
          subject: 'Test',
          message: 'Hello',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists tickets filtered by status', async () => {
    const ctx = createTestContext();
    const first = await ctx.support.create(
      {
        customerName: 'One',
        customerPhone: '01712345671',
        subject: 'First',
        message: 'First message',
      },
      actor,
    );
    await ctx.support.create(
      {
        customerName: 'Two',
        customerPhone: '01712345672',
        subject: 'Second',
        message: 'Second message',
      },
      actor,
    );
    await ctx.support.setStatus(first.id, { status: 'resolved' }, actor);
    const open = await ctx.support.list({ status: 'open' });
    expect(open).toHaveLength(1);
    expect(open[0]!.subject).toBe('Second');
  });
});
