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

function browse(ctx: TestContext) {
  ctx.visitors.ingestEvent({
    visitorId: VISITOR,
    sessionId: SESSION,
    type: 'product-view',
    payload: { productId: 'sneakers-court' },
  });
  ctx.visitors.ingestEvent({
    visitorId: VISITOR,
    sessionId: SESSION,
    type: 'add-to-cart',
    payload: { productId: 'sneakers-court', cartValueMinor: 185_000 },
  });
}

describe('lead auto-candidates', () => {
  it('creates a candidate when an identified visitor starts checkout without ordering', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    browse(ctx);
    ctx.visitors.linkAuthenticated(customer.id, VISITOR);
    ctx.visitors.ingestEvent({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'checkout-start',
      payload: { cartValueMinor: 185_000 },
    });
    const leads = ctx.leads.list({});
    expect(leads).toHaveLength(1);
    expect(leads[0]?.status).toBe('new');
    expect(leads[0]?.source).toBe('buyer-intelligence');
    expect(leads[0]?.customerId).toBe(customer.id);
    expect(leads[0]?.phone).toBe('01812345678');
    expect(leads[0]?.contactBasis).toBe('account');
    // Evaluation is idempotent: more events do not duplicate it.
    ctx.visitors.ingestEvent({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'page-view',
    });
    expect(ctx.leads.list({})).toHaveLength(1);
  });

  it('creates no candidate for an anonymous checkout start', () => {
    const ctx = createTestContext();
    browse(ctx);
    ctx.visitors.ingestEvent({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'checkout-start',
      payload: { cartValueMinor: 185_000 },
    });
    expect(ctx.leads.list({})).toHaveLength(0);
  });

  it('creates a candidate from a hot score with contact details, even without checkout', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    ctx.visitors.linkAuthenticated(customer.id, VISITOR);
    for (let index = 0; index < 5; index += 1) {
      ctx.visitors.ingestEvent({
        visitorId: VISITOR,
        sessionId: SESSION,
        type: 'product-view',
        payload: { productId: 'sneakers-court' },
      });
    }
    ctx.visitors.ingestEvent({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'add-to-cart',
      payload: { cartValueMinor: 250_000 },
    });
    // 25 recency + 20 views + 25 cart value = 70, the hot floor.
    const leads = ctx.leads.list({});
    expect(leads).toHaveLength(1);
    expect(leads[0]?.score).toBe(70);
  });

  it('keeps a candidate raised by an order\u2019s own guest-checkout link open as a follow-up lead', () => {
    const ctx = createTestContext();
    // Hot anonymous browsing: 5 views plus a 2500 taka cart and a
    // checkout start score 85, but anonymous means no candidate.
    for (let index = 0; index < 5; index += 1) {
      ctx.visitors.ingestEvent({
        visitorId: VISITOR,
        sessionId: SESSION,
        type: 'product-view',
        payload: { productId: 'sneakers-court' },
      });
    }
    ctx.visitors.ingestEvent({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'add-to-cart',
      payload: { cartValueMinor: 250_000 },
    });
    ctx.visitors.ingestEvent({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'checkout-start',
      payload: { cartValueMinor: 250_000 },
    });
    expect(ctx.leads.list({})).toHaveLength(0);
    const { variant } = findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
    ctx.checkout.placeOrder({
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
    const leads = ctx.leads.list({});
    expect(leads).toHaveLength(1);
    expect(leads[0]?.status).toBe('new');
    expect(leads[0]?.source).toBe('guest-checkout');
    expect(leads[0]?.score).toBe(85);
    expect(leads[0]?.contactBasis).toBe('checkout');
  });

  it('converts the open lead when the customer places an order', async () => {    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    browse(ctx);
    ctx.visitors.linkAuthenticated(customer.id, VISITOR);
    ctx.visitors.ingestEvent({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'checkout-start',
    });
    expect(ctx.leads.list({})).toHaveLength(1);
    const { variant } = findVariant(ctx, 'sneakers-court', 'EU 41', 'White');
    ctx.checkout.placeOrder({
      customerId: customer.id,
      lines: [
        { productId: 'sneakers-court', variantId: variant.id, quantity: 1 },
      ],
      address: DHAKA_ADDRESS,
      paymentMethod: 'cod',
    });
    const [lead] = ctx.leads.list({});
    expect(lead?.status).toBe('converted');
    expect(
      ctx.audit.list({ action: 'lead.converted' }).length,
    ).toBeGreaterThanOrEqual(1);
  });
});

describe('lead pipeline, assignment and tasks', () => {
  it('assigns, moves through legal transitions and rejects illegal ones', () => {
    const ctx = createTestContext();
    const actor = salesActor();
    const lead = ctx.leads.createManual(
      { fullName: 'Form Person', phone: '01612345678', source: 'contact-form' },
      actor,
    );
    expect(lead.contactBasis).toBe('contact-form');

    const assigned = ctx.leads.assign(lead.id, 'agent-9', actor);
    expect(assigned.assigneeId).toBe('agent-9');
    expect(ctx.audit.list({ action: 'lead.assigned' })).toHaveLength(1);
    expect(ctx.leads.list({ assigneeId: 'agent-9' })).toHaveLength(1);
    expect(ctx.leads.list({ assigneeId: 'agent-1' })).toHaveLength(0);

    ctx.leads.transitionStatus(lead.id, 'qualified', actor);
    ctx.leads.transitionStatus(lead.id, 'contacted', actor);
    expect(() =>
      ctx.leads.transitionStatus(lead.id, 'new', actor),
    ).toThrow(BadRequestException);
    expect(() =>
      ctx.leads.transitionStatus(lead.id, 'do-not-contact', actor),
    ).toThrow(BadRequestException);
    expect(ctx.leads.getLead(lead.id).status).toBe('contacted');
  });

  it('runs follow-up tasks through create, list and complete', () => {
    const ctx = createTestContext();
    const actor = salesActor();
    const lead = ctx.leads.createManual(
      { fullName: 'Task Person', phone: '01612345678' },
      actor,
    );
    const task = ctx.leads.createTask(
      lead.id,
      { title: 'Call about the sneakers' },
      actor,
    );
    expect(task.status).toBe('open');
    expect(ctx.leads.listTasks(lead.id)).toHaveLength(1);
    const done = ctx.leads.completeTask(lead.id, task.id, actor);
    expect(done.status).toBe('completed');
    expect(done.completedAt).not.toBeNull();
    expect(() =>
      ctx.leads.completeTask(lead.id, task.id, actor),
    ).toThrow(BadRequestException);
  });
});

