import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  FollowUpTask,
  Lead,
  LeadContactBasis,
  LeadContactAttempt,
  LeadStatus,
} from '@dostelo/types';
import type {
  ContactAttemptCreate,
  FollowUpTaskCreate,
  LeadCreate,
} from '@dostelo/validation';
import type { AuthPrincipal } from '../../common/auth/principal';
import type { Tx } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BuyerIntelligenceService } from '../buyer-intelligence/buyer-intelligence.service';
import { CustomersService } from '../customers/customers.service';
import { OrdersRepository } from '../orders/repositories/orders.repository';
import { VisitorsService } from '../visitors/visitors.service';
import { isLegalLeadTransition } from './policies/lead-flow';
import { LeadsRepository } from './repositories/leads.repository';

export interface LeadDetail {
  lead: Lead;
  attempts: LeadContactAttempt[];
  followUpTasks: FollowUpTask[];
}

/** Score at or above which an identified session with contact
 * details raises an automatic lead candidate. */
export const LEAD_CANDIDATE_SCORE = 70;

/**
 * Lead Management (Phase 5), from section 04 of the admin master
 * structure.
 *
 * Creation paths:
 * - Automatic candidates, evaluated after event ingestion and
 *   identity linking (see evaluateCandidate): an identified
 *   visitor (Known Customer or Guest Checkout) who started
 *   checkout and has not ordered since, or whose lead score
 *   reaches LEAD_CANDIDATE_SCORE with contact details on file.
 *   Anonymous visitors never raise candidates: there is nobody
 *   contactable, and a score is not an identity.
 * - Manual creation by staff, which is how a submitted contact
 *   form or an offline enquiry enters the pipeline. When a manual
 *   lead carries contact details against a still-anonymous
 *   visitor, that visitor's sessions become Unverified Contact:
 *   details exist, no account has claimed them.
 *
 * Contact rules, enforced in recordContactAttempt: the lead must
 * hold details for the channel, a contact basis must be recorded
 * (account, checkout, contact form or marketing consent), the
 * visitor must not have denied marketing consent, and an opted-out
 * or suppressed lead refuses every further attempt.
 */
@Injectable()
export class LeadsService implements OnModuleInit {
  constructor(
    private readonly leads: LeadsRepository,
    private readonly visitors: VisitorsService,
    private readonly intelligence: BuyerIntelligenceService,
    private readonly customers: CustomersService,
    private readonly orders: OrdersRepository,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.visitors.setCandidateHook((visitorId) =>
      this.evaluateCandidate(visitorId),
    );
  }

  // -- Automatic candidates --------------------------------------

  /**
   * Evaluates whether a visitor should have an open lead
   * candidate. Idempotent and best-effort: it runs inside event
   * ingestion and linking, so it never throws into those flows.
   * Returns the open lead for the visitor when one exists or was
   * created, otherwise null.
   */
  async evaluateCandidate(visitorId: string): Promise<Lead | null> {
    try {
      return await this.evaluateCandidateInner(visitorId);
    } catch {
      return null;
    }
  }

