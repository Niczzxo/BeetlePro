import { Injectable } from '@nestjs/common';
import type {
  SupportTicket as TicketRow,
  SupportTicketMessage as MessageRow,
} from '@prisma/client';
import type {
  SupportTicket,
  SupportTicketMessage,
} from '@dostelo/types';
import {
  fromEnum,
  iso,
  toEnum,
} from '../../../prisma/prisma.helpers';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import {
  SupportRepository,
  type SupportTicketFilter,
} from './support.repository';

function toTicket(row: TicketRow): SupportTicket {
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    customerEmail: row.customerEmail,
    subject: row.subject,
    category: row.category,
    priority: fromEnum(row.priority),
    status: fromEnum(row.status),
    assignedToId: row.assignedToId,
    orderNumber: row.orderNumber,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toMessage(row: MessageRow): SupportTicketMessage {
  return {
    id: row.id,
    ticketId: row.ticketId,
    authorType: row.authorType as SupportTicketMessage['authorType'],
    authorId: row.authorId,
    authorName: row.authorName,
    body: row.body,
    internal: row.internal,
    createdAt: iso(row.createdAt),
  };
}

/** Prisma support repository over SupportTicket and
 * SupportTicketMessage. */
@Injectable()
export class PrismaSupportRepository extends SupportRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma.client;
  }

  async create(
    ticket: SupportTicket,
    tx?: Tx,
  ): Promise<SupportTicket> {
    const row = await this.db(tx).supportTicket.create({
      data: {
        id: ticket.id,
        customerId: ticket.customerId,
        customerName: ticket.customerName,
        customerPhone: ticket.customerPhone,
        customerEmail: ticket.customerEmail,
        subject: ticket.subject,
        category: ticket.category,
        priority: toEnum<TicketRow['priority']>(ticket.priority),
        status: toEnum<TicketRow['status']>(ticket.status),
        assignedToId: ticket.assignedToId,
        orderNumber: ticket.orderNumber,
      },
    });
    return toTicket(row);
  }

  async save(ticket: SupportTicket, tx?: Tx): Promise<void> {
    await this.db(tx).supportTicket.update({
      where: { id: ticket.id },
      data: {
        customerId: ticket.customerId,
        customerName: ticket.customerName,
        customerPhone: ticket.customerPhone,
        customerEmail: ticket.customerEmail,
        subject: ticket.subject,
        category: ticket.category,
        priority: toEnum<TicketRow['priority']>(ticket.priority),
        status: toEnum<TicketRow['status']>(ticket.status),
        assignedToId: ticket.assignedToId,
        orderNumber: ticket.orderNumber,
      },
    });
  }

  async findById(
    id: string,
    tx?: Tx,
  ): Promise<SupportTicket | null> {
    const row = await this.db(tx).supportTicket.findUnique({
      where: { id },
    });
    return row ? toTicket(row) : null;
  }

  async list(
    filter?: SupportTicketFilter,
    tx?: Tx,
  ): Promise<SupportTicket[]> {
    const rows = await this.db(tx).supportTicket.findMany({
      where: {
        status: filter?.status ? toEnum<TicketRow['status']>(filter.status) : undefined,
        customerId: filter?.customerId,
        assignedToId: filter?.assignedToId,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toTicket);
  }

  async addMessage(
    message: SupportTicketMessage,
    tx?: Tx,
  ): Promise<void> {
    await this.db(tx).supportTicketMessage.create({
      data: {
        id: message.id,
        ticketId: message.ticketId,
        authorType: message.authorType,
        authorId: message.authorId,
        authorName: message.authorName,
        body: message.body,
        internal: message.internal,
      },
    });
  }

  async listMessages(
    ticketId: string,
    tx?: Tx,
  ): Promise<SupportTicketMessage[]> {
    const rows = await this.db(tx).supportTicketMessage.findMany({
      where: { ticketId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toMessage);
  }
}
