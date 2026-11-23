import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type Payment as PaymentRow,
  type PaymentGateway as GatewayEnum,
  type PaymentStatus as PaymentStatusEnum,
  type Refund as RefundRow,
  type WebhookEvent as WebhookEventRow,
} from '@prisma/client';
import type {
  Payment,
  PaymentEvent,
  PaymentGateway,
  Refund,
  WebhookEvent,
} from '@dostelo/types';
import {
  date,
  fromEnum,
  iso,
  toEnum,
  toMoney,
} from '../../../prisma/prisma.helpers';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import {
  PaymentsRepository,
  type PaymentListFilter,
} from './payments.repository';

/** Prisma payments repository: Payment, PaymentEvent, Refund
 * and WebhookEvent models. Webhook recording keeps the
 * (gateway, providerEventId) idempotency contract, including
 * under a concurrent redelivery: the unique constraint fires
 * and the already stored record is returned as the duplicate. */
@Injectable()
export class PrismaPaymentsRepository extends PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma.client;
  }

  private toPayment(row: PaymentRow): Payment {
    return {
      id: row.id,
      orderId: row.orderId,
      gateway: fromEnum(row.gateway),
      channel: fromEnum(row.channel),
      status: fromEnum<Payment['status']>(row.status),
      amount: toMoney(row.amountMinor, row.currency),
      providerTxnId: row.providerTxnId,
      senderNumber: row.senderNumber,
      customerTxnId: row.customerTxnId,
      instructions: row.instructions as Payment['instructions'],
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  private paymentData(payment: Payment) {
    return {
      orderId: payment.orderId,
      gateway: toEnum<PaymentRow['gateway']>(payment.gateway),
      channel: toEnum<PaymentRow['channel']>(payment.channel),
      status: toEnum<PaymentRow['status']>(payment.status),
      amountMinor: payment.amount.amountMinor,
      currency: payment.amount.currency,
      providerTxnId: payment.providerTxnId,
      senderNumber: payment.senderNumber,
      customerTxnId: payment.customerTxnId,
      instructions:
        payment.instructions === null
          ? Prisma.JsonNull
          : (payment.instructions as unknown as Prisma.InputJsonValue),
      updatedAt: date(payment.updatedAt),
    };
  }

  async create(payment: Payment, tx?: Tx): Promise<Payment> {
    const row = await this.db(tx).payment.create({
      data: {
        id: payment.id,
        createdAt: date(payment.createdAt),
        ...this.paymentData(payment),
      },
    });
    return this.toPayment(row);
  }

  async save(payment: Payment, tx?: Tx): Promise<void> {
    const db = this.db(tx);
    const existing = await db.payment.findUnique({
      where: { id: payment.id },
    });
    if (!existing) {
      await this.create(payment, tx);
      return;
    }
    await db.payment.update({
      where: { id: payment.id },
      data: this.paymentData(payment),
    });
  }

  async findById(id: string, tx?: Tx): Promise<Payment | null> {
    const row = await this.db(tx).payment.findUnique({ where: { id } });
    return row ? this.toPayment(row) : null;
  }

  async findByProviderTxnId(
    providerTxnId: string,
    tx?: Tx,
  ): Promise<Payment | null> {
    const row = await this.db(tx).payment.findFirst({
      where: { providerTxnId },
    });
    return row ? this.toPayment(row) : null;
  }

  async listByOrder(orderId: string, tx?: Tx): Promise<Payment[]> {
    const rows = await this.db(tx).payment.findMany({
      where: { orderId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toPayment(row));
  }

  async list(filter: PaymentListFilter, tx?: Tx): Promise<Payment[]> {
    const rows = await this.db(tx).payment.findMany({
      where: {
        gateway: filter.gateway
          ? toEnum<GatewayEnum>(filter.gateway)
          : undefined,
        status: filter.status
          ? toEnum<PaymentStatusEnum>(filter.status)
          : undefined,
        orderId: filter.orderId,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toPayment(row));
  }

  async addEvent(event: PaymentEvent, tx?: Tx): Promise<void> {
    await this.db(tx).paymentEvent.create({
      data: {
        id: event.id,
        paymentId: event.paymentId,
        type: event.type,
        status: event.status
          ? toEnum<PaymentStatusEnum>(event.status)
          : null,
        payload:
          event.payload === null
            ? Prisma.JsonNull
            : (event.payload as Prisma.InputJsonValue),
        createdAt: date(event.createdAt),
      },
    });
  }

  async listEvents(paymentId: string, tx?: Tx): Promise<PaymentEvent[]> {
    const rows = await this.db(tx).paymentEvent.findMany({
      where: { paymentId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      paymentId: row.paymentId,
      type: row.type,
      status: (row.status
        ? fromEnum(row.status)
        : null) as PaymentEvent['status'],
      payload: (row.payload as Record<string, unknown> | null) ?? null,
      createdAt: iso(row.createdAt),
    }));
  }

  private toRefund(row: RefundRow): Refund {
    return {
      id: row.id,
      paymentId: row.paymentId,
      orderId: row.orderId,
      amount: toMoney(row.amountMinor, row.currency),
      status: fromEnum<Refund['status']>(row.status),
      reason: row.reason,
      gatewayNote: row.gatewayNote,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  private refundData(refund: Refund) {
    return {
      paymentId: refund.paymentId,
      orderId: refund.orderId,
      amountMinor: refund.amount.amountMinor,
      currency: refund.amount.currency,
      status: toEnum<RefundRow['status']>(refund.status),
      reason: refund.reason,
      gatewayNote: refund.gatewayNote,
      updatedAt: date(refund.updatedAt),
    };
  }

  async createRefund(refund: Refund, tx?: Tx): Promise<Refund> {
    const row = await this.db(tx).refund.create({
      data: {
        id: refund.id,
        createdAt: date(refund.createdAt),
        ...this.refundData(refund),
      },
    });
    return this.toRefund(row);
  }

  async saveRefund(refund: Refund, tx?: Tx): Promise<void> {
    const db = this.db(tx);
    const existing = await db.refund.findUnique({
      where: { id: refund.id },
    });
    if (!existing) {
      await this.createRefund(refund, tx);
      return;
    }
    await db.refund.update({
      where: { id: refund.id },
      data: this.refundData(refund),
    });
  }

  async findRefundById(id: string, tx?: Tx): Promise<Refund | null> {
    const row = await this.db(tx).refund.findUnique({ where: { id } });
    return row ? this.toRefund(row) : null;
  }

  async listRefundsByPayment(
    paymentId: string,
    tx?: Tx,
  ): Promise<Refund[]> {
    const rows = await this.db(tx).refund.findMany({
      where: { paymentId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toRefund(row));
  }

  private toWebhookEvent(
    row: WebhookEventRow,
  ): WebhookEvent {
    return {
      id: row.id,
      gateway: fromEnum(row.gateway),
      providerEventId: row.providerEventId,
      paymentId: row.paymentId,
      payload: row.payload as Record<string, unknown>,
      createdAt: iso(row.createdAt),
    };
  }

  async recordWebhookEvent(
    event: WebhookEvent,
    tx?: Tx,
  ): Promise<{ event: WebhookEvent; duplicate: boolean }> {
    const db = this.db(tx);
    const existing = await db.webhookEvent.findUnique({
      where: {
        gateway_providerEventId: {
          gateway: toEnum(event.gateway),
          providerEventId: event.providerEventId,
        },
      },
    });
    if (existing) {
      return { event: this.toWebhookEvent(existing), duplicate: true };
    }
    try {
      const row = await db.webhookEvent.create({
        data: {
          id: event.id,
          gateway: toEnum(event.gateway),
          providerEventId: event.providerEventId,
          paymentId: event.paymentId,
          payload: event.payload as Prisma.InputJsonValue,
          createdAt: date(event.createdAt),
        },
      });
      return { event: this.toWebhookEvent(row), duplicate: false };
    } catch (error) {
      // A concurrent delivery won the race to the unique
      // constraint: report the stored record as the duplicate.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const stored = await db.webhookEvent.findUnique({
          where: {
            gateway_providerEventId: {
              gateway: toEnum(event.gateway),
              providerEventId: event.providerEventId,
            },
          },
        });
        if (stored) {
          return { event: this.toWebhookEvent(stored), duplicate: true };
        }
      }
      throw error;
    }
  }

  async findWebhookEvent(
    gateway: PaymentGateway,
    providerEventId: string,
    tx?: Tx,
  ): Promise<WebhookEvent | null> {
    const row = await this.db(tx).webhookEvent.findUnique({
      where: {
        gateway_providerEventId: {
          gateway: toEnum(gateway),
          providerEventId,
        },
      },
    });
    return row ? this.toWebhookEvent(row) : null;
  }
}
