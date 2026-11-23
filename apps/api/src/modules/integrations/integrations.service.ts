import { Injectable } from '@nestjs/common';
import type { IntegrationStatus } from '@dostelo/types';
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
