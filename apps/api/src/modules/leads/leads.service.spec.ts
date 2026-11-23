import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { permissionsForRoles } from '@dostelo/types';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  createTestContext,
  findVariant,
  type TestContext,
} from '../../testing/test-context';

const VISITOR = 'visitor-lead-001';
const SESSION = 'session-lead-001';
const PW = ['s3cret', 'sauce'].join('-');

const DHAKA_ADDRESS = {
  fullName: 'Lead Buyer',
  phone: '01712345678',
  addressLine: 'House 5, Road 2, Mirpur 10',
  city: 'Dhaka',
  district: 'Dhaka',
};

function salesActor(id = 'agent-1'): AuthPrincipal {
  return {
    type: 'admin',
    id,
    name: 'Sales Agent',
    roles: ['sales-agent'],
    permissions: permissionsForRoles(['sales-agent']),
  };
}

async function registerCustomer(ctx: TestContext) {
  return ctx.customers.register({
    fullName: 'Intent Buyer',
    email: 'intent@example.com',
    phone: '01812345678',
    password: PW,
  });
}

async function browse(ctx: TestContext) {
  await ctx.visitors.ingestEvent({
    visitorId: VISITOR,
    sessionId: SESSION,
    type: 'product-view',
    payload: { productId: 'sneakers-court' },
  });
  await ctx.visitors.ingestEvent({
    visitorId: VISITOR,
    sessionId: SESSION,
    type: 'add-to-cart',
    payload: { productId: 'sneakers-court', cartValueMinor: 185_000 },
  });
}

describe('lead auto-candidates', async () => {
  it('creates a candidate when an identified visitor starts checkout without ordering', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    await browse(ctx);
    await ctx.visitors.linkAuthenticated(customer.id, VISITOR);
    await ctx.visitors.ingestEvent({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'checkout-start',
      payload: { cartValueMinor: 185_000 },
    });
    const leads = await ctx.leads.list({});
    expect(leads).toHaveLength(1);
    expect(leads[0]?.status).toBe('new');
    expect(leads[0]?.source).toBe('buyer-intelligence');
    expect(leads[0]?.customerId).toBe(customer.id);
    expect(leads[0]?.phone).toBe('01812345678');
    expect(leads[0]?.contactBasis).toBe('account');
    // Evaluation is idempotent: more events do not duplicate it.
    await ctx.visitors.ingestEvent({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'page-view',
    });
    expect(await ctx.leads.list({})).toHaveLength(1);
  });

  it('creates no candidate for an anonymous checkout start', async () => {
    const ctx = createTestContext();
    await browse(ctx);
    await ctx.visitors.ingestEvent({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'checkout-start',
      payload: { cartValueMinor: 185_000 },
    });
    expect(await ctx.leads.list({})).toHaveLength(0);
  });

  it('creates a candidate from a hot score with contact details, even without checkout', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    await ctx.visitors.linkAuthenticated(customer.id, VISITOR);
    for (let index = 0; index < 5; index += 1) {
      await ctx.visitors.ingestEvent({
        visitorId: VISITOR,
        sessionId: SESSION,
        type: 'product-view',
        payload: { productId: 'sneakers-court' },
      });
    }
    await ctx.visitors.ingestEvent({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'add-to-cart',
      payload: { cartValueMinor: 250_000 },
    });
    // 25 recency + 20 views + 25 cart value = 70, the hot floor.
    const leads = await ctx.leads.list({});
    expect(leads).toHaveLength(1);
    expect(leads[0]?.score).toBe(70);
  });

  it('keeps a candidate raised by an order\u2019s own guest-checkout link open as a follow-up lead', async () => {
    const ctx = createTestContext();
    // Hot anonymous browsing: 5 views plus a 2500 taka cart and a
    // checkout start score 85, but anonymous means no candidate.
    for (let index = 0; index < 5; index += 1) {
      await ctx.visitors.ingestEvent({
        visitorId: VISITOR,
        sessionId: SESSION,
        type: 'product-view',
        payload: { productId: 'sneakers-court' },
      });
    }
    await ctx.visitors.ingestEvent({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'add-to-cart',
      payload: { cartValueMinor: 250_000 },
    });
    await ctx.visitors.ingestEvent({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'checkout-start',
      payload: { cartValueMinor: 250_000 },
    });
    expect(await ctx.leads.list({})).toHaveLength(0);
    const { variant } = await findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
    await ctx.checkout.placeOrder({
      customer: {
        fullName: 'Lead Buyer',
        phone: '01712345678',
        email: 'guestlead@example.com',
      },
      lines: [
        { productId: 'sneakers-court', variantId: variant.id, quantity: 1 },
      ],
      address: DHAKA_ADDRESS,
      paymentMethod: 'cod',
      visitorId: VISITOR,
    });
    const leads = await ctx.leads.list({});
    expect(leads).toHaveLength(1);
    expect(leads[0]?.status).toBe('new');
    expect(leads[0]?.source).toBe('guest-checkout');
    expect(leads[0]?.score).toBe(85);
    expect(leads[0]?.contactBasis).toBe('checkout');
  });

  it('converts the open lead when the customer places an order', async () => {    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    await browse(ctx);
    await ctx.visitors.linkAuthenticated(customer.id, VISITOR);
    await ctx.visitors.ingestEvent({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'checkout-start',
    });
    expect(await ctx.leads.list({})).toHaveLength(1);
    const { variant } = await findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
    await ctx.checkout.placeOrder({
      customerId: customer.id,
      lines: [
        { productId: 'sneakers-court', variantId: variant.id, quantity: 1 },
      ],
      address: DHAKA_ADDRESS,
      paymentMethod: 'cod',
    });
    const [lead] = await ctx.leads.list({});
    expect(lead?.status).toBe('converted');
    expect(
      (await ctx.audit.list({ action: 'lead.converted' })).length,
    ).toBeGreaterThanOrEqual(1);
  });
});

