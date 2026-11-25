import {
  BadRequestException,
  Injectable,
  Optional,
} from '@nestjs/common';
import type { AutomationExecution, AutomationInfo } from '@dostelo/types';
import {
  emailCommConfig,
  smsCommConfig,
  whatsappCommConfig,
} from '../../config/communications.config';
import type { AuthPrincipal } from '../../common/auth/principal';
import { AutomationExecutionsRepository } from '../../store/automation-executions.repository';
import { SettingsRepository } from '../../store/settings.repository';
import { AuditService } from '../audit/audit.service';
import { CartRecoveryService } from '../cart-recovery/cart-recovery.service';

/**
 * Automation inventory (admin master structure module 14). The
 * platform has no general workflow engine; what runs is a small
 * set of subsystem automations, listed here with their real
 * triggers, their persisted enable state and their recorded
 * executions. Pause and activate are real where a flow can be
 * gated safely: the two recovery flows read the recovery
 * settings flags, and lead evaluation reads a store settings
 * flag. Recovery completion on purchase and COD payment sync
 * are correctness rules, not campaigns: pausing them would
 * break the platform's own guarantees, so they carry no pause
 * control and say why.
 */
@Injectable()
export class AutomationService {
  constructor(
    private readonly cartRecovery: CartRecoveryService,
    @Optional()
    private readonly executions?: AutomationExecutionsRepository,
    @Optional() private readonly settings?: SettingsRepository,
    @Optional() private readonly audit?: AuditService,
  ) {}

  private async statsFor(
    key: string,
  ): Promise<{ executions30d: number | null; successRate30d: number | null }> {
    if (!this.executions) {
      return { executions30d: null, successRate30d: null };
    }
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const records = await this.executions.list({
      workflowKey: key,
      from,
      limit: 100000,
    });
    if (records.length === 0) {
      return { executions30d: 0, successRate30d: null };
    }
    const succeeded = records.filter((r) => r.status === 'success').length;
    return {
      executions30d: records.length,
      successRate30d: Math.round((succeeded / records.length) * 1000) / 10,
    };
  }

  async list(): Promise<AutomationInfo[]> {
    const settings = await this.cartRecovery.getSettings();
    const storeSettings = this.settings ? await this.settings.get() : null;
    const leadEnabled = storeSettings?.automationLeadEvaluationEnabled ?? true;
    const stepSummary = settings.steps
      .map(
        (step) =>
          `step ${step.stepNumber}: ${step.channel} after ${step.delayMinutes} min`,
      )
      .join('; ');
    const anyChannelConfigured =
      whatsappCommConfig().configured ||
      emailCommConfig().configured ||
      smsCommConfig().configured;
    const detection = await this.statsFor('cart-recovery-detection');
    const sequence = await this.statsFor('cart-recovery-sequence');
    const lead = await this.statsFor('lead-candidate-evaluation');
    const marking = await this.statsFor('order-recovery-marking');
    const sync = await this.statsFor('payment-order-sync');
    return [
      {
        key: 'cart-recovery-detection',
        name: 'Abandoned cart detection',
        runsIn: 'Cart Recovery module, over the job queue',
        trigger: `A cart with items and a contact path, inactive for ${settings.abandonedAfterMinutes} minutes`,
        status: settings.enabled ? 'active' : 'paused',
        detail:
          'A recurring scan job detects candidates and opens a recovery with an unguessable link. Recovery tokens stay valid for ' +
          `${settings.tokenTtlDays} days. Pausing stops new detections; recoveries already open keep their housekeeping.`,
        settingsHref: '/cart-recovery',
        canPause: true,
        ...detection,
      },
      {
        key: 'cart-recovery-sequence',
        name: 'Recovery reminder sequence',
        runsIn: 'Cart Recovery module, one job per step',
        trigger: 'Each step fires at its delay after detection',
        status:
          !settings.enabled || !settings.sequenceEnabled
            ? 'paused'
            : anyChannelConfigured
              ? 'active'
              : 'not-configured',
        detail: anyChannelConfigured
          ? stepSummary
          : `${stepSummary}. Sends currently record not-configured: no messaging provider is configured, so steps are logged honestly instead of being marked sent. The staff call step always creates a call task for a human.`,
        settingsHref: '/cart-recovery',
        canPause: true,
        ...sequence,
      },
      {
        key: 'lead-candidate-evaluation',
        name: 'Lead candidate evaluation and scoring',
        runsIn: 'Leads module, hooked into visitor event ingestion',
        trigger:
          'An identified visitor starts checkout without ordering, or scores 70 or more with contact details on file',
        status: leadEnabled ? 'active' : 'paused',
        detail:
          'Anonymous visitors never raise candidates, and a score never changes an identity status. Scoring is the transparent formula documented in the Buyer Intelligence module. The scoring thresholds (hot 70, warm 40) are code constants today; making them stored settings is a stated gap.',
        settingsHref: '/buyer-intelligence',
        canPause: true,
        ...lead,
      },
      {
        key: 'order-recovery-marking',
        name: 'Recovery completion on purchase',
        runsIn: 'Checkout, through the Cart Recovery module',
        trigger: 'An order is placed from a recovery link, or by the same customer covering the cart lines',
        status: 'active',
        detail:
          'The recovery is marked recovered and its pending steps are cancelled, so a customer who bought is never reminded. This flow cannot be paused: stopping it would message customers who already bought.',
        settingsHref: '/cart-recovery',
        canPause: false,
        ...marking,
      },
      {
        key: 'payment-order-sync',
        name: 'COD payment sync with the order flow',
        runsIn: 'Payments module, subscribed to order status events',
        trigger: 'An order status transition is committed',
        status: 'active',
        detail:
          'Cash on Delivery payments follow the order: collected on delivery, voided on cancellation, refunded on return. This flow cannot be paused: COD states must always follow the order.',
        settingsHref: '/payments',
        canPause: false,
        ...sync,
      },
    ];
  }

