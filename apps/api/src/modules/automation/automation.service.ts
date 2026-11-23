import { Injectable } from '@nestjs/common';
import type { AutomationInfo } from '@dostelo/types';
import {
  emailCommConfig,
  smsCommConfig,
  whatsappCommConfig,
} from '../../config/communications.config';
import { CartRecoveryService } from '../cart-recovery/cart-recovery.service';

/**
 * Automation inventory (admin master structure module 14). The
 * platform has no general workflow engine; what runs is a small
 * set of subsystem automations, listed here with their real
 * triggers and settings. The one editable automation
 * configuration in the platform is the cart recovery sequence,
 * which lives in the Cart Recovery module; this service reads
 * its current shape and links there rather than duplicating the
 * editor.
 */
@Injectable()
export class AutomationService {
  constructor(private readonly cartRecovery: CartRecoveryService) {}

  async list(): Promise<AutomationInfo[]> {
    const settings = await this.cartRecovery.getSettings();
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
    return [
      {
        key: 'cart-recovery-detection',
        name: 'Abandoned cart detection',
        runsIn: 'Cart Recovery module, over the job queue',
        trigger: `A cart with items and a contact path, inactive for ${settings.abandonedAfterMinutes} minutes`,
        status: 'active',
        detail:
          'A recurring scan job detects candidates and opens a recovery with an unguessable link. Recovery tokens stay valid for ' +
          `${settings.tokenTtlDays} days.`,
        settingsHref: '/cart-recovery',
      },
      {
        key: 'cart-recovery-sequence',
        name: 'Recovery reminder sequence',
        runsIn: 'Cart Recovery module, one job per step',
        trigger: 'Each step fires at its delay after detection',
        status: anyChannelConfigured ? 'active' : 'not-configured',
        detail: anyChannelConfigured
          ? stepSummary
          : `${stepSummary}. Sends currently record not-configured: no messaging provider is configured, so steps are logged honestly instead of being marked sent. The staff call step always creates a call task for a human.`,
        settingsHref: '/cart-recovery',
      },
      {
        key: 'lead-candidate-evaluation',
        name: 'Lead candidate evaluation and scoring',
        runsIn: 'Leads module, hooked into visitor event ingestion',
        trigger:
          'An identified visitor starts checkout without ordering, or scores 70 or more with contact details on file',
        status: 'active',
        detail:
          'Anonymous visitors never raise candidates, and a score never changes an identity status. Scoring is the transparent formula documented in the Buyer Intelligence module.',
        settingsHref: '/buyer-intelligence',
      },
      {
        key: 'order-recovery-marking',
        name: 'Recovery completion on purchase',
        runsIn: 'Checkout, through the Cart Recovery module',
        trigger: 'An order is placed from a recovery link, or by the same customer covering the cart lines',
        status: 'active',
        detail:
          'The recovery is marked recovered and its pending steps are cancelled, so a customer who bought is never reminded.',
        settingsHref: '/cart-recovery',
      },
      {
        key: 'payment-order-sync',
        name: 'COD payment sync with the order flow',
        runsIn: 'Payments module, subscribed to order status events',
        trigger: 'An order status transition is committed',
        status: 'active',
        detail:
          'Cash on Delivery payments follow the order: collected on delivery, voided on cancellation, refunded on return.',
        settingsHref: '/payments',
      },
    ];
  }
}
