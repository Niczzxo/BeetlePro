import { BadGatewayException, Injectable } from '@nestjs/common';
import type { Payment, PaymentChannel, Refund } from '@dostelo/types';
import {
  apiPublicBaseUrl,
  sslcommerzConfig,
} from '../../../config/payments.config';
import {
  GatewayNotConfiguredError,
  PaymentProvider,
  type ProviderInitiateInput,
  type ProviderInitiateResult,
  type ProviderRefundResult,
} from './payment-provider';

/** Taka string with two decimals, as the gateway expects amounts
 * (the domain stores minor units; conversion happens only here,
 * at the provider boundary). */
function takaString(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}

interface SslcommerzSessionResponse {
  status?: string;
  GatewayPageURL?: string;
  sessionkey?: string;
  failedreason?: string;
}

/**
 * SSLCommerz hosted gateway adapter (also carries card payments,
 * which SSLCommerz processes). The request and response mapping
 * follows the SSLCommerz session API: POST the order as form
 * fields to /gwprocess/v4/api.php, receive a GatewayPageURL to
 * redirect the customer to, and treat the signed IPN webhook as
 * the only trusted payment confirmation.
 *
 * Without SSLCOMMERZ_STORE_ID and SSLCOMMERZ_STORE_PASSWORD the
 * adapter is not configured and refuses cleanly; it never invents
 * a session or a successful payment.
 */
@Injectable()
export class SslcommerzProvider extends PaymentProvider {
  readonly channel: PaymentChannel = 'gateway';

  supports(gateway: string): boolean {
    return gateway === 'sslcommerz' || gateway === 'card';
  }

  isConfigured(): boolean {
    return sslcommerzConfig().configured;
  }

  begin(input: ProviderInitiateInput): ProviderInitiateResult {
    if (!this.isConfigured()) {
      throw new GatewayNotConfiguredError(input.payment.gateway);
    }
    // The session itself is created by initiateSession; begin only
    // records that a configured gateway attempt is ready for it.
    return {
      status: 'initiated',
      eventType: 'gateway-session-pending',
      eventPayload: {
        note: 'Session is created through the payments initiate endpoint.',
      },
    };
  }

  async initiateSession(
    input: ProviderInitiateInput,
  ): Promise<ProviderInitiateResult> {
    const config = sslcommerzConfig();
    if (!config.configured || !config.storeId || !config.storePassword) {
      throw new GatewayNotConfiguredError(input.payment.gateway);
    }
    const { payment, order } = input;
    const base = apiPublicBaseUrl();
    const form = new URLSearchParams({
      store_id: config.storeId,
      store_passwd: config.storePassword,
      total_amount: takaString(payment.amount.amountMinor),
      currency: payment.amount.currency,
      // The payment id is the transaction id: the IPN webhook
      // carries it back as tran_id, which is how the outcome is
      // matched to this attempt.
      tran_id: payment.id,
      success_url: `${base}/v1/webhooks/sslcommerz`,
      fail_url: `${base}/v1/webhooks/sslcommerz`,
      cancel_url: `${base}/v1/webhooks/sslcommerz`,
      ipn_url: `${base}/v1/webhooks/sslcommerz`,
      product_name: order.items
        .map((item) => item.productName)
        .join(', ')
        .slice(0, 250),
      product_category: 'physical-goods',
      product_profile: 'physical-goods',
      cus_name: order.address.fullName,
      cus_phone: order.address.phone,
      cus_add1: order.address.addressLine,
      cus_city: order.address.city,
      cus_country: 'Bangladesh',
      ship_name: order.address.fullName,
      ship_add1: order.address.addressLine,
      ship_city: order.address.city,
      ship_country: 'Bangladesh',
      value_a: order.orderNumber,
    });

    let response: Response;
    try {
      response = await fetch(`${config.apiBaseUrl}/gwprocess/v4/api.php`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
    } catch {
      throw new BadGatewayException(
        'SSLCommerz is unreachable; the payment session was not created.',
      );
    }
    const data = (await response
      .json()
      .catch(() => ({}))) as SslcommerzSessionResponse;
    if (data.status !== 'SUCCESS' || !data.GatewayPageURL) {
      throw new BadGatewayException(
        `SSLCommerz refused the session: ${data.failedreason ?? 'unknown reason'}`,
      );
    }
    return {
      status: 'initiated',
      redirectUrl: data.GatewayPageURL,
      eventType: 'gateway-session-created',
      eventPayload: { sessionKey: data.sessionkey ?? null },
    };
  }

  async refund(
    payment: Payment,
    refund: Refund,
  ): Promise<ProviderRefundResult> {
    const config = sslcommerzConfig();
    if (!config.configured || !config.storeId || !config.storePassword) {
      return {
        outcome: 'not-configured',
        note: 'SSLCommerz is not configured, so the refund was recorded but not sent to the gateway.',
      };
    }
    if (!payment.providerTxnId) {
      return {
        outcome: 'requested',
        note: 'The payment has no provider transaction id (val_id) yet, so the gateway refund cannot be submitted.',
      };
    }
    const query = new URLSearchParams({
      refund_amount: takaString(refund.amount.amountMinor),
      bank_tran_id: payment.providerTxnId,
      refe_id: refund.id,
      store_id: config.storeId,
      store_passwd: config.storePassword,
    });
    try {
      const response = await fetch(
        `${config.apiBaseUrl}/validator/api/refundPayment.php?${query.toString()}`,
        { method: 'GET' },
      );
      const data = (await response.json().catch(() => ({}))) as {
        status?: string;
        errorReason?: string;
      };
      if (data.status === 'success') {
        return {
          outcome: 'completed',
          note: 'SSLCommerz accepted and completed the refund.',
        };
      }
      return {
        outcome: 'requested',
        note: `SSLCommerz did not confirm the refund: ${data.errorReason ?? data.status ?? 'unknown response'}.`,
      };
    } catch {
      return {
        outcome: 'requested',
        note: 'SSLCommerz was unreachable; the refund stays recorded as requested.',
      };
    }
  }
}