  private async evaluateCandidateInner(visitorId: string): Promise<Lead | null> {
    const existing =
      (await this.leads.findOpenForVisitor(visitorId))[0] ?? null;
    if (existing) return existing;

    const sessions = await this.visitors.listSessionsForVisitor(visitorId);
    const identified = sessions.find(
      (session) =>
        session.customerId !== null &&
        session.identityStatus !== 'anonymous' &&
        session.identityStatus !== 'unverified-contact',
    );
    if (!identified || !identified.customerId) return null;
    const customerId = identified.customerId;

    const byCustomer = (await this.leads.findOpenForCustomer(customerId))[0];
    if (byCustomer) return byCustomer;

    const customer = await this.customers.findStored(customerId);
    const events = await this.visitors.listEventsForVisitor(visitorId);
    const summaries = await Promise.all(
      sessions.map((session) =>
        this.intelligence.summarizeSession(session),
      ),
    );
    const best = summaries.reduce((top, summary) =>
      summary.leadScore > top.leadScore ? summary : top,
    );

    // Buying intent, rule 1: a checkout start that no later order
    // has answered. Orders are checked against the checkout
    // start time, so a returning customer who starts checkout
    // again after an old order still raises a candidate.
    const checkoutStarts = events
      .filter((event) => event.type === 'checkout-start')
      .map((event) => event.occurredAt)
      .sort();
    const firstCheckoutStart = checkoutStarts[0];
    const orders = await this.orders.listByCustomer(customerId);
    const orderedAfterIntent = firstCheckoutStart
      ? orders.some((order) => order.createdAt >= firstCheckoutStart)
      : orders.length > 0;
    const abandonedCheckout = Boolean(firstCheckoutStart) && !orderedAfterIntent;

    // Buying intent, rule 2: a hot score with contact details.
    const hasContactDetails = Boolean(customer.phone || customer.email);
    const hotWithDetails =
      best.leadScore >= LEAD_CANDIDATE_SCORE && hasContactDetails;

    if (!abandonedCheckout && !hotWithDetails) return null;

    const now = new Date().toISOString();
    const lead: Lead = {
      id: randomUUID(),
      status: 'new',
      source:
        identified.identityStatus === 'guest-checkout'
          ? 'guest-checkout'
          : 'buyer-intelligence',
      visitorId,
      sessionId: best.sessionId,
      customerId,
      fullName: customer.fullName,
      email: customer.email,
      phone: customer.phone || null,
      score: best.leadScore,
      contactBasis:
        identified.identityStatus === 'known-customer'
          ? 'account'
          : 'checkout',
      assigneeId: null,
      optedOut: false,
      optedOutAt: null,
      note: abandonedCheckout
        ? 'Automatic candidate: checkout started without a completed order.'
        : 'Automatic candidate: hot lead score with contact details on file.',
      createdAt: now,
      updatedAt: now,
    };
    await this.leads.create(lead);
    await this.audit.record({
      actorType: 'system',
      actorId: null,
      action: 'lead.created',
      entityType: 'lead',
      entityId: lead.id,
      metadata: { source: lead.source, automatic: true, score: lead.score },
    });
    return lead;
  }

  // -- Manual creation -------------------------------------------

