import { Injectable } from '@nestjs/common';
import type { Campaign as CampaignRow } from '@prisma/client';
import type { Campaign, CampaignStatus } from '@dostelo/types';
import {
  fromEnum,
  iso,
  toEnum,
  date,
} from '../../../prisma/prisma.helpers';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import { MarketingRepository } from './marketing.repository';

function toDomain(row: CampaignRow): Campaign {
  return {
    id: row.id,
    name: row.name,
    channel: fromEnum(row.channel),
    audienceNote: row.audienceNote,
    status: fromEnum(row.status),
    scheduledFor: row.scheduledFor ? iso(row.scheduledFor) : null,
    createdById: row.createdById,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

/** Prisma marketing repository over the Campaign model. */
@Injectable()
export class PrismaMarketingRepository extends MarketingRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma.client;
  }

  async create(campaign: Campaign, tx?: Tx): Promise<Campaign> {
    const row = await this.db(tx).campaign.create({
      data: {
        id: campaign.id,
        name: campaign.name,
        channel: toEnum<CampaignRow['channel']>(campaign.channel),
        audienceNote: campaign.audienceNote,
        status: toEnum<CampaignRow['status']>(campaign.status),
        scheduledFor: campaign.scheduledFor
          ? date(campaign.scheduledFor)
          : null,
        createdById: campaign.createdById,
      },
    });
    return toDomain(row);
  }

  async save(campaign: Campaign, tx?: Tx): Promise<void> {
    await this.db(tx).campaign.update({
      where: { id: campaign.id },
      data: {
        name: campaign.name,
        channel: toEnum<CampaignRow['channel']>(campaign.channel),
        audienceNote: campaign.audienceNote,
        status: toEnum<CampaignRow['status']>(campaign.status),
        scheduledFor: campaign.scheduledFor
          ? date(campaign.scheduledFor)
          : null,
        createdById: campaign.createdById,
      },
    });
  }

  async findById(id: string, tx?: Tx): Promise<Campaign | null> {
    const row = await this.db(tx).campaign.findUnique({
      where: { id },
    });
    return row ? toDomain(row) : null;
  }

  async list(
    filter?: { status?: CampaignStatus },
    tx?: Tx,
  ): Promise<Campaign[]> {
    const rows = await this.db(tx).campaign.findMany({
      where: {
        status: filter?.status ? toEnum<CampaignRow['status']>(filter.status) : undefined,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toDomain);
  }
}
