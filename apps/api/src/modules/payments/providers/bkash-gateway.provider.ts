import { BadGatewayException, Injectable } from '@nestjs/common';
import type { Payment, PaymentChannel, Refund } from '@dostelo/types';
import {
  apiPublicBaseUrl,
  bkashConfig,
  type BkashConfig,
} from '../../../config/payments.config';
import {
  GatewayNotConfiguredError,
  PaymentProvider,
  type ProviderInitiateInput,
  type ProviderInitiateResult,
  type ProviderRefundResult,
} from './payment-provider';

interface BkashTokenResponse {
  id_token?: string;
  statusMessage?: string;
}

interface BkashCreateResponse {
  paymentID?: string;
  bkashURL?: string;
  statusMessage?: string;
}

/**
 * bKash tokenized checkout adapter. Used only when
 * PAYMENTS_BKASH_MODE=gateway; by default bKash runs through the
 * manual mobile banking adapter, the flow the live storefront
 * uses today.
 *
 * The mapping follows the tokenized API: grant a token with the
 * app credentials, create a payment against it, and redirect the
 * customer to the returned bkashURL. Confirmation arrives through
 * the signed webhook endpoint (HMAC-SHA256 with
 * BKASH_WEBHOOK_SECRET) in this codebase's integration shape.
 *
 * Without BKASH_APP_KEY, BKASH_APP_SECRET, BKASH_USERNAME and
 * BKASH_PASSWORD the adapter is not configured and refuses
 * cleanly; it never invents a token, a session or a payment.
 */
@Injectable()
export class BkashGatewayProvider extends PaymentProvider {
  readonly channel: PaymentChannel = 'gateway';

  supports(gateway: string): boolean {
    return gateway === 'bkash';
  }

  isConfigured(): boolean {
    return bkashConfig().configured;
  }

  begin(input: ProviderInitiateInput): ProviderInitiateResult {
    if (!this.isConfigured()) {
      throw new GatewayNotConfiguredError(input.payment.gateway);
    }
    return {
      status: 'initiated',
      eventType: 'gateway-session-pending',
      eventPayload: {
        note: 'Session is created through the payments initiate endpoint.',
      },
    };
  }

  private async grantToken(config: BkashConfig): Promise<string> {
    let response: Response;
    try {
      response = await fetch(
        `${config.apiBaseUrl}/tokenized/checkout/token/grant`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            username: config.username ?? '',
            password: config.password ?? '',
          },
          body: JSON.stringify({
            app_key: config.appKey,
            app_secret: config.appSecret,
          }),
        },
      );
    } catch {
      throw new BadGatewayException(
        'bKash is unreachable; no token was granted.',
      );
    }
    const data = (await response
      .json()
      .catch(() => ({}))) as BkashTokenResponse;
    if (!data.id_token) {
      throw new BadGatewayException(
        `bKash refused the token grant: ${data.statusMessage ?? 'unknown reason'}`,
      );
    }
    return data.id_token;
  }

  async initiateSession(
    input: ProviderInitiateInput,
  ): Promise<ProviderInitiateResult> {
    const config = bkashConfig();
    if (!config.configured || !config.appKey) {
      throw new GatewayNotConfiguredError(input.payment.gateway);
    }
    const { payment, order } = input;
    const token = await this.grantToken(config);
    let response: Response;
    try {
      response = await fetch(
        `${config.apiBaseUrl}/tokenized/checkout/create`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: token,
            'x-app-key': config.appKey,
          },
          body: JSON.stringify({
            mode: '0011',
            payerReference: order.orderNumber,
            callbackURL: `${apiPublicBaseUrl()}/v1/webhooks/bkash`,
            amount: (payment.amount.amountMinor / 100).toFixed(2),
            currency: payment.amount.currency,
            intent: 'sale',
            merchantInvoiceNumber: order.orderNumber,
          }),
        },
      );
    } catch {
      throw new BadGatewayException(
        'bKash is unreachable; the payment session was not created.',
      );
    }
    const data = (await response
      .json()
      .catch(() => ({}))) as BkashCreateResponse;
    if (!data.paymentID || !data.bkashURL) {
      throw new BadGatewayException(
        `bKash refused the session: ${data.statusMessage ?? 'unknown reason'}`,
      );
    }
    return {
      status: 'initiated',
      providerTxnId: data.paymentID,
      redirectUrl: data.bkashURL,
      eventType: 'gateway-session-created',
      eventPayload: { paymentID: data.paymentID },
    };
  }

  async refund(
    payment: Payment,
    refund: Refund,
  ): Promise<ProviderRefundResult> {
    const config = bkashConfig();
    if (!config.configured || !config.appKey) {
      return {
        outcome: 'not-configured',
        note: 'bKash gateway is not configured, so the refund was recorded but not sent to the gateway.',
      };
    }
    if (!payment.providerTxnId) {
      return {
        outcome: 'requested',
        note: 'The payment has no bKash transaction id yet, so the gateway refund cannot be submitted.',
      };
    }
    try {
      const token = await this.grantToken(config);
      const response = await fetch(
        `${config.apiBaseUrl}/tokenized/checkout/payment/refund`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: token,
            'x-app-key': config.appKey,
          },
          body: JSON.stringify({
            paymentID: payment.providerTxnId,
            amount: (refund.amount.amountMinor / 100).toFixed(2),
            trxID: payment.providerTxnId,
            reason: refund.reason ?? 'Customer refund',
            sku: 'order-refund',
          }),
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        statusMessage?: string;
        trxID?: string;
      };
      if (data.trxID) {
        return {
          outcome: 'completed',
          note: 'bKash accepted and completed the refund.',
        };
      }
      return {
        outcome: 'requested',
        note: `bKash did not confirm the refund: ${data.statusMessage ?? 'unknown response'}.`,
      };
    } catch {
      return {
        outcome: 'requested',
        note: 'bKash was unreachable; the refund stays recorded as requested.',
      };
    }
  }
}
