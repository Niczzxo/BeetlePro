import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CommunicationChannel,
  CommunicationLog,
} from '@dostelo/types';
import type { ManualCallLog } from '@dostelo/validation';
import type { AuthPrincipal } from '../../common/auth/principal';
import { AuditService } from '../audit/audit.service';
import { LeadsRepository } from '../leads/repositories/leads.repository';
import { VisitorsService } from '../visitors/visitors.service';
import { CommunicationProviderRegistry } from './providers/communication-provider.registry';
import {
  CommunicationsRepository,
  type CommunicationLogFilter,
} from './repositories/communications.repository';
import {
  findTemplate,
  renderTemplate,
} from './templates/message-templates';

export interface SendMessageInput {
  channel: CommunicationChannel;
  /** Phone number for whatsapp, sms and call; email address for
   * email. Null produces a recorded refused-no-contact entry. */
  to: string | null;
  customerId?: string | null;
  visitorId?: string | null;
  leadId?: string | null;
  abandonedCartId?: string | null;
  /** Template to render the body (and subject) from. Either a
   * template or an explicit body is required. */
  templateKey?: string | null;
  variables?: Record<string, string | number>;
  subject?: string | null;
  body?: string;
  /** Why the message is being sent, for the audit trail:
   * 'cart-recovery', 'lead-follow-up', and so on. */
  purpose: string;
}

/**
 * The Communication Center (Phase 6): one place that sends (or
 * honestly fails to send) every customer message and records
 * every staff call.
 *
 * Every public method writes exactly one CommunicationLog entry,
 * including refusals. The checks run in a fixed order, before any
 * provider is touched:
 *
 * 1. Address: no phone or email for the channel means
 *    refused-no-contact.
 * 2. Suppression: a recorded opt-out for this customer or phone
 *    (Phase 5 SuppressionRecord) means refused-suppressed.
 * 3. Consent: a visitor who denied the marketing scope means
 *    refused-consent.
 *
 * Only then does the channel's provider run. An unconfigured
 * provider records not-configured; a message is 'sent' only on a
 * provider-confirmed success. The call channel never sends: its
 * provider creates an awaiting-staff call task, and the real call
 * is logged by staff through logManualCall.
 */
@Injectable()
export class CommunicationsService {
  constructor(
    private readonly log: CommunicationsRepository,
    private readonly registry: CommunicationProviderRegistry,
    private readonly leads: LeadsRepository,
    private readonly visitors: VisitorsService,
    private readonly audit: AuditService,
  ) {}

  /** Whether contact to this customer or phone is suppressed by
   * a recorded opt-out, across leads and recovery alike. */
  async isSuppressed(target: {
    customerId?: string | null;
    phone?: string | null;
  }): Promise<boolean> {
    return (await this.leads.listSuppressions()).some(
        (record) =>
          (target.customerId != null &&
            record.customerId === target.customerId) ||
          (target.phone != null && record.phone === target.phone),
      );
  }

  async send(input: SendMessageInput): Promise<CommunicationLog> {
    const { subject, body } = this.renderContent(input);
    const base = {
      id: randomUUID(),
      channel: input.channel,
      kind: 'automated' as const,
      toAddress: input.to,
      customerId: input.customerId ?? null,
      visitorId: input.visitorId ?? null,
      leadId: input.leadId ?? null,
      abandonedCartId: input.abandonedCartId ?? null,
      templateKey: input.templateKey ?? null,
      subject,
      body,
      callOutcome: null,
      staffId: null,
      providerMessageId: null,
      createdAt: new Date().toISOString(),
    };

    if (!input.to) {
      return this.log.append({
        ...base,
        status: 'refused-no-contact',
        detail: `No ${input.channel === 'email' ? 'email address' : 'phone number'} on file for a ${input.channel} message. Nothing was sent.`,
      });
    }
    const phoneTarget =
      input.channel === 'email' ? null : input.to;
    if (
      await this.isSuppressed({
        customerId: input.customerId,
        phone: phoneTarget,
      })
    ) {
      return this.log.append({
        ...base,
        status: 'refused-suppressed',
        detail:
          'This contact has opted out and is on the suppression list. Nothing was sent.',
      });
    }
    if (
      input.visitorId &&
      !(await this.visitors.marketingUsable(input.visitorId))
    ) {
      return this.log.append({
        ...base,
        status: 'refused-consent',
        detail:
          'This visitor denied marketing consent. Nothing was sent.',
      });
    }

    const provider = this.registry.forChannel(input.channel);
    const result = await provider.send({
      to: input.to,
      subject,
      body,
    });
    return this.log.append({
      ...base,
      status: result.status,
      providerMessageId: result.providerMessageId,
      detail: result.detail,
    });
  }