describe('contact attempts and opt-out', () => {
  it('records attempts with staff, channel, purpose and result', () => {
    const ctx = createTestContext();
    const actor = salesActor('agent-7');
    const lead = ctx.leads.createManual(
      { fullName: 'Call Person', phone: '01612345678', source: 'contact-form' },
      actor,
    );
    const attempt = ctx.leads.recordContactAttempt(
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
    expect(ctx.leads.listAttempts(lead.id)).toHaveLength(1);
    expect(ctx.audit.list({ action: 'lead.contact-attempt' })).toHaveLength(1);
  });

  it('refuses attempts without details for the channel or without a contact basis', () => {
    const ctx = createTestContext();
    const actor = salesActor();
    const noDetails = ctx.leads.createManual(
      { visitorId: 'visitor-nodetails-1' },
      actor,
    );
    expect(noDetails.contactBasis).toBeNull();
    expect(() =>
      ctx.leads.recordContactAttempt(
        noDetails.id,
        { channel: 'phone', purpose: 'Check in', result: 'answered' },
        actor,
      ),
    ).toThrow(BadRequestException);
    const emailOnly = ctx.leads.createManual(
      { fullName: 'Mail Person', email: 'mail@example.com' },
      actor,
    );
    expect(() =>
      ctx.leads.recordContactAttempt(
        emailOnly.id,
        { channel: 'whatsapp', purpose: 'Check in', result: 'answered' },
        actor,
      ),
    ).toThrow(BadRequestException);
    // The matching channel works.
    expect(
      ctx.leads.recordContactAttempt(
        emailOnly.id,
        { channel: 'email', purpose: 'Check in', result: 'no-answer' },
        actor,
      ).channel,
    ).toBe('email');
  });

  it('an opt-out suppresses the lead and refuses every later attempt', () => {
    const ctx = createTestContext();
    const actor = salesActor();
    const lead = ctx.leads.createManual(
      { fullName: 'Opt Out Person', phone: '01612345678' },
      actor,
    );
    ctx.leads.recordContactAttempt(
      lead.id,
      {
        channel: 'phone',
        purpose: 'First follow-up',
        result: 'opted-out',
      },
      actor,
    );
    const after = ctx.leads.getLead(lead.id);
    expect(after.optedOut).toBe(true);
    expect(after.status).toBe('do-not-contact');
    expect(ctx.leadsRepo.listSuppressions()).toHaveLength(1);
    expect(ctx.audit.list({ action: 'lead.opted-out' })).toHaveLength(1);
    expect(() =>
      ctx.leads.recordContactAttempt(
        lead.id,
        { channel: 'phone', purpose: 'Second try', result: 'answered' },
        actor,
      ),
    ).toThrow(ForbiddenException);
    // The suppression follows the phone number to a new lead too.
    const twin = ctx.leads.createManual(
      { fullName: 'Same Number', phone: '01612345678' },
      actor,
    );
    expect(() =>
      ctx.leads.recordContactAttempt(
        twin.id,
        { channel: 'sms', purpose: 'New lead attempt', result: 'answered' },
        actor,
      ),
    ).toThrow(ForbiddenException);
  });

  it('refuses attempts when the visitor denied marketing consent', async () => {
    const ctx = createTestContext();
    const customer = await registerCustomer(ctx);
    ctx.visitors.recordConsent({
      visitorId: VISITOR,
      scope: 'marketing',
      status: 'denied',
    });
    ctx.visitors.linkAuthenticated(customer.id, VISITOR);
    const actor = salesActor();
    const lead = ctx.leads.createManual(
      { visitorId: VISITOR, customerId: customer.id },
      actor,
    );
    expect(() =>
      ctx.leads.recordContactAttempt(
        lead.id,
        { channel: 'phone', purpose: 'Follow up', result: 'answered' },
        actor,
      ),
    ).toThrow(ForbiddenException);
  });
});

describe('manual lead identity handling', () => {
  it('marks a visitor Unverified Contact when staff record a form against it', () => {
    const ctx = createTestContext();
    const actor = salesActor();
    ctx.visitors.ingestEvent({
      visitorId: VISITOR,
      sessionId: SESSION,
      type: 'page-view',
    });
    ctx.leads.createManual(
      {
        visitorId: VISITOR,
        fullName: 'Form Person',
        phone: '01612345678',
        source: 'contact-form',
      },
      actor,
    );
    expect(ctx.visitors.getSession(SESSION)?.identityStatus).toBe(
      'unverified-contact',
    );
    // Still no customer link: the status does not overclaim.
    expect(ctx.visitors.getSession(SESSION)?.customerId).toBeNull();
  });
});
