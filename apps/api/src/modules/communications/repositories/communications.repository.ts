import type {
  CommunicationChannel,
  CommunicationLog,
  CommunicationLogStatus,
} from '@dostelo/types';
import type { Tx } from '../../../prisma/prisma.service';

export interface CommunicationLogFilter {
  channel?: CommunicationChannel;
  status?: CommunicationLogStatus;
  customerId?: string;
  leadId?: string;
  abandonedCartId?: string;
}

/**
 * Communication log persistence seam (Phase 6). The Prisma
 * implementation maps to the CommunicationLog model. The log is
 * append-only: an entry is written for every send, refusal and
 * staff-logged call, and entries are never edited afterwards.
 */
export abstract class CommunicationsRepository {
  abstract append(
    entry: CommunicationLog,
    tx?: Tx,
  ): Promise<CommunicationLog>;
  abstract list(
    filter: CommunicationLogFilter,
    tx?: Tx,
  ): Promise<CommunicationLog[]>;
}
