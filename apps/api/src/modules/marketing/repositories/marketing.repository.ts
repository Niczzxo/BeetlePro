import type { Campaign, CampaignStatus } from '@dostelo/types';
import type { Tx } from '../../../prisma/prisma.service';

/** Marketing persistence seam, over the Campaign model in the
 * Prisma implementation. */
export abstract class MarketingRepository {
  abstract create(campaign: Campaign, tx?: Tx): Promise<Campaign>;
  abstract save(campaign: Campaign, tx?: Tx): Promise<void>;
  abstract findById(id: string, tx?: Tx): Promise<Campaign | null>;
  abstract list(
    filter?: { status?: CampaignStatus },
    tx?: Tx,
  ): Promise<Campaign[]>;
}
