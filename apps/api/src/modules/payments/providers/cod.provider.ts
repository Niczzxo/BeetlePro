import { Injectable } from '@nestjs/common';
import type { PaymentChannel } from '@dostelo/types';
import {
  PaymentProvider,
  type ProviderInitiateInput,
  type ProviderInitiateResult,
} from './payment-provider';

/**
 * Cash on Delivery. Initiation parks the payment in
 * pending-collection; the money moves when the order is
 * delivered, which the payments service observes through the
 * order status flow (collected on delivered, voided on cancel,
 * refunded on return). No provider, no network, always available.
 */
@Injectable()
export class CodPaymentProvider extends PaymentProvider {
  readonly channel: PaymentChannel = 'cod';

  supports(gateway: string): boolean {
    return gateway === 'cod';
  }

  isConfigured(): boolean {
    return true;
  }

  begin(_input: ProviderInitiateInput): ProviderInitiateResult {
    return {
      status: 'pending-collection',
      eventType: 'cod-pending-collection',
      eventPayload: {
        note: 'Cash is collected when the order is delivered.',
      },
    };
  }
}
