import { Injectable } from '@nestjs/common';
import type { Campaign, CampaignStatus } from '@dostelo/types';
import { InMemoryDatabase } from '../../../store/in-memory.store';
import { MarketingRepository } from './marketing.repository';

@Injectable()
export class InMemoryMarketingRepository extends MarketingRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async create(campaign: Campaign): Promise<Campaign> {
    this.db.campaigns.set(campaign.id, campaign);
    return campaign;
  }

  async save(campaign: Campaign): Promise<void> {
    this.db.campaigns.set(campaign.id, campaign);
  }

  async findById(id: string): Promise<Campaign | null> {
    return this.db.campaigns.get(id) ?? null;
  }

  async list(filter?: {
    status?: CampaignStatus;
  }): Promise<Campaign[]> {
    return [...this.db.campaigns.values()]
      .filter((campaign) => !filter?.status || campaign.status === filter.status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
