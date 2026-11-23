import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Payment, PaymentGateway } from '@dostelo/types';
import {
  bkashConfig,
  sslcommerzConfig,
} from '../../config/payments.config';
import {
  NoopTransactionRunner,
  TransactionRunner,
} from '../../prisma/transaction-runner';
import { PaymentsService } from '../payments/payments.service';
import { PaymentsRepository } from '../payments/repositories/payments.repository';
import {
  verifyBkashSignature,
  verifySslcommerzSignature,
} from './webhook-signature';

export interface WebhookHandleResult {
  received: true;
  duplicate: boolean;
  applied: boolean;
  paymentId: string | null;
  reason?: string;
}

type GatewayOutcome = 'paid' | 'failed' | 'cancelled';

interface ParsedWebhook {
  providerEventId: string;
  payment: Payment | null;
  outcome: GatewayOutcome | null;
  providerTxnId: string | null;
  unhandledStatus?: string;
}

const WEBHOOK_GATEWAYS: PaymentGateway[] = ['sslcommerz', 'bkash'];

/**
 * Gateway webhook handling.
 *
 * Trust rules, in order:
 * 1. Only gateways with a real adapter have an endpoint; COD and
 *    the manual methods have none, and unknown gateways 404.
 * 2. With no webhook secret configured for the gateway, the
 *    delivery is rejected (503). Unsigned state changes are never
 *    trusted.
 * 3. A bad signature is rejected (401) and nothing is recorded
 *    or applied.
 * 4. A verified delivery is stored as a WebhookEvent keyed by
 *    (gateway, provider event id). A redelivery returns success
 *    as a duplicate without re-applying anything.
 * 5. A first, verified delivery applies its outcome to the
 *    payment and, through the payments service, to the order.
 *    Recording the delivery and applying its outcome commit in
 *    one transaction (docs/PRISMA_MIGRATION.md).
 */
@Injectable()
export class WebhooksService {
  constructor(
    private readonly payments: PaymentsService,
    private readonly paymentsRepo: PaymentsRepository,
    @Optional()
    private readonly transactions: TransactionRunner = new NoopTransactionRunner(),
  ) {}

  async handle(
    gatewayParam: string,
    payload: Record<string, unknown>,
    signature: string | undefined,
    rawBody: string | undefined,
  ): Promise<WebhookHandleResult> {
    if (!WEBHOOK_GATEWAYS.includes(gatewayParam as PaymentGateway)) {
      throw new NotFoundException(
        `No webhook endpoint for gateway: ${gatewayParam}`,
      );
    }
    const gateway = gatewayParam as PaymentGateway;
    this.verifyDelivery(gateway, payload, signature, rawBody);
    const parsed = await this.parse(gateway, payload);

    return this.transactions.run(async (tx) => {
      const { event, duplicate } =
        await this.paymentsRepo.recordWebhookEvent(
          {
            id: randomUUID(),
            gateway,
            providerEventId: parsed.providerEventId,
            paymentId: parsed.payment?.id ?? null,
            payload,
            createdAt: new Date().toISOString(),
          },
          tx,
        );
      if (duplicate) {
        return {
          received: true,
          duplicate: true,
          applied: false,
          paymentId: event.paymentId,
        } as WebhookHandleResult;
      }
      if (!parsed.payment) {
        return {
          received: true,
          duplicate: false,
          applied: false,
          paymentId: null,
          reason: 'No payment matches this delivery; it was recorded only.',
        } as WebhookHandleResult;
      }
      if (!parsed.outcome) {
        return {
          received: true,
          duplicate: false,
          applied: false,
          paymentId: parsed.payment.id,
          reason: `Unhandled gateway status: ${parsed.unhandledStatus ?? 'unknown'}`,
        } as WebhookHandleResult;
      }
      await this.payments.applyGatewayOutcome(
        {
          payment: parsed.payment,
          outcome: parsed.outcome,
          providerTxnId: parsed.providerTxnId,
          payload,
        },
        tx,
      );
      return {
        received: true,
        duplicate: false,
        applied: true,
        paymentId: parsed.payment.id,
      } as WebhookHandleResult;
    });
  }

