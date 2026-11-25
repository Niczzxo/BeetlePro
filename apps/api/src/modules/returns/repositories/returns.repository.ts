import type {
  ReturnEvent,
  ReturnRequest,
  ReturnStatus,
} from '@dostelo/types';
import type { Tx } from '../../../prisma/prisma.service';

export interface ReturnFilter {
  status?: ReturnStatus;
  orderNumber?: string;
}

/**
 * Returns persistence seam. The Prisma implementation maps to
 * the ReturnRequest model, whose items column is the JSON
 * snapshot of the returned order lines.
 */
export abstract class ReturnsRepository {
  abstract create(
    request: ReturnRequest,
    tx?: Tx,
  ): Promise<ReturnRequest>;
  abstract save(request: ReturnRequest, tx?: Tx): Promise<void>;
  abstract findById(
    id: string,
    tx?: Tx,
  ): Promise<ReturnRequest | null>;
  abstract list(
    filter?: ReturnFilter,
    tx?: Tx,
  ): Promise<ReturnRequest[]>;
  /** Appends one workflow event (a transition or a staff note
   * action). Events are append-only; the timeline reads them
   * back in write order. */
  abstract appendEvent(event: ReturnEvent, tx?: Tx): Promise<void>;
  abstract listEvents(
    returnId: string,
    tx?: Tx,
  ): Promise<ReturnEvent[]>;
}