  async listExecutions(filter: {
    workflowKey?: string;
    status?: 'success' | 'failed';
    search?: string;
    limit?: number;
  }): Promise<AutomationExecution[]> {
    if (!this.executions) return [];
    const records = await this.executions.list({
      workflowKey: filter.workflowKey,
      status: filter.status,
      limit: Math.min(filter.limit ?? 200, 1000),
    });
    if (!filter.search) return records;
    const needle = filter.search.toLowerCase();
    return records.filter(
      (record) =>
        record.detail.toLowerCase().includes(needle) ||
        record.entityId.toLowerCase().includes(needle) ||
        record.workflowKey.toLowerCase().includes(needle),
    );
  }

  /**
   * Pause or activate a flow through the flag its service
   * actually checks. Flows without a safe gate refuse.
   */
  async setFlowEnabled(
    key: string,
    enabled: boolean,
    actor?: AuthPrincipal | null,
  ): Promise<AutomationInfo> {
    if (key === 'cart-recovery-detection' || key === 'cart-recovery-sequence') {
      if (!actor) {
        throw new BadRequestException(
          'Pausing a recovery flow requires an authenticated staff actor',
        );
      }
      await this.cartRecovery.updateSettings(
        key === 'cart-recovery-detection'
          ? { enabled }
          : { sequenceEnabled: enabled },
        actor,
      );
    } else if (key === 'lead-candidate-evaluation') {
      if (!this.settings) {
        throw new BadRequestException(
          'Lead evaluation cannot be gated in this service configuration',
        );
      }
      const current = await this.settings.get();
      await this.settings.save({
        ...current,
        automationLeadEvaluationEnabled: enabled,
      });
      if (actor && this.audit) {
        await this.audit.recordForPrincipal(actor, {
          action: enabled
            ? 'automation.lead-evaluation-activated'
            : 'automation.lead-evaluation-paused',
          entityType: 'automation',
          entityId: key,
        });
      }
    } else {
      throw new BadRequestException(
        `Automation ${key} cannot be paused: it is a correctness rule of the platform, not an optional flow`,
      );
    }
    const flows = await this.list();
    const flow = flows.find((item) => item.key === key);
    if (!flow) throw new BadRequestException(`Unknown automation: ${key}`);
    return flow;
  }
}
