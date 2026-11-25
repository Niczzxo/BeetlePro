import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import type {
  IntegrationStatus,
  IntegrationTestResult,
} from '@dostelo/types';
import type { AuthPrincipal } from '../../common/auth/principal';
import { SettingsRepository } from '../../store/settings.repository';
import { AuditService } from '../audit/audit.service';
import {
  emailCommConfig,
  smsCommConfig,
  whatsappCommConfig,
} from '../../config/communications.config';
import {
  bkashConfig,
  sslcommerzConfig,
} from '../../config/payments.config';
import {
  pathaoConfig,
  redxConfig,
  steadfastConfig,
} from '../../config/shipping.config';

function missingFrom(
  pairs: [string, string | null][],
): string[] {
  return pairs.filter(([, value]) => !value).map(([name]) => name);
}

/**
 * System integrations status (admin master structure module
 * 23). Read-only: every entry is computed from the same config
 * functions the providers themselves consult before acting, so
 * the board can never claim a provider is ready when the
 * provider would refuse. Only missing variable names are
 * reported; no value ever leaves the API.
 */
@Injectable()
export class IntegrationsService {
  constructor(
    @Optional() private readonly settings?: SettingsRepository,
    @Optional() private readonly audit?: AuditService,
  ) {}

  private readonly lastChecks = new Map<string, IntegrationTestResult>();

  lastCheck(key: string): IntegrationTestResult | null {
    return this.lastChecks.get(key) ?? null;
  }

  /**
   * Run the check one integration can honestly support and
   * record it. COD and manual mobile banking have no external
   * connection: their check reads the store settings that gate
   * them. External providers are checked for credential
   * presence only, and the detail says so.
   */
  async test(
    key: string,
    actor?: AuthPrincipal | null,
  ): Promise<IntegrationTestResult> {
    const entry = this.status().find((item) => item.key === key);
    if (!entry) {
      throw new NotFoundException(`Integration not found: ${key}`);
    }
    const checkedAt = new Date().toISOString();
    let detail: string;
    if (key === 'cod') {
      const settings = this.settings ? await this.settings.get() : null;
      detail = settings
        ? settings.allowCod
          ? 'Internal flow check: Cash on Delivery is enabled in the store settings and follows the order flow. No external provider exists to connect to.'
          : 'Internal flow check: Cash on Delivery is currently switched OFF in the store settings (Website Management), so checkout refuses it.'
        : 'Internal flow: Cash on Delivery follows the order flow. No external provider exists to connect to.';
    } else if (key === 'manual-mobile-banking') {
      const settings = this.settings ? await this.settings.get() : null;
      const present = settings
        ? Object.values(settings.manualInstructions).filter(
            (text) => text && text.trim().length > 0,
          ).length
        : 0;
      detail = `Internal flow check: ${present} of 4 manual payment instruction texts are stored in the store settings; staff verify each payment by hand. No external provider exists to connect to.`;
    } else if (!entry.configured) {
      detail = `Not configured: the provider cannot be reached because these environment variables are missing on the API host: ${entry.missing.join(', ')}.`;
    } else {
      detail =
        'Credentials are present in the API host environment. No live probe is performed against the provider, so this confirms configuration only, not provider reachability.';
    }
    const result: IntegrationTestResult = {
      key,
      configured: entry.configured,
      checkedAt,
      detail,
      missing: entry.missing,
    };
    this.lastChecks.set(key, result);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'integrations.tested',
        entityType: 'integration',
        entityId: key,
        metadata: { configured: entry.configured },
      });
    }
    return result;
  }

  status(): IntegrationStatus[] {
    const sslcommerz = sslcommerzConfig();
    const bkash = bkashConfig();
    const whatsapp = whatsappCommConfig();
    const email = emailCommConfig();
    const sms = smsCommConfig();
    const pathao = pathaoConfig();
    const steadfast = steadfastConfig();
    const redx = redxConfig();
    return [
      {
        key: 'cod',
        name: 'Cash on Delivery',
        category: 'payments',
        configured: true,
        missing: [],
        note: 'No provider needed; collection follows the order flow.',
      },
      {
        key: 'manual-mobile-banking',
        name: 'Manual mobile banking (bKash, Nagad, Rocket, Upay)',
        category: 'payments',
        configured: true,
        missing: [],
        note: 'Customers send to the store number in the settings instructions; staff verify each payment.',
      },
      {
        key: 'sslcommerz',
        name: 'SSLCommerz gateway (incl. cards)',
        category: 'payments',
        configured: sslcommerz.configured,
        missing: missingFrom([
          ['SSLCOMMERZ_STORE_ID', sslcommerz.storeId],
          ['SSLCOMMERZ_STORE_PASSWORD', sslcommerz.storePassword],
        ]),
        note: `Mode: ${sslcommerz.mode}. Unconfigured gateways refuse initiation with 503.`,
      },
      {
        key: 'bkash-gateway',
        name: 'bKash tokenized gateway',
        category: 'payments',
        configured: bkash.configured,
        missing: missingFrom([
          ['BKASH_APP_KEY', bkash.appKey],
          ['BKASH_APP_SECRET', bkash.appSecret],
          ['BKASH_USERNAME', bkash.username],
          ['BKASH_PASSWORD', bkash.password],
        ]),
        note:
          bkash.mode === 'gateway'
            ? 'PAYMENTS_BKASH_MODE=gateway: the tokenized adapter handles bKash.'
            : 'PAYMENTS_BKASH_MODE is manual: bKash currently runs as manual mobile banking.',
      },
      {
        key: 'whatsapp',
        name: 'WhatsApp Business Cloud API',
        category: 'communications',
        configured: whatsapp.configured,
        missing: missingFrom([
          ['WHATSAPP_ACCESS_TOKEN', whatsapp.accessToken],
          ['WHATSAPP_PHONE_NUMBER_ID', whatsapp.phoneNumberId],
        ]),
        note: 'Used by cart recovery steps and the Communication Center.',
      },
      {
        key: 'email',
        name: 'Transactional email provider',
        category: 'communications',
        configured: email.configured,
        missing: missingFrom([
          ['EMAIL_PROVIDER_API_KEY', email.apiKey],
          ['EMAIL_PROVIDER_API_URL', email.apiUrl],
          ['EMAIL_FROM', email.fromAddress],
        ]),
        note: 'Generic HTTPS provider configured by the store; no vendor assumed.',
      },
      {
        key: 'sms',
        name: 'SMS provider',
        category: 'communications',
        configured: sms.configured,
        missing: missingFrom([
          ['SMS_API_KEY', sms.apiKey],
          ['SMS_API_URL', sms.apiUrl],
          ['SMS_SENDER_ID', sms.senderId],
        ]),
        note: 'Generic HTTPS provider configured by the store.',
      },
      {
        key: 'pathao',
        name: 'Pathao courier',
        category: 'shipping',
        configured: pathao.configured,
        missing: pathao.missing,
        note: 'Unconfigured couriers record shipments as not-configured with no tracking id.',
      },
      {
        key: 'steadfast',
        name: 'Steadfast courier',
        category: 'shipping',
        configured: steadfast.configured,
        missing: steadfast.missing,
        note: 'Unconfigured couriers record shipments as not-configured with no tracking id.',
      },
      {
        key: 'redx',
        name: 'RedX courier',
        category: 'shipping',
        configured: redx.configured,
        missing: redx.missing,
        note: 'Unconfigured couriers record shipments as not-configured with no tracking id.',
      },
    ];
  }
}
