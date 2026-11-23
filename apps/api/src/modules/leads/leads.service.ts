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

  onModuleInit(): void {
    this.visitors.setCandidateHook((visitorId) =>
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
  evaluateCandidate(visitorId: string): Lead | null {
    try {
      return this.evaluateCandidateInner(visitorId);
    } catch {
      return null;
    }
  }

  private evaluateCandidateInner(visitorId: string): Lead | null {
    const existing =
      this.leads.findOpenForVisitor(visitorId)[0] ?? null;
    if (existing) return existing;

    const sessions = this.visitors.listSessionsForVisitor(visitorId);
    const identified = sessions.find(
      (session) =>
        session.customerId !== null &&
        session.identityStatus !== 'anonymous' &&
        session.identityStatus !== 'unverified-contact',
    );
    if (!identified || !identified.customerId) return null;
    const customerId = identified.customerId;

    const byCustomer = this.leads.findOpenForCustomer(customerId)[0];
    if (byCustomer) return byCustomer;

    const customer = this.customers.findStored(customerId);
    const events = this.visitors.listEventsForVisitor(visitorId);
    const summaries = sessions.map((session) =>
      this.intelligence.summarizeSession(session),
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
    const orders = this.orders.listByCustomer(customerId);
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
    this.leads.create(lead);
    this.audit.record({
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

  createManual(dto: LeadCreate, actor: AuthPrincipal): Lead {
    let customerId = dto.customerId ?? null;
    if (customerId) {
      // Throws a 404 for an unknown customer id.
      this.customers.findStored(customerId);
    } else if (dto.email) {
      customerId =
        this.customers.findStoredByEmail(dto.email)?.id ?? null;
    } else if (dto.phone) {
      customerId =
        this.customers.findStoredByPhone(dto.phone)?.id ?? null;
    }
    const customer = customerId
      ? this.customers.findStored(customerId)
      : null;

    const hasDetails = Boolean(dto.phone || dto.email || customer?.phone || customer?.email);
    let contactBasis: LeadContactBasis | null = null;
    if (customerId && dto.visitorId) {
      const session = this.visitors
        .listSessionsForVisitor(dto.visitorId)
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
      this.visitors.latestConsent(dto.visitorId, 'marketing')?.status ===
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
    this.leads.create(lead);
    if (dto.visitorId && hasDetails && !customerId) {
      this.visitors.markUnverifiedContact(dto.visitorId);
    }
    this.audit.recordForPrincipal(actor, {
      action: 'lead.created',
      entityType: 'lead',
      entityId: lead.id,
      metadata: { source: lead.source, automatic: false },
    });
    return lead;
  }

  // -- Reads -------------------------------------------------------

  list(filter: { status?: LeadStatus; assigneeId?: string }): Lead[] {
    return this.leads
      .list()
      .filter((lead) => {
        if (filter.status && lead.status !== filter.status) return false;
        if (filter.assigneeId && lead.assigneeId !== filter.assigneeId) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getLead(id: string): Lead {
    const lead = this.leads.findById(id);
    if (!lead) throw new NotFoundException(`Lead not found: ${id}`);
    return lead;
  }

  getDetail(id: string): LeadDetail {
    const lead = this.getLead(id);
    return {
      lead,
      attempts: this.leads.listAttempts(id),
      followUpTasks: this.leads.listTasks(id),
    };
  }

  // -- Pipeline ----------------------------------------------------

  assign(id: string, assigneeId: string, actor: AuthPrincipal): Lead {
    const lead = this.getLead(id);
    lead.assigneeId = assigneeId;
    lead.updatedAt = new Date().toISOString();
    this.leads.save(lead);
    this.audit.recordForPrincipal(actor, {
      action: 'lead.assigned',
      entityType: 'lead',
      entityId: lead.id,
      metadata: { assigneeId },
    });
    return lead;
  }

  transitionStatus(
    id: string,
    status: LeadStatus,
    actor: AuthPrincipal,
  ): Lead {
    const lead = this.getLead(id);
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
    this.leads.save(lead);
    this.audit.recordForPrincipal(actor, {
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
  openLeadIdsForCustomer(customerId: string): string[] {
    return this.leads
      .findOpenForCustomer(customerId)
      .map((lead) => lead.id);
  }

  /** Converts open leads for a customer after an order
   * placement. Called by checkout; the actor is the system,
   * because the customer converted themselves. Only leads that
   * existed before the order convert (the ids checkout
   * snapshotted before linking): a candidate raised by the
   * linking of this very order (a hot guest-checkout session) is
   * a follow-up lead for the next purchase, not a converted one. */
  markConvertedForCustomer(
    customerId: string,
    orderNumber: string,
    openLeadIdsBeforeOrder: ReadonlySet<string>,
  ): void {
    for (const lead of this.leads.findOpenForCustomer(customerId)) {
      if (!openLeadIdsBeforeOrder.has(lead.id)) continue;
      lead.status = 'converted';
      lead.updatedAt = new Date().toISOString();
      this.leads.save(lead);
      this.audit.record({
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

  createTask(
    leadId: string,
    dto: FollowUpTaskCreate,
    actor: AuthPrincipal,
  ): FollowUpTask {
    const lead = this.getLead(leadId);
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
    this.leads.createTask(task);
    this.audit.recordForPrincipal(actor, {
      action: 'lead.follow-up-created',
      entityType: 'lead',
      entityId: lead.id,
      metadata: { taskId: task.id },
    });
    return task;
  }

  listTasks(leadId: string): FollowUpTask[] {
    this.getLead(leadId);
    return this.leads.listTasks(leadId);
  }

  completeTask(
    leadId: string,
    taskId: string,
    actor: AuthPrincipal,
  ): FollowUpTask {
    this.getLead(leadId);
    const task = this.leads.findTask(taskId);
    if (!task || task.leadId !== leadId) {
      throw new NotFoundException(`Follow-up task not found: ${taskId}`);
    }
    if (task.status === 'completed') {
      throw new BadRequestException('Follow-up task is already completed');
    }
    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    this.leads.saveTask(task);
    this.audit.recordForPrincipal(actor, {
      action: 'lead.follow-up-completed',
      entityType: 'lead',
      entityId: leadId,
      metadata: { taskId },
    });
    return task;
  }

  // -- Contact attempts and opt-out ----------------------------------

  listAttempts(leadId: string): LeadContactAttempt[] {
    this.getLead(leadId);
    return this.leads.listAttempts(leadId);
  }

  recordContactAttempt(
    leadId: string,
    dto: ContactAttemptCreate,
    actor: AuthPrincipal,
  ): LeadContactAttempt {
    const lead = this.getLead(leadId);
    if (lead.optedOut || lead.status === 'do-not-contact') {
      throw new ForbiddenException(
        'This lead has opted out. Contact attempts are refused.',
      );
    }
    const suppressed = this.leads
      .listSuppressions()
      .some(
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
      this.visitors.latestConsent(lead.visitorId, 'marketing')?.status ===
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
    this.leads.appendAttempt(attempt);
    this.audit.recordForPrincipal(actor, {
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
      this.applyOptOut(lead, actor, 'Opt-out recorded on a contact attempt');
    }
    return attempt;
  }

  /** Records an opt-out outside a contact attempt (for example a
   * reply to a message). Same suppression effect. */
  optOut(leadId: string, actor: AuthPrincipal): Lead {
    const lead = this.getLead(leadId);
    if (lead.optedOut) return lead;
    this.applyOptOut(lead, actor, 'Opt-out recorded by staff');
    return lead;
  }

  private applyOptOut(
    lead: Lead,
    actor: AuthPrincipal | null,
    reason: string,
  ): void {
    const now = new Date().toISOString();
    lead.optedOut = true;
    lead.optedOutAt = now;
    lead.status = 'do-not-contact';
    lead.updatedAt = now;
    this.leads.save(lead);
    this.leads.appendSuppression({
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
      this.audit.recordForPrincipal(actor, input);
    } else {
      this.audit.record({ actorType: 'system', actorId: null, ...input });
    }
  }
}
