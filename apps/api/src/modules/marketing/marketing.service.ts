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
  CampaignSegment,
  CampaignStats,
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
import type { StoredCustomer } from '../../store/in-memory.store';
import { AuditService } from '../audit/audit.service';
import { BuyerIntelligenceService } from '../buyer-intelligence/buyer-intelligence.service';
import { CartRecoveryRepository } from '../cart-recovery/repositories/cart-recovery.repository';
import { CommunicationsService } from '../communications/communications.service';
import { CustomersRepository } from '../customers/repositories/customers.repository';
import { LeadsRepository } from '../leads/repositories/leads.repository';
import { MarketingRepository } from './repositories/marketing.repository';

/** One resolved campaign recipient: an address for the channel
 * plus the records the send path needs for suppression and
 * consent checks. */
export interface CampaignRecipient {
  to: string;
  customerId: string | null;
  leadId: string | null;
  abandonedCartId: string | null;
  firstName: string;
}

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
 * campaign names a channel, a message (a template from the
 * shared store, or its own subject and body) and an audience
 * segment that resolves from stored records: customers, leads,
 * buyer sessions and abandoned carts. Sending executes through
 * the CommunicationsService, one recorded log entry per
 * recipient, so suppression, consent and provider honesty are
 * the same rules as every other send in the platform. A channel
 * whose provider is unconfigured records not-configured per
 * recipient and the campaign ends failed, never successful.
 */
