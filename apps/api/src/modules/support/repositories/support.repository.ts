import type {
  SupportTicket,
  SupportTicketMessage,
  SupportTicketStatus,
} from '@dostelo/types';
import type { Tx } from '../../../prisma/prisma.service';

export interface SupportTicketFilter {
  status?: SupportTicketStatus;
  customerId?: string;
  assignedToId?: string;
}

/**
 * Support persistence seam: tickets plus their message log. The
 * Prisma implementation maps to SupportTicket and
 * SupportTicketMessage.
 */
export abstract class SupportRepository {
  abstract create(
    ticket: SupportTicket,
    tx?: Tx,
  ): Promise<SupportTicket>;
  abstract save(ticket: SupportTicket, tx?: Tx): Promise<void>;
  abstract findById(
    id: string,
    tx?: Tx,
  ): Promise<SupportTicket | null>;
  abstract list(
    filter?: SupportTicketFilter,
    tx?: Tx,
  ): Promise<SupportTicket[]>;
  abstract addMessage(
    message: SupportTicketMessage,
    tx?: Tx,
  ): Promise<void>;
  abstract listMessages(
    ticketId: string,
    tx?: Tx,
  ): Promise<SupportTicketMessage[]>;
}