describe('lead pipeline, assignment and tasks', async () => {
  it('assigns, moves through legal transitions and rejects illegal ones', async () => {
    const ctx = createTestContext();
    const actor = salesActor();
    const lead = await ctx.leads.createManual(
      { fullName: 'Form Person', phone: '01612345678', source: 'contact-form' },
      actor,
    );
    expect(lead.contactBasis).toBe('contact-form');

    const assigned = await ctx.leads.assign(lead.id, 'agent-9', actor);
    expect(assigned.assigneeId).toBe('agent-9');
    expect(await ctx.audit.list({ action: 'lead.assigned' })).toHaveLength(1);
    expect(await ctx.leads.list({ assigneeId: 'agent-9' })).toHaveLength(1);
    expect(await ctx.leads.list({ assigneeId: 'agent-1' })).toHaveLength(0);

    await ctx.leads.transitionStatus(lead.id, 'qualified', actor);
    await ctx.leads.transitionStatus(lead.id, 'contacted', actor);
    await expect(
      ctx.leads.transitionStatus(lead.id, 'new', actor),
    ).rejects.toThrow(BadRequestException);
    await expect(
      ctx.leads.transitionStatus(lead.id, 'do-not-contact', actor),
    ).rejects.toThrow(BadRequestException);
    expect((await ctx.leads.getLead(lead.id)).status).toBe('contacted');
  });

  it('runs follow-up tasks through create, list and complete', async () => {
    const ctx = createTestContext();
    const actor = salesActor();
    const lead = await ctx.leads.createManual(
      { fullName: 'Task Person', phone: '01612345678' },
      actor,
    );
    const task = await ctx.leads.createTask(
      lead.id,
      { title: 'Call about the sneakers' },
      actor,
    );
    expect(task.status).toBe('open');
    expect(await ctx.leads.listTasks(lead.id)).toHaveLength(1);
    const done = await ctx.leads.completeTask(lead.id, task.id, actor);
    expect(done.status).toBe('completed');
    expect(done.completedAt).not.toBeNull();
    await expect(
      ctx.leads.completeTask(lead.id, task.id, actor),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('contact attempts and opt-out', async () => {
  it('records attempts with staff, channel, purpose and result', async () => {
    const ctx = createTestContext();
    const actor = salesActor('agent-7');
    const lead = await ctx.leads.createManual(
      { fullName: 'Call Person', phone: '01612345678', source: 'contact-form' },
      actor,
    );
    const attempt = await ctx.leads.recordContactAttempt(
      lead.id,
      {
        channel: 'phone',
        purpose: 'Follow up on the submitted form',
        result: 'answered',
      },
      actor,
    );
    expect(attempt.staffId).toBe('agent-7');
    expect(attempt.channel).toBe('phone');
    expect(attempt.optedOut).toBe(false);
    expect(await ctx.leads.listAttempts(lead.id)).toHaveLength(1);
    expect(await ctx.audit.list({ action: 'lead.contact-attempt' })).toHaveLength(1);
  });

  it('refuses attempts without details for the channel or without a contact basis', async () => {
    const ctx = createTestContext();
    const actor = salesActor();
    const noDetails = await ctx.leads.createManual(
      { visitorId: 'visitor-nodetails-1' },
      actor,
    );
    expect(noDetails.contactBasis).toBeNull();
    await expect(
      ctx.leads.recordContactAttempt(
        noDetails.id,
        { channel: 'phone', purpose: 'Check in', result: 'answered' },
        actor,
      ),
    ).rejects.toThrow(BadRequestException);
    const emailOnly = await ctx.leads.createManual(
      { fullName: 'Mail Person', email: 'mail@example.com' },
      actor,
    );
    await expect(
      ctx.leads.recordContactAttempt(
        emailOnly.id,
        { channel: 'whatsapp', purpose: 'Check in', result: 'answered' },
        actor,
      ),
    ).rejects.toThrow(BadRequestException);
    // The matching channel works.
    expect(
      (await ctx.leads.recordContactAttempt(
        emailOnly.id,
        { channel: 'email', purpose: 'Check in', result: 'no-answer' },
        actor,
      )).channel,
    ).toBe('email');
  });

  it('an opt-out suppresses the lead and refuses every later attempt', async () => {
    const ctx = createTestContext();
    const actor = salesActor();
    const lead = await ctx.leads.createManual(
      { fullName: 'Opt Out Person', phone: '01612345678' },
      actor,
    );
    await ctx.leads.recordContactAttempt(
      lead.id,
      {
        channel: 'phone',
        purpose: 'First follow-up',
        result: 'opted-out',
      },
      actor,
    );
    const after = await ctx.leads.getLead(lead.id);
    expect(after.optedOut).toBe(true);
    expect(after.status).toBe('do-not-contact');
    expect(await ctx.leadsRepo.listSuppressions()).toHaveLength(1);
    expect(await ctx.audit.list({ action: 'lead.opted-out' })).toHaveLength(1);
    await expect(
      ctx.leads.recordContactAttempt(
        lead.id,
        { channel: 'phone', purpose: 'Second try', result: 'answered' },
        actor,
      ),
    ).rejects.toThrow(ForbiddenException);
    // The suppression follows the phone number to a new lead too.
    const twin = await ctx.leads.createManual(
      { fullName: 'Same Number', phone: '01612345678' },
      actor,
    );
    await expect(
      ctx.leads.recordContactAttempt(
        twin.id,
        { channel: 'sms', purpose: 'New lead attempt', result: 'answered' },
        actor,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses attempts when the visitor denied marketing consent', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    await ctx.visitors.recordConsent({
      visitorId: VISITOR,
      scope: 'marketing',
      status: 'denied',
    });
    await ctx.visitors.linkAuthenticated(customer.id, VISITOR);
    const actor = salesActor();
    const lead = await ctx.leads.createManual(
      { visitorId: VISITOR, customerId: customer.id },
      actor,
    );
    await expect(
      ctx.leads.recordContactAttempt(
        lead.id,
        { channel: 'phone', purpose: 'Follow up', result: 'answered' },
        actor,
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('manual lead identity handling', async () => {
  it('marks a visitor Unverified Contact when staff record a form against it', async () => {
    const ctx = createTestContext();
    const actor = salesActor();
    await ctx.visitors.ingestEvent({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'page-view',
    });
    await ctx.leads.createManual(
      {
        visitorId: VISITOR,
        fullName: 'Form Person',
        phone: '01612345678',
        source: 'contact-form',
      },
      actor,
    );
    expect((await ctx.visitors.getSession(SESSION))?.identityStatus).toBe(
      'unverified-contact',
    );
    // Still no customer link: the status does not overclaim.
    expect((await ctx.visitors.getSession(SESSION))?.customerId).toBeNull();
  });
});
