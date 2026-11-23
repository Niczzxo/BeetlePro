import type {
  Payment,
  PaymentEvent,
  PaymentGateway,
  PaymentStatus,
  Refund,
  WebhookEvent,
} from '@dostelo/types';

export interface PaymentListFilter {
  gateway?: PaymentGateway;
  status?: PaymentStatus;
  orderId?: string;
}

/**
 * Payment persistence seam. The Prisma implementation will map to
 * the Payment, PaymentEvent, Refund and WebhookEvent models in
 * packages/database/prisma/schema.prisma and wrap multi-record
 * transitions (payment plus event plus order status) in
 * transactions.
 */
export abstract class PaymentsRepository {
  abstract create(payment: Payment): Payment;
  abstract save(payment: Payment): void;
  abstract findById(id: string): Payment | null;
  abstract findByProviderTxnId(providerTxnId: string): Payment | null;
  abstract listByOrder(orderId: string): Payment[];
  abstract list(filter: PaymentListFilter): Payment[];
  abstract addEvent(event: PaymentEvent): void;
  abstract listEvents(paymentId: string): PaymentEvent[];
  abstract createRefund(refund: Refund): Refund;
  abstract saveRefund(refund: Refund): void;
  abstract findRefundById(id: string): Refund | null;
  abstract listRefundsByPayment(paymentId: string): Refund[];
  /** Stores a webhook delivery, or returns the already stored
   * record when the same (gateway, providerEventId) was delivered
   * before. The boolean flags which of the two happened, so the
   * caller can skip re-applying effects for a duplicate. */
  abstract recordWebhookEvent(
    event: WebhookEvent,
  ): { event: WebhookEvent; duplicate: boolean };
  abstract findWebhookEvent(
    gateway: PaymentGateway,
    providerEventId: string,
  ): WebhookEvent | null;
}
