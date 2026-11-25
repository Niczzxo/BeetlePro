import { Injectable } from '@nestjs/common';
import type { CommunicationLog } from '@dostelo/types';
import { InMemoryDatabase } from '../../../store/in-memory.store';
import {
  CommunicationsRepository,
  type CommunicationLogFilter,
} from './communications.repository';

@Injectable()
export class InMemoryCommunicationsRepository extends CommunicationsRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async append(entry: CommunicationLog): Promise<CommunicationLog> {
    this.db.communicationLogs.push(entry);
    return entry;
  }

  async list(filter: CommunicationLogFilter): Promise<CommunicationLog[]> {
    return this.db.communicationLogs
      .filter((entry) => {
        if (filter.channel && entry.channel !== filter.channel) {
          return false;
        }
        if (filter.status && entry.status !== filter.status) {
          return false;
        }
        if (filter.customerId && entry.customerId !== filter.customerId) {
          return false;
        }
        if (filter.leadId && entry.leadId !== filter.leadId) {
          return false;
        }
        if (
          filter.abandonedCartId &&
          entry.abandonedCartId !== filter.abandonedCartId
        ) {
          return false;
        }
        if (filter.campaignId && entry.campaignId !== filter.campaignId) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