  /**
   * Records a call a staff member placed on their own phone.
   * This is a completed staff action, distinct from an automated
   * send: kind 'manual-call', status 'logged'. Suppression is
   * still checked first, and a call to a suppressed number is
   * refused with the refusal recorded instead (the call should
   * not have been placed). An 'opted-out' outcome writes a
   * suppression record so no channel contacts the person again.
   */
  async logManualCall(
    dto: ManualCallLog,
    actor: AuthPrincipal,
  ): Promise<CommunicationLog> {
    const base = {
      id: randomUUID(),
      channel: 'call' as const,
      kind: 'manual-call' as const,
      toAddress: dto.phone,
      customerId: dto.customerId ?? null,
      visitorId: null,
      leadId: dto.leadId ?? null,
      abandonedCartId: dto.abandonedCartId ?? null,
      templateKey: null,
      subject: null,
      body: dto.notes ?? '',
      staffId: actor.id,
      providerMessageId: null,
      createdAt: new Date().toISOString(),
    };

    if (
      await this.isSuppressed({
        customerId: dto.customerId,
        phone: dto.phone,
      })
    ) {
      const refused = await this.log.append({
        ...base,
        status: 'refused-suppressed',
        callOutcome: null,
        detail:
          'This number is on the suppression list. The call log was refused and no contact should be made.',
      });
      await this.audit.recordForPrincipal(actor, {
        action: 'communication.call-refused',
        entityType: 'communication',
        entityId: refused.id,
        metadata: { reason: 'suppressed', phone: dto.phone },
      });
      return refused;
    }

    const entry = await this.log.append({
      ...base,
      status: 'logged',
      callOutcome: dto.outcome,
      detail: null,
    });
    await this.audit.recordForPrincipal(actor, {
      action: 'communication.call-logged',
      entityType: 'communication',
      entityId: entry.id,
      metadata: {
        outcome: dto.outcome,
        abandonedCartId: dto.abandonedCartId ?? null,
        leadId: dto.leadId ?? null,
        customerId: dto.customerId ?? null,
      },
    });
    if (dto.outcome === 'opted-out') {
      await this.leads.appendSuppression({
        id: randomUUID(),
        leadId: dto.leadId ?? null,
        customerId: dto.customerId ?? null,
        phone: dto.phone,
        reason: 'Opt-out recorded on a staff call',
        createdAt: new Date().toISOString(),
      });
      await this.audit.recordForPrincipal(actor, {
        action: 'communication.opted-out',
        entityType: 'communication',
        entityId: entry.id,
        metadata: { phone: dto.phone },
      });
    }
    return entry;
  }

  async listLog(filter: CommunicationLogFilter): Promise<CommunicationLog[]> {
    return this.log.list(filter);
  }

  private renderContent(input: SendMessageInput): {
    subject: string | null;
    body: string;
  } {
    if (input.templateKey) {
      const template = findTemplate(input.templateKey);
      if (!template) {
        throw new BadRequestException(
          `Unknown message template: ${input.templateKey}`,
        );
      }
      if (template.channel !== input.channel) {
        throw new BadRequestException(
          `Template ${input.templateKey} is for ${template.channel}, not ${input.channel}`,
        );
      }
      return renderTemplate(template, input.variables ?? {});
    }
    if (input.body) {
      return { subject: input.subject ?? null, body: input.body };
    }
    throw new BadRequestException(
      'A message needs a templateKey or an explicit body',
    );
  }
}
