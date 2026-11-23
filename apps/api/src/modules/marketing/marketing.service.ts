import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  Campaign,
  CampaignChannel,
  CampaignView,
} from '@dostelo/types';
import type {
  CreateCampaign,
  UpdateCampaign,
} from '@dostelo/validation';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  emailCommConfig,
  smsCommConfig,
  whatsappCommConfig,
} from '../../config/communications.config';
import { AuditService } from '../audit/audit.service';
import { MarketingRepository } from './repositories/marketing.repository';

/** The environment variables a channel still needs before any
 * send could run, from the same config checks the communication
 * providers run. Names only, never values. */
export function channelSendingState(channel: CampaignChannel): {
  configured: boolean;
  missing: string[];
} {
  if (channel === 'whatsapp') {
    const config = whatsappCommConfig();
    const missing: string[] = [];
    if (!config.accessToken) missing.push('WHATSAPP_ACCESS_TOKEN');
    if (!config.phoneNumberId) missing.push('WHATSAPP_PHONE_NUMBER_ID');
    return { configured: config.configured, missing };
  }
  if (channel === 'email') {
    const config = emailCommConfig();
    const missing: string[] = [];
    if (!config.apiKey) missing.push('EMAIL_PROVIDER_API_KEY');
    if (!config.apiUrl) missing.push('EMAIL_PROVIDER_API_URL');
    if (!config.fromAddress) missing.push('EMAIL_FROM');
    return { configured: config.configured, missing };
  }
  const config = smsCommConfig();
  const missing: string[] = [];
  if (!config.apiKey) missing.push('SMS_API_KEY');
  if (!config.apiUrl) missing.push('SMS_API_URL');
  if (!config.senderId) missing.push('SMS_SENDER_ID');
  return { configured: config.configured, missing };
}

/**
 * Marketing campaigns (admin master structure module 13). A
 * campaign is a record with draft, scheduled and cancelled
 * states. Sending is deliberately not a state: no audience
 * resolution tooling exists, and a channel whose provider is
 * unconfigured cannot send at all, so the view carries the
 * channel's live send-readiness instead of a send button that
 * would pretend.
 */
@Injectable()
export class MarketingService {
  constructor(
    private readonly marketing: MarketingRepository,
    @Optional() private readonly audit?: AuditService,
  ) {}

  private toView(campaign: Campaign): CampaignView {
    return { ...campaign, sending: channelSendingState(campaign.channel) };
  }

  async create(
    dto: CreateCampaign,
    actor?: AuthPrincipal | null,
  ): Promise<CampaignView> {
    if (
      dto.scheduledFor &&
      new Date(dto.scheduledFor).getTime() <= Date.now()
    ) {
      throw new BadRequestException('scheduledFor must be in the future');
    }
    const now = new Date().toISOString();
    const campaign: Campaign = {
      id: randomUUID(),
      name: dto.name,
      channel: dto.channel,
      audienceNote: dto.audienceNote,
      status: dto.scheduledFor ? 'scheduled' : 'draft',
      scheduledFor: dto.scheduledFor ?? null,
      createdById: actor?.id ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await this.marketing.create(campaign);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'campaign.created',
        entityType: 'campaign',
        entityId: campaign.id,
        metadata: { channel: campaign.channel, status: campaign.status },
      });
    }
    return this.toView(campaign);
  }

  async list(filter?: {
    status?: Campaign['status'];
  }): Promise<CampaignView[]> {
    const campaigns = await this.marketing.list(filter);
    return campaigns.map((campaign) => this.toView(campaign));
  }

  async getById(id: string): Promise<CampaignView> {
    return this.toView(await this.requireCampaign(id));
  }

  async update(
    id: string,
    dto: UpdateCampaign,
    actor?: AuthPrincipal | null,
  ): Promise<CampaignView> {
    const campaign = await this.requireCampaign(id);
    if (campaign.status === 'cancelled' && dto.status !== undefined && dto.status !== 'cancelled') {
      throw new BadRequestException(
        `Campaign ${id} is cancelled and cannot be reopened`,
      );
    }
    if (dto.name !== undefined) campaign.name = dto.name;
    if (dto.audienceNote !== undefined) {
      campaign.audienceNote = dto.audienceNote;
    }
    if (dto.scheduledFor !== undefined) {
      if (
        dto.scheduledFor &&
        new Date(dto.scheduledFor).getTime() <= Date.now()
      ) {
        throw new BadRequestException('scheduledFor must be in the future');
      }
      campaign.scheduledFor = dto.scheduledFor;
    }
    if (dto.status !== undefined) {
      if (dto.status === 'scheduled' && !campaign.scheduledFor) {
        throw new BadRequestException(
          'A scheduled campaign needs a scheduledFor time',
        );
      }
      campaign.status = dto.status;
    }
    campaign.updatedAt = new Date().toISOString();
    await this.marketing.save(campaign);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'campaign.updated',
        entityType: 'campaign',
        entityId: campaign.id,
        metadata: { status: campaign.status },
      });
    }
    return this.toView(campaign);
  }

  private async requireCampaign(id: string): Promise<Campaign> {
    const campaign = await this.marketing.findById(id);
    if (!campaign) {
      throw new NotFoundException(`Campaign not found: ${id}`);
    }
    return campaign;
  }
}
