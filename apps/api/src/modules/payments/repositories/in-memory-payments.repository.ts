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

  async create(payment: Payment): Promise<Payment> {
    this.db.payments.set(payment.id, payment);
    return payment;
  }

  async save(payment: Payment): Promise<void> {
    this.db.payments.set(payment.id, payment);
  }

  async findById(id: string): Promise<Payment | null> {
    return this.db.payments.get(id) ?? null;
  }

  async findByProviderTxnId(providerTxnId: string): Promise<Payment | null> {
    return (
      [...this.db.payments.values()].find(
        (payment) => payment.providerTxnId === providerTxnId,
      ) ?? null
    );
  }

  async listByOrder(orderId: string): Promise<Payment[]> {
    return [...this.db.payments.values()]
      .filter((payment) => payment.orderId === orderId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async list(filter: PaymentListFilter): Promise<Payment[]> {
    return [...this.db.payments.values()]
      .filter(
        (payment) =>
          (!filter.gateway || payment.gateway === filter.gateway) &&
          (!filter.status || payment.status === filter.status) &&
          (!filter.orderId || payment.orderId === filter.orderId),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async addEvent(event: PaymentEvent): Promise<void> {
    this.db.paymentEvents.push(event);
  }

  async listEvents(paymentId: string): Promise<PaymentEvent[]> {
    return this.db.paymentEvents.filter(
      (event) => event.paymentId === paymentId,
    );
  }

  async createRefund(refund: Refund): Promise<Refund> {
    this.db.refunds.set(refund.id, refund);
    return refund;
  }

  async saveRefund(refund: Refund): Promise<void> {
    this.db.refunds.set(refund.id, refund);
  }

  async findRefundById(id: string): Promise<Refund | null> {
    return this.db.refunds.get(id) ?? null;
  }

  async listRefundsByPayment(paymentId: string): Promise<Refund[]> {
    return [...this.db.refunds.values()]
      .filter((refund) => refund.paymentId === paymentId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async recordWebhookEvent(
    event: WebhookEvent,
  ): Promise<{ event: WebhookEvent; duplicate: boolean }> {
    const key = `${event.gateway}:${event.providerEventId}`;
    const existing = this.db.webhookEvents.get(key);
    if (existing) return { event: existing, duplicate: true };
    this.db.webhookEvents.set(key, event);
    return { event, duplicate: false };
  }

  async findWebhookEvent(
    gateway: PaymentGateway,
    providerEventId: string,
  ): Promise<WebhookEvent | null> {
    return this.db.webhookEvents.get(`${gateway}:${providerEventId}`) ?? null;
  }
}
