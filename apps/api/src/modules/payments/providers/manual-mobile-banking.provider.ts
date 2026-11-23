import { Injectable } from '@nestjs/common';
import {
  PAYMENT_GATEWAY_LABELS,
  type PaymentChannel,
  type PaymentGateway,
} from '@dostelo/types';
import { SettingsRepository } from '../../../store/settings.repository';
import {
  PaymentProvider,
  type ProviderInitiateInput,
  type ProviderInitiateResult,
} from './payment-provider';

export const MANUAL_GATEWAYS: PaymentGateway[] = [
  'bkash',
  'nagad',
  'rocket',
  'upay',
];

/**
 * Manual mobile banking, the flow the live storefront already
 * uses: the customer sends money to the store's number (shared by
 * SMS with the order confirmation) using the order number as the
 * reference, then reports their sender number and transaction id.
 * Staff verify the transfer before anything is marked paid.
 *
 * Initiation therefore only creates the attempt in
 * awaiting-customer state carrying the store's receiving
 * instructions. No money is claimed to have moved at this point.
 * The instructions come from the store settings repository
 * (docs/PRISMA_MIGRATION.md, schema gap 2).
 */
@Injectable()
export class ManualMobileBankingProvider extends PaymentProvider {
  readonly channel: PaymentChannel = 'manual';

  constructor(private readonly settings: SettingsRepository) {
    super();
  }

  supports(gateway: PaymentGateway): boolean {
    return MANUAL_GATEWAYS.includes(gateway);
  }

  isConfigured(): boolean {
    return true;
  }

  async begin(
    input: ProviderInitiateInput,
  ): Promise<ProviderInitiateResult> {
    const { payment, order } = input;
    const method = payment.gateway as keyof Awaited<
      ReturnType<SettingsRepository['get']>
    >['manualInstructions'];
    const settings = await this.settings.get();
    const text =
      settings.manualInstructions[method] ??
      `Store-configured placeholder: send money to the Dostelo ${PAYMENT_GATEWAY_LABELS[payment.gateway]} number shared by SMS with your order confirmation. Use the reference below (your order number).`;
    return {
      status: 'awaiting-customer',
      instructions: {
        method: payment.gateway,
        text,
        reference: order.orderNumber,
      },
      eventType: 'manual-awaiting-customer',
      eventPayload: { reference: order.orderNumber },
    };
  }
}
