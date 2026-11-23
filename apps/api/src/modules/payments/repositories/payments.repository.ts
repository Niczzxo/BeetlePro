import type {
  Payment,
  PaymentEvent,
  PaymentGateway,
  PaymentStatus,
  Refund,
  WebhookEvent,
} from '@dostelo/types';
import type { Tx } from '../../../prisma/prisma.service';

export interface PaymentListFilter {
  gateway?: PaymentGateway;
  status?: PaymentStatus;
  orderId?: string;
}

/**
 * Payment persistence seam. The Prisma implementation maps to
 * the Payment, PaymentEvent, Refund and WebhookEvent models in
 * packages/database/prisma/schema.prisma and wraps multi-record
 * transitions (payment plus event plus order status) in
 * transactions.
 */
export abstract class PaymentsRepository {
  abstract create(payment: Payment, tx?: Tx): Promise<Payment>;
  abstract save(payment: Payment, tx?: Tx): Promise<void>;
  abstract findById(id: string, tx?: Tx): Promise<Payment | null>;
  abstract findByProviderTxnId(
    providerTxnId: string,
    tx?: Tx,
  ): Promise<Payment | null>;
  abstract listByOrder(orderId: string, tx?: Tx): Promise<Payment[]>;
  abstract list(
    filter: PaymentListFilter,
    tx?: Tx,
  ): Promise<Payment[]>;
  abstract addEvent(event: PaymentEvent, tx?: Tx): Promise<void>;
  abstract listEvents(
    paymentId: string,
    tx?: Tx,
  ): Promise<PaymentEvent[]>;
  abstract createRefund(refund: Refund, tx?: Tx): Promise<Refund>;
  abstract saveRefund(refund: Refund, tx?: Tx): Promise<void>;
  abstract findRefundById(
    id: string,
    tx?: Tx,
  ): Promise<Refund | null>;
  abstract listRefundsByPayment(
    paymentId: string,
    tx?: Tx,
  ): Promise<Refund[]>;
  /** Stores a webhook delivery, or returns the already stored
   * record when the same (gateway, providerEventId) was delivered
   * before. The boolean flags which of the two happened, so the
   * caller can skip re-applying effects for a duplicate. */
  abstract recordWebhookEvent(
    event: WebhookEvent,
    tx?: Tx,
  ): Promise<{ event: WebhookEvent; duplicate: boolean }>;
  abstract findWebhookEvent(
    gateway: PaymentGateway,
    providerEventId: string,
    tx?: Tx,
  ): Promise<WebhookEvent | null>;
}