  async createManual(dto: LeadCreate, actor: AuthPrincipal): Promise<Lead> {
    let customerId = dto.customerId ?? null;
    if (customerId) {
      // Throws a 404 for an unknown customer id.
      await this.customers.findStored(customerId);
    } else if (dto.email) {
      customerId =
        (await this.customers.findStoredByEmail(dto.email))?.id ?? null;
    } else if (dto.phone) {
      customerId =
        (await this.customers.findStoredByPhone(dto.phone))?.id ?? null;
    }
    const customer = customerId
      ? await this.customers.findStored(customerId)
      : null;

    const hasDetails = Boolean(dto.phone || dto.email || customer?.phone || customer?.email);
    let contactBasis: LeadContactBasis | null = null;
    if (customerId && dto.visitorId) {
      const session = (await this.visitors.listSessionsForVisitor(dto.visitorId))
        .find((item) => item.customerId === customerId);
      if (session?.identityStatus === 'known-customer') {
        contactBasis = 'account';
      } else if (session?.identityStatus === 'guest-checkout') {
        contactBasis = 'checkout';
      }
    }
    if (!contactBasis && hasDetails) contactBasis = 'contact-form';
    if (
      !contactBasis &&
      dto.visitorId &&
      (await this.visitors.latestConsent(dto.visitorId, 'marketing'))?.status ===
        'granted'
    ) {
      contactBasis = 'marketing-consent';
    }

    const now = new Date().toISOString();
    const lead: Lead = {
      id: randomUUID(),
      status: 'new',
      source: dto.source ?? 'manual',
      visitorId: dto.visitorId ?? null,
      sessionId: dto.sessionId ?? null,
      customerId,
      fullName: dto.fullName ?? customer?.fullName ?? null,
      email: dto.email ?? customer?.email ?? null,
      phone: dto.phone ?? customer?.phone ?? null,
      score: null,
      contactBasis,
      assigneeId: null,
      optedOut: false,
      optedOutAt: null,
      note: dto.note ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await this.leads.create(lead);
    if (dto.visitorId && hasDetails && !customerId) {
      await this.visitors.markUnverifiedContact(dto.visitorId);
    }
    await this.audit.recordForPrincipal(actor, {
      action: 'lead.created',
      entityType: 'lead',
      entityId: lead.id,
      metadata: { source: lead.source, automatic: false },
    });
    return lead;
  }

  // -- Reads -------------------------------------------------------

  async list(filter: { status?: LeadStatus; assigneeId?: string }): Promise<Lead[]> {
    return (await this.leads.list())
      .filter((lead) => {
        if (filter.status && lead.status !== filter.status) return false;
        if (filter.assigneeId && lead.assigneeId !== filter.assigneeId) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getLead(id: string): Promise<Lead> {
    const lead = await this.leads.findById(id);
    if (!lead) throw new NotFoundException(`Lead not found: ${id}`);
    return lead;
  }

  async getDetail(id: string): Promise<LeadDetail> {
    const lead = await this.getLead(id);
    return {
      lead,
      attempts: await this.leads.listAttempts(id),
      followUpTasks: await this.leads.listTasks(id),
    };
  }

  // -- Pipeline ----------------------------------------------------

  async assign(id: string, assigneeId: string, actor: AuthPrincipal): Promise<Lead> {
    const lead = await this.getLead(id);
    lead.assigneeId = assigneeId;
    lead.updatedAt = new Date().toISOString();
    await this.leads.save(lead);
    await this.audit.recordForPrincipal(actor, {
      action: 'lead.assigned',
      entityType: 'lead',
      entityId: lead.id,
      metadata: { assigneeId },
    });
    return lead;
  }

  async transitionStatus(
    id: string,
    status: LeadStatus,
    actor: AuthPrincipal,
  ): Promise<Lead> {
    const lead = await this.getLead(id);
    if (status === 'do-not-contact') {
      throw new BadRequestException(
        'Do Not Contact is reached only by recording an opt-out',
      );
    }
    if (!isLegalLeadTransition(lead.status, status)) {
      throw new BadRequestException(
        `Illegal lead transition: ${lead.status} to ${status}`,
      );
    }
    const from = lead.status;
    lead.status = status;
    lead.updatedAt = new Date().toISOString();
    await this.leads.save(lead);
    await this.audit.recordForPrincipal(actor, {
      action:
        status === 'converted' ? 'lead.converted' : 'lead.status-changed',
      entityType: 'lead',
      entityId: lead.id,
      metadata: { from, to: status },
    });
    return lead;
  }

  /** Ids of the customer's currently open leads. Checkout
   * snapshots these before an order links any new identity, so
   * conversion can tell "existed before this order" apart from
   * "raised by this order" by identity, not by comparing
   * wall-clock timestamps: both sides use millisecond-resolution
   * ISO strings, so a lead created in the same millisecond as
   * the order would tie and be misread as raised by the order. */
  async openLeadIdsForCustomer(customerId: string, tx?: Tx): Promise<string[]> {
    return (await this.leads.findOpenForCustomer(customerId, tx)).map(
      (lead) => lead.id,
    );
  }

  /** Converts open leads for a customer after an order
   * placement. Called by checkout; the actor is the system,
   * because the customer converted themselves. Only leads that
   * existed before the order convert (the ids checkout
   * snapshotted before linking): a candidate raised by the
   * linking of this very order (a hot guest-checkout session) is
   * a follow-up lead for the next purchase, not a converted one. */
  async markConvertedForCustomer(
    customerId: string,
    orderNumber: string,
    openLeadIdsBeforeOrder: ReadonlySet<string>,
    tx?: Tx,
  ): Promise<void> {
    for (const lead of await this.leads.findOpenForCustomer(customerId, tx)) {
      if (!openLeadIdsBeforeOrder.has(lead.id)) continue;
      lead.status = 'converted';
      lead.updatedAt = new Date().toISOString();
      await this.leads.save(lead, tx);
      await this.audit.record({
        actorType: 'system',
        actorId: null,
        action: 'lead.converted',
        entityType: 'lead',
        entityId: lead.id,
        metadata: { customerId, orderNumber },
      });
    }
  }

  // -- Follow-up tasks ----------------------------------------------

  async createTask(
    leadId: string,
    dto: FollowUpTaskCreate,
    actor: AuthPrincipal,
  ): Promise<FollowUpTask> {
    const lead = await this.getLead(leadId);
    const task: FollowUpTask = {
      id: randomUUID(),
      leadId: lead.id,
      title: dto.title,
      dueAt: dto.dueAt ?? null,
      status: 'open',
      createdById: actor.id,
      completedAt: null,
      createdAt: new Date().toISOString(),
    };
    await this.leads.createTask(task);
    await this.audit.recordForPrincipal(actor, {
      action: 'lead.follow-up-created',
      entityType: 'lead',
      entityId: lead.id,
      metadata: { taskId: task.id },
    });
    return task;
  }

  async listTasks(leadId: string): Promise<FollowUpTask[]> {
    await this.getLead(leadId);
    return this.leads.listTasks(leadId);
  }

  async completeTask(
    leadId: string,
    taskId: string,
    actor: AuthPrincipal,
  ): Promise<FollowUpTask> {
    await this.getLead(leadId);
    const task = await this.leads.findTask(taskId);
    if (!task || task.leadId !== leadId) {
      throw new NotFoundException(`Follow-up task not found: ${taskId}`);
    }
    if (task.status === 'completed') {
      throw new BadRequestException('Follow-up task is already completed');
    }
    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    await this.leads.saveTask(task);
    await this.audit.recordForPrincipal(actor, {
      action: 'lead.follow-up-completed',
      entityType: 'lead',
      entityId: leadId,
      metadata: { taskId },
    });
    return task;
  }

  // -- Contact attempts and opt-out ----------------------------------

  async listAttempts(leadId: string): Promise<LeadContactAttempt[]> {
    await this.getLead(leadId);
    return this.leads.listAttempts(leadId);
  }

  async recordContactAttempt(
    leadId: string,
    dto: ContactAttemptCreate,
    actor: AuthPrincipal,
  ): Promise<LeadContactAttempt> {
    const lead = await this.getLead(leadId);
    if (lead.optedOut || lead.status === 'do-not-contact') {
      throw new ForbiddenException(
        'This lead has opted out. Contact attempts are refused.',
      );
    }
    const suppressed = (await this.leads.listSuppressions()).some(
      (record) =>
        record.leadId === lead.id ||
        (lead.phone !== null && record.phone === lead.phone),
    );
    if (suppressed) {
      throw new ForbiddenException(
        'This lead is on the suppression list. Contact attempts are refused.',
      );
    }
    const needsPhone =
      dto.channel === 'phone' || dto.channel === 'whatsapp' || dto.channel === 'sms';
    if (needsPhone && !lead.phone) {
      throw new BadRequestException(
        `No phone number on this lead for a ${dto.channel} attempt`,
      );
    }
    if (dto.channel === 'email' && !lead.email) {
      throw new BadRequestException(
        'No email address on this lead for an email attempt',
      );
    }
    if (!lead.contactBasis) {
      throw new ForbiddenException(
        'No recorded contact basis for this lead: contact requires provided details through an account, checkout or contact form flow, or a granted marketing consent',
      );
    }
    if (
      lead.visitorId &&
      (await this.visitors.latestConsent(lead.visitorId, 'marketing'))?.status ===
        'denied'
    ) {
      throw new ForbiddenException(
        'This visitor denied marketing consent. Contact attempts are refused.',
      );
    }

    const optedOut = dto.optOut === true || dto.result === 'opted-out';
    const attempt: LeadContactAttempt = {
      id: randomUUID(),
      leadId: lead.id,
      channel: dto.channel,
      purpose: dto.purpose,
      result: dto.result,
      note: dto.note ?? null,
      staffId: actor.id,
      optedOut,
      createdAt: new Date().toISOString(),
    };
    await this.leads.appendAttempt(attempt);
    await this.audit.recordForPrincipal(actor, {
      action: 'lead.contact-attempt',
      entityType: 'lead',
      entityId: lead.id,
      metadata: {
        channel: dto.channel,
        purpose: dto.purpose,
        result: dto.result,
        optedOut,
      },
    });
    if (optedOut) {
      await this.applyOptOut(lead, actor, 'Opt-out recorded on a contact attempt');
    }
    return attempt;
  }

  /** Records an opt-out outside a contact attempt (for example a
   * reply to a message). Same suppression effect. */
  async optOut(leadId: string, actor: AuthPrincipal): Promise<Lead> {
    const lead = await this.getLead(leadId);
    if (lead.optedOut) return lead;
    await this.applyOptOut(lead, actor, 'Opt-out recorded by staff');
    return lead;
  }

  private async applyOptOut(
    lead: Lead,
    actor: AuthPrincipal | null,
    reason: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    lead.optedOut = true;
    lead.optedOutAt = now;
    lead.status = 'do-not-contact';
    lead.updatedAt = now;
    await this.leads.save(lead);
    await this.leads.appendSuppression({
      id: randomUUID(),
      leadId: lead.id,
      customerId: lead.customerId,
      phone: lead.phone,
      reason,
      createdAt: now,
    });
    const input = {
      action: 'lead.opted-out',
      entityType: 'lead',
      entityId: lead.id,
      metadata: { reason },
    };
    if (actor) {
      await this.audit.recordForPrincipal(actor, input);
    } else {
      await this.audit.record({ actorType: 'system', actorId: null, ...input });
    }
  }
}
