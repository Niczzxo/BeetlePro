import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CommunicationChannel,
  CommunicationLog,
  MessageTemplate,
} from '@dostelo/types';
import type {
  ManualCallLog,
  MessageTemplateUpsert,
} from '@dostelo/validation';
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
  MESSAGE_TEMPLATES,
  renderTemplate,
} from './templates/message-templates';
import {
  TemplatesRepository,
  type StoredMessageTemplate,
} from './repositories/templates.repository';

/** A template as the admin portal lists it: the effective body
 * (a stored edit wins over the built-in), where it came from,
 * and when a stored edit last changed. */
export interface MessageTemplateView extends MessageTemplate {
  source: 'built-in' | 'stored';
  updatedAt: string | null;
}

/** Placeholders the send flows actually supply. The recovery
 * flow passes firstName, itemCount, total and recoveryLink, plus
 * the snake_case aliases customer_name, product_name, cart_total
 * and recovery_link with the same values. A template using any
 * other placeholder is rejected at save time, before it can be
 * activated in a sequence. */
export const TEMPLATE_VARIABLES = [
  'firstName',
  'customer_name',
  'itemCount',
  'product_name',
  'total',
  'cart_total',
  'recoveryLink',
  'recovery_link',
] as const;

export function unknownTemplateVariables(text: string): string[] {
  const known = new Set<string>(TEMPLATE_VARIABLES);
  const unknown = new Set<string>();
  for (const match of text.matchAll(/\{\{(\w+)\}\}/g)) {
    if (!known.has(match[1] as string)) unknown.add(match[1] as string);
  }
  return [...unknown];
}

export interface SendMessageInput {
  channel: CommunicationChannel;
  /** Phone number for whatsapp, sms and call; email address for
   * email. Null produces a recorded refused-no-contact entry. */
  to: string | null;
  customerId?: string | null;
  visitorId?: string | null;
  leadId?: string | null;
  abandonedCartId?: string | null;
  /** Set by marketing campaign sends so the campaign's delivery
   * statistics aggregate from the log. */
  campaignId?: string | null;
  /** Template to render the body (and subject) from. Either a
   * template or an explicit body is required. */
  templateKey?: string | null;
  variables?: Record<string, string | number>;
  subject?: string | null;
  body?: string;
  /** Why the message is being sent, for the audit trail:
   * 'cart-recovery', 'lead-follow-up', and so on. */
  purpose: string;
  /** Set for staff-initiated sends from the Communication
   * Center: the entry is labelled 'staff-message' and carries
   * the acting staff member's id. Automated flows leave both
   * unset. */
  staffId?: string | null;
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
    private readonly templates: TemplatesRepository,
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
    const { subject, body } = await this.renderContent(input);
    const base = {
      id: randomUUID(),
      channel: input.channel,
      kind: input.staffId
        ? ('staff-message' as const)
        : ('automated' as const),
      toAddress: input.to,
      customerId: input.customerId ?? null,
      visitorId: input.visitorId ?? null,
      leadId: input.leadId ?? null,
      abandonedCartId: input.abandonedCartId ?? null,
      campaignId: input.campaignId ?? null,
      templateKey: input.templateKey ?? null,
      subject,
      body,
      callOutcome: null,
      staffId: input.staffId ?? null,
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
      campaignId: null,
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

  private async renderContent(input: SendMessageInput): Promise<{
    subject: string | null;
    body: string;
  }> {
    if (input.templateKey) {
      const template = await this.resolveTemplate(input.templateKey);
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

  // -- Message templates ------------------------------------------

  /** The effective template for a key: a staff edit stored in
   * the templates repository wins over the code-versioned
   * built-in. Null when the key exists in neither place. */
  async resolveTemplate(key: string): Promise<MessageTemplate | null> {
    const stored = await this.templates.findStored(key);
    if (stored) {
      return {
        key: stored.key,
        channel: stored.channel,
        subject: stored.subject,
        body: stored.body,
      };
    }
    return findTemplate(key);
  }

  /** Every template the portal can use: built-ins merged with
   * stored edits (which replace their built-in by key), plus
   * stored-only templates, sorted by key. */
  async listTemplates(): Promise<MessageTemplateView[]> {
    const stored = await this.templates.listStored();
    const storedByKey = new Map(stored.map((item) => [item.key, item]));
    const views: MessageTemplateView[] = MESSAGE_TEMPLATES.map(
      (builtin) => {
        const edit = storedByKey.get(builtin.key);
        if (edit) {
          storedByKey.delete(builtin.key);
          return {
            key: edit.key,
            channel: edit.channel,
            subject: edit.subject,
            body: edit.body,
            source: 'stored' as const,
            updatedAt: edit.updatedAt,
          };
        }
        return { ...builtin, source: 'built-in' as const, updatedAt: null };
      },
    );
    for (const extra of storedByKey.values()) {
      views.push({
        key: extra.key,
        channel: extra.channel,
        subject: extra.subject,
        body: extra.body,
        source: 'stored' as const,
        updatedAt: extra.updatedAt,
      });
    }
    return views.sort((a, b) => a.key.localeCompare(b.key));
  }

  /** Creates or replaces a staff template. Placeholders are
   * validated against the variables the send flows supply, so a
   * template that could never render correctly is refused here
   * instead of failing at send time. */
  async upsertTemplate(
    key: string,
    dto: MessageTemplateUpsert,
    actor: AuthPrincipal,
  ): Promise<MessageTemplateView> {
    const unknown = unknownTemplateVariables(
      `${dto.subject ?? ''}\n${dto.body}`,
    );
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Unknown template variable(s): ${unknown
          .map((name) => `{{${name}}}`)
          .join(', ')}. Supported: ${TEMPLATE_VARIABLES.map(
          (name) => `{{${name}}}`,
        ).join(', ')}`,
      );
    }
    const stored: StoredMessageTemplate = {
      key,
      channel: dto.channel,
      subject: dto.subject ?? null,
      body: dto.body,
      updatedAt: new Date().toISOString(),
    };
    const saved = await this.templates.upsertStored(stored);
    await this.audit.recordForPrincipal(actor, {
      action: 'communications.template-updated',
      entityType: 'message-template',
      entityId: key,
      metadata: { channel: saved.channel },
    });
    return { ...saved, source: 'stored' as const };
  }

  /** Removes a staff edit. For a built-in key this restores the
   * code-versioned template; for a stored-only key it deletes
   * the template outright. */
  async deleteTemplate(
    key: string,
    actor: AuthPrincipal,
  ): Promise<{ key: string; removed: boolean; builtinRestored: boolean }> {
    const removed = await this.templates.removeStored(key);
    if (removed) {
      await this.audit.recordForPrincipal(actor, {
        action: 'communications.template-deleted',
        entityType: 'message-template',
        entityId: key,
        metadata: { builtinRestored: findTemplate(key) !== null },
      });
    }
    return { key, removed, builtinRestored: findTemplate(key) !== null };
  }
}