  /** Rejects the delivery when the gateway has no webhook secret
   * configured, or when the signature does not verify. */
  private verifyDelivery(
    gateway: PaymentGateway,
    payload: Record<string, unknown>,
    signature: string | undefined,
    rawBody: string | undefined,
  ): void {
    if (gateway === 'sslcommerz') {
      const { storePassword } = sslcommerzConfig();
      if (!storePassword) {
        throw new ServiceUnavailableException(
          'Webhook not configured for gateway: sslcommerz (SSLCOMMERZ_STORE_PASSWORD is not set).',
        );
      }
      if (!verifySslcommerzSignature(payload, storePassword)) {
        throw new UnauthorizedException('Invalid webhook signature');
      }
      return;
    }
    // bkash
    const { webhookSecret } = bkashConfig();
    if (!webhookSecret) {
      throw new ServiceUnavailableException(
        'Webhook not configured for gateway: bkash (BKASH_WEBHOOK_SECRET is not set).',
      );
    }
    const body = rawBody ?? JSON.stringify(payload);
    if (!verifyBkashSignature(body, signature, webhookSecret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  private async parse(
    gateway: PaymentGateway,
    payload: Record<string, unknown>,
  ): Promise<ParsedWebhook> {
    if (gateway === 'sslcommerz') return this.parseSslcommerz(payload);
    return this.parseBkash(payload);
  }

  /** SSLCommerz IPN shape: tran_id is the payment id (set at
   * session creation), val_id is the provider's validation id,
   * status is VALID, VALIDATED, FAILED or CANCELLED. */
  private async parseSslcommerz(
    payload: Record<string, unknown>,
  ): Promise<ParsedWebhook> {
    const tranId = String(payload.tran_id ?? '');
    const valId = payload.val_id ? String(payload.val_id) : '';
    const providerEventId = valId || tranId;
    if (!providerEventId) {
      throw new BadRequestException(
        'SSLCommerz webhook payload carries neither val_id nor tran_id',
      );
    }
    const payment = tranId
      ? await this.paymentsRepo.findById(tranId)
      : null;
    const status = String(payload.status ?? '');
    const outcome: GatewayOutcome | null =
      status === 'VALID' || status === 'VALIDATED'
        ? 'paid'
        : status === 'FAILED'
          ? 'failed'
          : status === 'CANCELLED'
            ? 'cancelled'
            : null;
    return {
      providerEventId,
      payment,
      outcome,
      providerTxnId: valId || null,
      unhandledStatus: outcome ? undefined : status,
    };
  }

  /** bKash callback shape in this codebase's integration:
   * paymentID identifies the session (stored as the payment's
   * provider transaction id at creation), trxID identifies the
   * completed transaction, status is Completed, Failed or
   * Cancelled. */
  private async parseBkash(
    payload: Record<string, unknown>,
  ): Promise<ParsedWebhook> {
    const paymentIdRef = String(payload.paymentID ?? '');
    const trxId = payload.trxID ? String(payload.trxID) : '';
    const providerEventId = trxId || paymentIdRef;
    if (!providerEventId) {
      throw new BadRequestException(
        'bKash webhook payload carries neither trxID nor paymentID',
      );
    }
    const payment = paymentIdRef
      ? await this.paymentsRepo.findByProviderTxnId(paymentIdRef)
      : null;
    const status = String(payload.status ?? '');
    const outcome: GatewayOutcome | null =
      status === 'Completed'
        ? 'paid'
        : status === 'Failed' || status === 'FAILED'
          ? 'failed'
          : status === 'Cancelled' || status === 'Canceled'
            ? 'cancelled'
            : null;
    return {
      providerEventId,
      payment,
      outcome,
      providerTxnId: trxId || null,
      unhandledStatus: outcome ? undefined : status,
    };
  }
}
