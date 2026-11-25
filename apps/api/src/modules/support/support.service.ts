import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  SUPPORT_TICKET_TRANSITIONS,
  type SupportTicket,
  type SupportTicketDetail,
  type SupportTicketMessage,
} from '@dostelo/types';
import type {
  CreateSupportTicket,
  SupportTicketReply,
  SupportTicketStatusUpdate,
} from '@dostelo/validation';
import type { AuthPrincipal } from '../../common/auth/principal';
import { AuditService } from '../audit/audit.service';
import { CustomersRepository } from '../customers/repositories/customers.repository';
import {
  SupportRepository,
  type SupportTicketFilter,
} from './repositories/support.repository';

/**
 * Customer support (admin master structure module 15). Tickets
 * are staff-created: the migrated storefront's contact view does
 * not submit to the API, so no customer-side intake exists and
 * none is claimed. The opening message records the customer's
 * words as staff received them (phone, in person, or another
 * channel), and replies and internal notes share one log.
 */
@Injectable()
export class SupportService {
  constructor(
    private readonly support: SupportRepository,
    private readonly customers: CustomersRepository,
    @Optional() private readonly audit?: AuditService,
  ) {}

  async create(
    dto: CreateSupportTicket,
    actor?: AuthPrincipal | null,
  ): Promise<SupportTicketDetail> {
    if (dto.customerId) {
      const customer = await this.customers.findById(dto.customerId);
      if (!customer) {
        throw new BadRequestException(
          `Unknown customer: ${dto.customerId}`,
        );
      }
    }
    const now = new Date().toISOString();
    const ticket: SupportTicket = {
      id: randomUUID(),
      customerId: dto.customerId ?? null,
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      customerEmail: dto.customerEmail ?? null,
      subject: dto.subject,
      category: dto.category ?? null,
      priority: dto.priority ?? 'normal',
      status: 'open',
      assignedToId: null,
      orderNumber: dto.orderNumber ?? null,
      channel: dto.channel ?? 'admin',
      firstRespondedAt: null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.support.create(ticket);
    const opening: SupportTicketMessage = {
      id: randomUUID(),
      ticketId: ticket.id,
      authorType: 'customer',
      authorId: dto.customerId ?? null,
      authorName: dto.customerName,
      body: dto.message,
      internal: false,
      createdAt: now,
    };
    await this.support.addMessage(opening);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'support.ticket-created',
        entityType: 'support-ticket',
        entityId: ticket.id,
        metadata: {
          subject: ticket.subject,
          customerId: ticket.customerId,
          orderNumber: ticket.orderNumber,
        },
      });
    }
    return { ...ticket, messages: [opening] };
  }

  async list(filter?: SupportTicketFilter): Promise<SupportTicket[]> {
    return this.support.list(filter);
  }

  async getDetail(id: string): Promise<SupportTicketDetail> {
    const ticket = await this.requireTicket(id);
    const messages = await this.support.listMessages(id);
    return { ...ticket, messages };
  }

  async reply(
    id: string,
    dto: SupportTicketReply,
    actor?: AuthPrincipal | null,
  ): Promise<SupportTicketDetail> {
    const ticket = await this.requireTicket(id);
    if (ticket.status === 'closed') {
      throw new BadRequestException(
        `Ticket ${id} is closed; reopen it by setting its status first`,
      );
    }
    const now = new Date().toISOString();
    const message: SupportTicketMessage = {
      id: randomUUID(),
      ticketId: ticket.id,
      authorType: 'staff',
      authorId: actor?.id ?? null,
      authorName: actor?.name ?? 'Staff',
      body: dto.body,
      internal: dto.internal ?? false,
      createdAt: now,
    };
    await this.support.addMessage(message);
    // The first customer-facing staff reply starts the SLA
    // first-response clock stop.
    if (!message.internal && !ticket.firstRespondedAt) {
      ticket.firstRespondedAt = now;
    }
    // A customer-facing reply on an open ticket moves it to
    // pending (waiting on the customer); internal notes do not.
    if (!message.internal && ticket.status === 'open') {
      ticket.status = 'pending';
    }
    ticket.updatedAt = now;
    await this.support.save(ticket);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: message.internal
          ? 'support.ticket-note'
          : 'support.ticket-reply',
        entityType: 'support-ticket',
        entityId: ticket.id,
        metadata: { internal: message.internal },
      });
    }
    return this.getDetail(id);
  }

  async setStatus(
    id: string,
    dto: SupportTicketStatusUpdate,
    actor?: AuthPrincipal | null,
  ): Promise<SupportTicket> {
    const ticket = await this.requireTicket(id);
    const allowed = SUPPORT_TICKET_TRANSITIONS[ticket.status];
    if (ticket.status !== dto.status && !allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Ticket ${id} cannot move from ${ticket.status} to ${dto.status}`,
      );
    }
    ticket.status = dto.status;
    if (dto.status === 'resolved' && !ticket.resolvedAt) {
      ticket.resolvedAt = new Date().toISOString();
    }
    if (dto.status === 'open' || dto.status === 'in-progress') {
      ticket.resolvedAt = null;
    }
    ticket.updatedAt = new Date().toISOString();
    await this.support.save(ticket);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'support.ticket-status',
        entityType: 'support-ticket',
        entityId: ticket.id,
        metadata: { status: dto.status },
      });
    }
    return ticket;
  }

  async assign(
    id: string,
    assignedToId: string | null,
    actor?: AuthPrincipal | null,
  ): Promise<SupportTicket> {
    const ticket = await this.requireTicket(id);
    ticket.assignedToId = assignedToId;
    ticket.updatedAt = new Date().toISOString();
    await this.support.save(ticket);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'support.ticket-assigned',
        entityType: 'support-ticket',
        entityId: ticket.id,
        metadata: { assignedToId },
      });
    }
    return ticket;
  }

  private async requireTicket(id: string): Promise<SupportTicket> {
    const ticket = await this.support.findById(id);
    if (!ticket) {
      throw new NotFoundException(`Support ticket not found: ${id}`);
    }
    return ticket;
  }
}
