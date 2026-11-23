import { Injectable } from '@nestjs/common';
import type {
  SupportTicket,
  SupportTicketMessage,
} from '@dostelo/types';
import { InMemoryDatabase } from '../../../store/in-memory.store';
import {
  SupportRepository,
  type SupportTicketFilter,
} from './support.repository';

@Injectable()
export class InMemorySupportRepository extends SupportRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async create(ticket: SupportTicket): Promise<SupportTicket> {
    this.db.supportTickets.set(ticket.id, ticket);
    return ticket;
  }

  async save(ticket: SupportTicket): Promise<void> {
    this.db.supportTickets.set(ticket.id, ticket);
  }

  async findById(id: string): Promise<SupportTicket | null> {
    return this.db.supportTickets.get(id) ?? null;
  }

  async list(filter?: SupportTicketFilter): Promise<SupportTicket[]> {
    return [...this.db.supportTickets.values()]
      .filter(
        (ticket) =>
          (!filter?.status || ticket.status === filter.status) &&
          (!filter?.customerId || ticket.customerId === filter.customerId) &&
          (!filter?.assignedToId ||
            ticket.assignedToId === filter.assignedToId),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async addMessage(message: SupportTicketMessage): Promise<void> {
    this.db.supportTicketMessages.push(message);
  }

  async listMessages(ticketId: string): Promise<SupportTicketMessage[]> {
    return this.db.supportTicketMessages
      .filter((message) => message.ticketId === ticketId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}
