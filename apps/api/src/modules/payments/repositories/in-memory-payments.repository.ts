import { Injectable } from '@nestjs/common';
import type {
  Payment,
  PaymentEvent,
  PaymentGateway,
  Refund,
  WebhookEvent,
} from '@dostelo/types';
import { InMemoryDatabase } from '../../../store/in-memory.store';
import {
  PaymentsRepository,
  type PaymentListFilter,
} from './payments.repository';

@Injectable()
export class InMemoryPaymentsRepository extends PaymentsRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  create(payment: Payment): Payment {
    this.db.payments.set(payment.id, payment);
    return payment;
  }

  save(payment: Payment): void {
    this.db.payments.set(payment.id, payment);
  }

  findById(id: string): Payment | null {
    return this.db.payments.get(id) ?? null;
  }

  findByProviderTxnId(providerTxnId: string): Payment | null {
    return (
      [...this.db.payments.values()].find(
        (payment) => payment.providerTxnId === providerTxnId,
      ) ?? null
    );
  }

  listByOrder(orderId: string): Payment[] {
    return [...this.db.payments.values()]
      .filter((payment) => payment.orderId === orderId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  list(filter: PaymentListFilter): Payment[] {
    return [...this.db.payments.values()]
      .filter(
        (payment) =>
          (!filter.gateway || payment.gateway === filter.gateway) &&
          (!filter.status || payment.status === filter.status) &&
          (!filter.orderId || payment.orderId === filter.orderId),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  addEvent(event: PaymentEvent): void {
    this.db.paymentEvents.push(event);
  }

  listEvents(paymentId: string): PaymentEvent[] {
    return this.db.paymentEvents.filter(
      (event) => event.paymentId === paymentId,
    );
  }

  createRefund(refund: Refund): Refund {
    this.db.refunds.set(refund.id, refund);
    return refund;
  }

  saveRefund(refund: Refund): void {
    this.db.refunds.set(refund.id, refund);
  }

  findRefundById(id: string): Refund | null {
    return this.db.refunds.get(id) ?? null;
  }

  listRefundsByPayment(paymentId: string): Refund[] {
    return [...this.db.refunds.values()]
      .filter((refund) => refund.paymentId === paymentId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  recordWebhookEvent(
    event: WebhookEvent,
  ): { event: WebhookEvent; duplicate: boolean } {
    const key = `${event.gateway}:${event.providerEventId}`;
    const existing = this.db.webhookEvents.get(key);
    if (existing) return { event: existing, duplicate: true };
    this.db.webhookEvents.set(key, event);
    return { event, duplicate: false };
  }

  findWebhookEvent(
    gateway: PaymentGateway,
    providerEventId: string,
  ): WebhookEvent | null {
    return this.db.webhookEvents.get(`${gateway}:${providerEventId}`) ?? null;
  }
}
