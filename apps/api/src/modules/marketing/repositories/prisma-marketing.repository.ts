import { Injectable } from '@nestjs/common';
import type {
  Campaign as CampaignRow,
  Prisma,
} from '@prisma/client';
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
    segmentKey: row.segmentKey as Campaign['segmentKey'],
    segmentRules: row.segmentRules
      ? (row.segmentRules as unknown as Campaign['segmentRules'])
      : null,
    templateKey: row.templateKey,
    subject: row.subject,
    body: row.body,
    status: fromEnum(row.status),
    scheduledFor: row.scheduledFor ? iso(row.scheduledFor) : null,
    sentAt: row.sentAt ? iso(row.sentAt) : null,
    sendNote: row.sendNote,
    createdById: row.createdById,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toRow(campaign: Campaign) {
  return {
    name: campaign.name,
    channel: toEnum<CampaignRow['channel']>(campaign.channel),
    audienceNote: campaign.audienceNote,
    segmentKey: campaign.segmentKey,
    segmentRules: campaign.segmentRules
      ? (campaign.segmentRules as unknown as Prisma.InputJsonValue)
      : undefined,
    templateKey: campaign.templateKey,
    subject: campaign.subject,
    body: campaign.body,
    status: toEnum<CampaignRow['status']>(campaign.status),
    scheduledFor: campaign.scheduledFor
      ? date(campaign.scheduledFor)
      : null,
    sentAt: campaign.sentAt ? date(campaign.sentAt) : null,
    sendNote: campaign.sendNote,
    createdById: campaign.createdById,
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
      data: { id: campaign.id, ...toRow(campaign) },
    });
    return toDomain(row);
  }

  async save(campaign: Campaign, tx?: Tx): Promise<void> {
    await this.db(tx).campaign.update({
      where: { id: campaign.id },
      data: toRow(campaign),
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
