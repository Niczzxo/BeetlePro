import { Injectable } from '@nestjs/common';
import type { Payment, PaymentGateway } from '@dostelo/types';
import { bkashConfig } from '../../../config/payments.config';
import { BkashGatewayProvider } from './bkash-gateway.provider';
import { CodPaymentProvider } from './cod.provider';
import { ManualMobileBankingProvider } from './manual-mobile-banking.provider';
import type { PaymentProvider } from './payment-provider';
import { SslcommerzProvider } from './sslcommerz.provider';

/**
 * Routes a gateway (or an existing payment) to its adapter.
 *
 * - cod: the COD adapter.
 * - bkash: the manual adapter by default; the tokenized gateway
 *   adapter when PAYMENTS_BKASH_MODE=gateway.
 * - nagad, rocket, upay: the manual adapter.
 * - sslcommerz and card: the SSLCommerz adapter (SSLCommerz
 *   processes the card payments).
 * - shurjopay: no adapter in this chunk, so initiation reports
 *   the gateway as not configured rather than faking one.
 */
@Injectable()
export class PaymentProviderRegistry {
  constructor(
    private readonly cod: CodPaymentProvider,
    private readonly manual: ManualMobileBankingProvider,
    private readonly sslcommerz: SslcommerzProvider,
    private readonly bkashGateway: BkashGatewayProvider,
  ) {}

  forGateway(gateway: PaymentGateway): PaymentProvider | null {
    switch (gateway) {
      case 'cod':
        return this.cod;
      case 'bkash':
        return bkashConfig().mode === 'gateway'
          ? this.bkashGateway
          : this.manual;
      case 'nagad':
      case 'rocket':
      case 'upay':
        return this.manual;
      case 'sslcommerz':
      case 'card':
        return this.sslcommerz;
      case 'shurjopay':
        return null;
    }
  }

  /** The adapter that owns an existing payment, by the channel
   * recorded on it (a manual bKash payment stays manual even if
   * the gateway mode is switched later). */
  forPayment(payment: Payment): PaymentProvider | null {
    switch (payment.channel) {
      case 'cod':
        return this.cod;
      case 'manual':
        return this.manual;
      case 'gateway':
        if (payment.gateway === 'bkash') return this.bkashGateway;
        if (
          payment.gateway === 'sslcommerz' ||
          payment.gateway === 'card'
        ) {
          return this.sslcommerz;
        }
        return null;
    }
  }
}