@Injectable()
export class MarketingService {
  constructor(
    private readonly marketing: MarketingRepository,
    @Optional() private readonly audit?: AuditService,
    @Optional() private readonly customers?: CustomersRepository,
    @Optional() private readonly leads?: LeadsRepository,
    @Optional() private readonly recovery?: CartRecoveryRepository,
    @Optional() private readonly intelligence?: BuyerIntelligenceService,
    @Optional() private readonly communications?: CommunicationsService,
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
      segmentKey: dto.segmentKey ?? 'all-customers',
      segmentRules: dto.segmentRules ?? null,
      templateKey: dto.templateKey ?? null,
      subject: dto.subject ?? null,
      body: dto.body ?? null,
      status: dto.scheduledFor ? 'scheduled' : 'draft',
      scheduledFor: dto.scheduledFor ?? null,
      sentAt: null,
      sendNote: null,
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
    if (campaign.sentAt) {
      const editable: (keyof UpdateCampaign)[] = ['status'];
      const attempted = (Object.keys(dto) as (keyof UpdateCampaign)[]).filter(
        (key) => dto[key] !== undefined && !editable.includes(key),
      );
      if (attempted.length > 0) {
        throw new BadRequestException(
          `Campaign ${id} has already been sent; only its status can change (archive it)`,
        );
      }
      if (dto.status !== undefined && dto.status !== 'archived') {
        throw new BadRequestException(
          `A sent campaign can only be archived, not moved to ${dto.status}`,
        );
      }
    }
    if (dto.segmentKey !== undefined) campaign.segmentKey = dto.segmentKey;
    if (dto.segmentRules !== undefined) {
      campaign.segmentRules = dto.segmentRules;
    }
    if (dto.templateKey !== undefined) campaign.templateKey = dto.templateKey;
    if (dto.subject !== undefined) campaign.subject = dto.subject;
    if (dto.body !== undefined) campaign.body = dto.body;
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

  /** The address a channel uses for a customer record. */
  private addressFor(
    channel: CampaignChannel,
    customer: StoredCustomer,
  ): string | null {
    if (channel === 'email') return customer.email;
    return customer.phone;
  }

  /**
   * Resolve a campaign's audience segment to deduplicated
   * recipients. Runs at review time (to show the size) and again
   * at send time, so eligibility is always current. The
   * abandoned-cart segment deliberately covers only carts whose
   * recovery sequence has closed (status closed, not recovered):
   * carts that are detected or in recovery belong to the live
   * recovery automation and must never be double-messaged.
   */
  async resolveAudience(
    campaign: Pick<Campaign, 'channel' | 'segmentKey' | 'segmentRules'>,
  ): Promise<CampaignRecipient[]> {
    if (!this.customers || !this.leads || !this.recovery || !this.intelligence) {
      throw new BadRequestException(
        'Audience resolution is not available in this service configuration',
      );
    }
    const channel = campaign.channel;
    const byAddress = new Map<string, CampaignRecipient>();
    const add = (recipient: CampaignRecipient) => {
      if (!recipient.to) return;
      if (!byAddress.has(recipient.to)) byAddress.set(recipient.to, recipient);
    };
    const addCustomer = (customer: StoredCustomer) => {
      const to = this.addressFor(channel, customer);
      if (!to) return;
      add({
        to,
        customerId: customer.id,
        leadId: null,
        abandonedCartId: null,
        firstName: customer.fullName.split(' ')[0] ?? customer.fullName,
      });
    };
    const all = await this.customers.list();
    const key = campaign.segmentKey;
    if (key === 'high-intent-leads') {
      const leads = await this.leads.list();
      for (const lead of leads) {
        if ((lead.score ?? 0) < 70 || lead.optedOut || !lead.contactBasis) continue;
        const to = channel === 'email' ? lead.email : lead.phone;
        if (!to) continue;
        add({
          to,
          customerId: lead.customerId,
          leadId: lead.id,
          abandonedCartId: null,
          firstName:
            (lead.fullName ?? '').split(' ')[0] || 'there',
        });
      }
      return [...byAddress.values()];
    }
    if (key === 'wishlist-users') {
      const sessions = await this.intelligence.listSessions({});
      const ids = new Set<string>();
      for (const session of sessions) {
        if ((session.eventCounts['wishlist-add'] ?? 0) > 0 && session.customerId) {
          ids.add(session.customerId);
        }
      }
      for (const customer of all) {
        if (ids.has(customer.id)) addCustomer(customer);
      }
      return [...byAddress.values()];
    }
    if (key === 'abandoned-cart-customers') {
      const carts = await this.recovery.list();
      const customerIds = new Set<string>();
      for (const cart of carts) {
        if (cart.status !== 'closed') continue;
        if (!cart.customerId) continue;
        customerIds.add(cart.customerId);
        const to =
          channel === 'email' ? cart.contactEmail : cart.contactPhone;
        if (to) {
          add({
            to,
            customerId: cart.customerId,
            leadId: null,
            abandonedCartId: cart.id,
            firstName: (cart.contactName ?? '').split(' ')[0] || 'there',
          });
        }
      }
      for (const customer of all) {
        if (customerIds.has(customer.id)) addCustomer(customer);
      }
      return [...byAddress.values()];
    }
    const now = Date.now();
    for (const customer of all) {
      let match = false;
      switch (key) {
        case 'all-customers':
          match = true;
          break;
        case 'registered-customers':
          match = customer.userId !== null;
          break;
        case 'previous-buyers':
          match = customer.orderCount > 0;
          break;
        case 'new-customers':
          match =
            now - new Date(customer.createdAt).getTime() <=
            30 * 24 * 60 * 60 * 1000;
          break;
        case 'custom': {
          const rules = campaign.segmentRules ?? {};
          match = true;
          if (rules.minOrders !== undefined && customer.orderCount < rules.minOrders) match = false;
          if (rules.minSpendMinor !== undefined && customer.lifetimeValueMinor < rules.minSpendMinor) match = false;
          if (rules.registeredWithinDays !== undefined) {
            const age = now - new Date(customer.createdAt).getTime();
            if (age > rules.registeredWithinDays * 24 * 60 * 60 * 1000) match = false;
          }
          if (rules.tag !== undefined && !customer.tags.includes(rules.tag)) match = false;
          break;
        }
        default:
          match = false;
      }
      if (match) addCustomer(customer);
    }
    return [...byAddress.values()];
  }

  /** Computed audience size per segment for a channel. */
  async listSegments(
    channel: CampaignChannel,
  ): Promise<{ key: CampaignSegment; size: number }[]> {
    const keys: CampaignSegment[] = [
      'all-customers',
      'registered-customers',
      'previous-buyers',
      'new-customers',
      'wishlist-users',
      'abandoned-cart-customers',
      'high-intent-leads',
    ];
    const out: { key: CampaignSegment; size: number }[] = [];
    for (const key of keys) {
      const recipients = await this.resolveAudience({
        channel,
        segmentKey: key,
        segmentRules: null,
      });
      out.push({ key, size: recipients.length });
    }
    return out;
  }

  /**
   * Send a campaign now through the communications path. The
   * audience is re-resolved at send time; every recipient gets
   * one recorded log entry carrying the campaign id. The final
   * status follows the recorded outcomes: completed only when at
   * least one message was actually sent and none failed to send,
   * partially-failed when some sent and some did not, failed
   * when none sent (including an empty eligible audience).
   */
  async sendCampaign(
    id: string,
    actor?: AuthPrincipal | null,
  ): Promise<CampaignView> {
    const campaign = await this.requireCampaign(id);
    if (!this.communications) {
      throw new BadRequestException(
        'Campaign sending is not available in this service configuration',
      );
    }
    if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
      throw new BadRequestException(
        `Campaign ${id} cannot be sent from status ${campaign.status}`,
      );
    }
    if (!campaign.templateKey && !campaign.body) {
      throw new BadRequestException(
        'The campaign has no message: set a template or a body before sending',
      );
    }
    campaign.status = 'sending';
    campaign.updatedAt = new Date().toISOString();
    await this.marketing.save(campaign);
    const recipients = await this.resolveAudience(campaign);
    let sent = 0;
    let notSent = 0;
    for (const recipient of recipients) {
      const entry = await this.communications.send({
        channel: campaign.channel,
        to: recipient.to,
        customerId: recipient.customerId,
        leadId: recipient.leadId,
        abandonedCartId: recipient.abandonedCartId,
        campaignId: campaign.id,
        templateKey: campaign.templateKey ?? undefined,
        subject: campaign.subject ?? undefined,
        body: campaign.body ?? undefined,
        purpose: 'campaign',
        staffId: actor?.id ?? null,
        variables: {
          firstName: recipient.firstName,
          customer_name: recipient.firstName,
        },
      });
      if (entry.status === 'sent') sent += 1;
      else notSent += 1;
    }
    campaign.sentAt = new Date().toISOString();
    campaign.sendNote =
      recipients.length === 0
        ? 'No eligible recipients at send time; the audience resolved to zero addresses.'
        : `${sent} sent, ${notSent} not sent of ${recipients.length} recipients.`;
    campaign.status =
      sent > 0 && notSent === 0
        ? 'completed'
        : sent > 0
          ? 'partially-failed'
          : 'failed';
    campaign.updatedAt = new Date().toISOString();
    await this.marketing.save(campaign);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'campaign.sent',
        entityType: 'campaign',
        entityId: campaign.id,
        metadata: { status: campaign.status, sent, notSent },
      });
    }
    return this.toView(campaign);
  }

  /** Delivery statistics from the campaign's recorded log entries. */
  async getStats(id: string): Promise<CampaignStats> {
    const campaign = await this.requireCampaign(id);
    if (!this.communications) {
      return {
        campaignId: campaign.id,
        recipients: 0,
        sent: 0,
        notConfigured: 0,
        failed: 0,
        refused: 0,
        failures: [],
      };
    }
    const entries = await this.communications.listLog({ campaignId: id });
    const stats: CampaignStats = {
      campaignId: id,
      recipients: entries.length,
      sent: 0,
      notConfigured: 0,
      failed: 0,
      refused: 0,
      failures: [],
    };
    for (const entry of entries) {
      if (entry.status === 'sent') stats.sent += 1;
      else if (entry.status === 'not-configured') stats.notConfigured += 1;
      else if (entry.status === 'failed') stats.failed += 1;
      else if (entry.status.startsWith('refused')) stats.refused += 1;
      if (entry.status !== 'sent') {
        stats.failures.push({
          toAddress: entry.toAddress,
          status: entry.status,
          detail: entry.detail,
          createdAt: entry.createdAt,
        });
      }
    }
    return stats;
  }

  private async requireCampaign(id: string): Promise<Campaign> {
    const campaign = await this.marketing.findById(id);
    if (!campaign) {
      throw new NotFoundException(`Campaign not found: ${id}`);
    }
    return campaign;
  }
}
