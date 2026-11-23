import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  Customer,
  CustomerNote,
  IdentityStatus,
  Order,
  VisitorEventType,
} from '@dostelo/types';
import type { AuthPrincipal } from '../../common/auth/principal';
import { AuditService } from '../audit/audit.service';
import { computeLeadScore } from '../buyer-intelligence/lead-score';
import { CustomersService } from '../customers/customers.service';
import { CustomersRepository } from '../customers/repositories/customers.repository';
import { OrdersRepository } from '../orders/repositories/orders.repository';
import { VisitorsService } from '../visitors/visitors.service';
import { CrmRepository } from './repositories/crm.repository';

/** The visitor side of a customer timeline: only sessions and
 * events that were linked to this customer through an
 * authenticated or consented flow ever appear here. */
export interface CustomerVisitorSummary {
  sessionCount: number;
  identityStatuses: IdentityStatus[];
  eventCount: number;
  eventCounts: Partial<Record<VisitorEventType, number>>;
  lastActivityAt: string | null;
  /** Best lead score across the customer's linked sessions. A
   * behavioural signal, shown next to the recorded identity. */
  bestLeadScore: number;
}

export interface CustomerTimeline {
  customer: Customer;
  orders: Order[];
  visitor: CustomerVisitorSummary;
  notes: CustomerNote[];
  tags: string[];
}

@Injectable()
export class CrmService {
  constructor(
    private readonly crm: CrmRepository,
    private readonly customers: CustomersService,
    private readonly customersRepo: CustomersRepository,
    private readonly orders: OrdersRepository,
    private readonly visitors: VisitorsService,
    private readonly audit: AuditService,
  ) {}

  getTimeline(customerId: string): CustomerTimeline {
    const customer = this.customers.getProfile(customerId);
    const orders = this.orders
      .listByCustomer(customerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const sessions = this.visitors.listSessionsForCustomer(customerId);
    const events = this.visitors.listEventsForCustomer(customerId);

    const eventCounts: Partial<Record<VisitorEventType, number>> = {};
    let maxCartValueMinor = 0;
    for (const event of events) {
      eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
      const value = event.payload?.['cartValueMinor'];
      if (typeof value === 'number' && value > maxCartValueMinor) {
        maxCartValueMinor = value;
      }
    }
    const lastActivityAt =
      sessions.length > 0
        ? sessions
            .map((session) => session.lastSeenAt)
            .sort()
            .at(-1) ?? null
        : null;
    const bestLeadScore =
      sessions.length > 0
        ? Math.max(
            ...sessions.map(
              (session) =>
                computeLeadScore({
                  lastActivityAt: session.lastSeenAt,
                  eventCounts: this.countsForSession(session.id),
                  maxCartValueMinor,
                  visitorSessionCount: this.visitors.listSessionsForVisitor(
                    session.visitorId,
                  ).length,
                }).score,
            ),
          )
        : 0;

    return {
      customer,
      orders,
      visitor: {
        sessionCount: sessions.length,
        identityStatuses: [
          ...new Set(sessions.map((session) => session.identityStatus)),
        ],
        eventCount: events.length,
        eventCounts,
        lastActivityAt,
        bestLeadScore,
      },
      notes: this.crm.listNotes(customerId),
      tags: customer.tags,
    };
  }

  private countsForSession(
    sessionId: string,
  ): Partial<Record<VisitorEventType, number>> {
    const counts: Partial<Record<VisitorEventType, number>> = {};
    for (const event of this.visitors.listEventsForSession(sessionId)) {
      counts[event.type] = (counts[event.type] ?? 0) + 1;
    }
    return counts;
  }

  addNote(
    customerId: string,
    body: string,
    actor: AuthPrincipal,
  ): CustomerNote {
    this.customers.findStored(customerId);
    const note: CustomerNote = {
      id: randomUUID(),
      customerId,
      body,
      authorId: actor.id,
      createdAt: new Date().toISOString(),
    };
    this.crm.appendNote(note);
    this.audit.recordForPrincipal(actor, {
      action: 'customer.note-added',
      entityType: 'customer',
      entityId: customerId,
      metadata: { noteId: note.id },
    });
    return note;
  }

  addTag(customerId: string, tag: string, actor: AuthPrincipal): string[] {
    const customer = this.customers.findStored(customerId);
    const normalized = tag.trim();
    if (!normalized) throw new BadRequestException('Tag is empty');
    if (!customer.tags.includes(normalized)) {
      customer.tags = [...customer.tags, normalized];
      customer.updatedAt = new Date().toISOString();
      this.customersRepo.save(customer);
      this.audit.recordForPrincipal(actor, {
        action: 'customer.tag-added',
        entityType: 'customer',
        entityId: customerId,
        metadata: { tag: normalized },
      });
    }
    return customer.tags;
  }

  removeTag(
    customerId: string,
    tag: string,
    actor: AuthPrincipal,
  ): string[] {
    const customer = this.customers.findStored(customerId);
    if (!customer.tags.includes(tag)) {
      throw new NotFoundException(
        `Tag not present on customer: ${tag}`,
      );
    }
    customer.tags = customer.tags.filter((item) => item !== tag);
    customer.updatedAt = new Date().toISOString();
    this.customersRepo.save(customer);
    this.audit.recordForPrincipal(actor, {
      action: 'customer.tag-removed',
      entityType: 'customer',
      entityId: customerId,
      metadata: { tag },
    });
    return customer.tags;
  }
}
