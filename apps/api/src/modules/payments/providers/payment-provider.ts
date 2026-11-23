import { ServiceUnavailableException } from '@nestjs/common';
import type {
  Order,
  Payment,
  PaymentChannel,
  PaymentGateway,
  PaymentInstructions,
  PaymentStatus,
  Refund,
} from '@dostelo/types';

/**
 * Raised when a gateway cannot run because its merchant
 * credentials are not configured (or no adapter exists for it in
 * this chunk). Maps to HTTP 503. A payment attempt that hits this
 * is recorded as failed with a gateway-not-configured event;
 * nothing is ever recorded as paid on this path.
 */
export class GatewayNotConfiguredError extends ServiceUnavailableException {
  readonly gateway: PaymentGateway;

  constructor(gateway: PaymentGateway, detail?: string) {
    super(
      detail ??
        `Gateway not configured: ${gateway}. Merchant credentials are required before this gateway can take payments.`,
    );
    this.gateway = gateway;
  }
}

export interface ProviderInitiateInput {
  payment: Payment;
  order: Order;
}

export interface ProviderInitiateResult {
  status: PaymentStatus;
  providerTxnId?: string | null;
  /** Hosted gateway only: where the customer is sent to pay. */
  redirectUrl?: string | null;
  /** Manual mobile banking only: receiving instructions for the
   * customer. */
  instructions?: PaymentInstructions | null;
  eventType: string;
  eventPayload?: Record<string, unknown> | null;
}

export type ProviderRefundOutcome =
  /** The gateway accepted and completed the refund. */
  | 'completed'
  /** The gateway accepted the refund; it settles asynchronously
   * and a webhook or later reconciliation confirms it. */
  | 'requested'
  /** The gateway step could not run: not configured. */
  | 'not-configured';

export interface ProviderRefundResult {
  outcome: ProviderRefundOutcome;
  note: string;
}

/**
 * One payment channel adapter. Synchronous adapters (COD, manual
 * mobile banking) settle their initiation inline; hosted gateway
 * adapters create a session over HTTP and are therefore async.
 * Checkout only ever calls the synchronous begin step (see
 * PaymentsService.beginAttempt); the gateway session itself is
 * created through initiateGatewaySession once an order exists.
 */
export abstract class PaymentProvider {
  abstract readonly channel: PaymentChannel;
  abstract supports(gateway: PaymentGateway): boolean;
  /** Whether this adapter can run right now. COD and manual
   * adapters always can; gateway adapters need credentials. */
  abstract isConfigured(): boolean;
  /** The synchronous part of initiation: moves the attempt into
   * its first real state without any network call. Gateway
   * adapters return the attempt as still initiated (the session
   * is created separately) or throw GatewayNotConfiguredError. */
  abstract begin(input: ProviderInitiateInput): ProviderInitiateResult;
  /** Hosted gateways only: creates the provider session. COD and
   * manual adapters do not implement this. */
  initiateSession?(
    input: ProviderInitiateInput,
  ): Promise<ProviderInitiateResult>;
  /** Hosted gateways only: asks the provider to refund. COD and
   * manual refunds never touch a provider. */
  refund?(payment: Payment, refund: Refund): Promise<ProviderRefundResult>;
}
