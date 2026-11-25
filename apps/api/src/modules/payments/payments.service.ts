import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  money,
  type Order,
  type Payment,
  type PaymentEvent,
  type PaymentGateway,
  type PaymentStatus,
  type Refund,
} from '@dostelo/types';
import type {
  ManualPaymentConfirm,
  PaymentInitiate,
  PaymentVerify,
  RefundConfirm,
  RefundRequest,
} from '@dostelo/validation';
import { OrdersRepository } from '../orders/repositories/orders.repository';
import { AutomationExecutionsRepository } from '../../store/automation-executions.repository';
import { AuditService } from '../audit/audit.service';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  NoopTransactionRunner,
  TransactionRunner,
} from '../../prisma/transaction-runner';
import type { Tx } from '../../prisma/prisma.service';
import {
  OrderEventBus,
  type OrderStatusChangedEvent,
} from '../../store/order-event-bus';
import { PaymentsRepository } from './repositories/payments.repository';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';
import {
  GatewayNotConfiguredError,
  type ProviderInitiateResult,
} from './providers/payment-provider';

export interface PaymentDetail {
  payment: Payment;
  events: PaymentEvent[];
  refunds: Refund[];
}

export interface PaymentSummaryGroup {
  key: string;
  count: number;
  totalMinor: number;
}

export interface PaymentSummary {
  count: number;
  totalMinor: number;
  byGateway: PaymentSummaryGroup[];
  byStatus: PaymentSummaryGroup[];
}

const PAID_STATUSES: PaymentStatus[] = ['successful', 'collected'];

/**
 * Payments: attempts, manual mobile banking verification, COD
 * collection, gateway sessions, refunds and reconciliation reads.
 *
 * Honesty rules enforced here:
 * - A gateway with no merchant credentials refuses initiation
 *   with a 503 GatewayNotConfiguredError. The attempt is recorded
 *   as failed, never as paid.
 * - Manual mobile banking money is only "paid" after a staff
 *   verification step; a customer confirmation alone never marks
 *   a payment successful.
 * - Every state change writes exactly one PaymentEvent.
 * - The owning order's paymentStatus always mirrors the current
 *   payment status.
 *
 * Multi-record writes commit in one transaction
 * (docs/PRISMA_MIGRATION.md): manual verification, refunds and
 * webhook outcome application wrap their payment, event, refund
 * and order-mirror writes; checkout passes its own transaction
 * into initiateForCheckout so placement stays atomic end to end.
 * Gateway network calls always happen outside a transaction.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly payments: PaymentsRepository,
    private readonly orders: OrdersRepository,
    private readonly registry: PaymentProviderRegistry,
    @Optional() bus?: OrderEventBus,
    @Optional() private readonly audit?: AuditService,
    @Optional()
    private readonly transactions: TransactionRunner = new NoopTransactionRunner(),
    @Optional()
    private readonly executions?: AutomationExecutionsRepository,
  ) {
    bus?.subscribe((event) => this.handleOrderStatusChanged(event));
  }

  // ------------------------------------------------------------------
  // Attempt creation and initiation
  // ------------------------------------------------------------------

  /** Creates a payment attempt for an order in initiated state.
   * The amount always comes from the order total. */
  async createAttempt(
    order: Order,
    gateway: PaymentGateway,
    tx?: Tx,
  ): Promise<Payment> {
    const provider = this.registry.forGateway(gateway);
    const now = new Date().toISOString();
    const payment: Payment = {
      id: randomUUID(),
      orderId: order.id,
      gateway,
      channel: provider?.channel ?? 'gateway',
      status: 'initiated',
      amount: order.total,
      providerTxnId: null,
      senderNumber: null,
      customerTxnId: null,
      instructions: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.payments.create(payment, tx);
    await this.recordEvent(
      payment,
      'attempt-created',
      {
        gateway,
        amountMinor: order.total.amountMinor,
      },
      tx,
    );
    return payment;
  }

  /**
   * The first part of initiation. COD attempts move to
   * pending-collection and manual attempts to awaiting-customer
   * inline; gateway attempts wait for their session (created by
   * initiatePayment). An unconfigured gateway marks the attempt
   * failed with a gateway-not-configured event; whether that is
   * thrown to the caller or just recorded is the caller's choice
   * (checkout records it, the initiate endpoint throws it).
   */
  async beginAttempt(
    payment: Payment,
    options: { throwOnNotConfigured: boolean },
    tx?: Tx,
  ): Promise<Payment> {
    const provider = this.registry.forGateway(payment.gateway);
    if (!provider) {
      return this.failNotConfigured(
        payment,
        `No payment adapter is available for ${payment.gateway} in this build.`,
        options.throwOnNotConfigured,
        tx,
      );
    }
    let result: ProviderInitiateResult;
    try {
      result = await provider.begin({
        payment,
        order: await this.requireOrder(payment, tx),
      });
    } catch (error) {
      if (error instanceof GatewayNotConfiguredError) {
        return this.failNotConfigured(
          payment,
          error.message,
          options.throwOnNotConfigured,
          tx,
        );
      }
      throw error;
    }
    if (result.instructions) payment.instructions = result.instructions;
    if (result.providerTxnId) payment.providerTxnId = result.providerTxnId;
    await this.setStatus(
      payment,
      result.status,
      result.eventType,
      result.eventPayload,
      tx,
    );
    return payment;
  }

  /** Checkout entry point: create the attempt and begin it,
   * recording (not throwing) a gateway-not-configured outcome so
   * the order itself still stands with a visibly failed payment.
   * Runs inside the caller's transaction when one is passed. */
  async initiateForCheckout(
    order: Order,
    gateway: PaymentGateway,
    tx?: Tx,
  ): Promise<Payment> {
    const payment = await this.createAttempt(order, gateway, tx);
    return this.beginAttempt(payment, { throwOnNotConfigured: false }, tx);
  }

  /**
   * Public initiation endpoint flow: starts an attempt for an
   * order (or reuses the open one), and for gateway channels
   * creates the hosted session, returning the redirect URL. An
   * unconfigured gateway throws GatewayNotConfiguredError (503):
   * nothing is recorded as paid, ever, on that path.
   */
  async initiatePayment(
    dto: PaymentInitiate,
  ): Promise<{ payment: Payment; redirectUrl: string | null }> {
    const order =
      (await this.orders.findById(dto.orderId)) ??
      (await this.orders.findByNumber(dto.orderId));
    if (!order) {
      throw new NotFoundException(`Order not found: ${dto.orderId}`);
    }
    const attempts = await this.payments.listByOrder(order.id);
    if (
      attempts.some((attempt) => PAID_STATUSES.includes(attempt.status))
    ) {
      throw new BadRequestException(
        `Order ${order.orderNumber} is already paid`,
      );
    }
    let payment =
      attempts.find(
        (attempt) =>
          attempt.gateway === dto.gateway &&
          (attempt.status === 'initiated' ||
            attempt.status === 'awaiting-customer' ||
            attempt.status === 'verification-pending' ||
            attempt.status === 'pending-collection'),
      ) ?? null;
    if (!payment) {
      payment = await this.createAttempt(order, dto.gateway);
      payment = await this.beginAttempt(payment, {
        throwOnNotConfigured: true,
      });
    }
    if (payment.channel !== 'gateway') {
      return { payment, redirectUrl: null };
    }
    const provider = this.registry.forPayment(payment);
    if (!provider?.initiateSession) {
      throw new GatewayNotConfiguredError(payment.gateway);
    }
    let result: ProviderInitiateResult;
    try {
      result = await provider.initiateSession({ payment, order });
    } catch (error) {
      if (error instanceof GatewayNotConfiguredError) {
        await this.setStatus(payment, 'failed', 'gateway-not-configured', {
          message: error.message,
        });
      }
      throw error;
    }
    if (result.providerTxnId) payment.providerTxnId = result.providerTxnId;
    await this.setStatus(
      payment,
      result.status,
      result.eventType,
      result.eventPayload,
    );
    return { payment, redirectUrl: result.redirectUrl ?? null };
  }

  // ------------------------------------------------------------------
  // Manual mobile banking
  // ------------------------------------------------------------------

  /** The customer reports that they sent the money. Records the
   * sender number and transaction id and moves the payment to
   * verification-pending. This never marks anything paid. */
  async confirmManualPayment(
    paymentId: string,
    dto: ManualPaymentConfirm,
  ): Promise<Payment> {
    const payment = await this.requirePayment(paymentId);
    if (payment.channel !== 'manual') {
      throw new BadRequestException(
        `Payment ${paymentId} is not a manual mobile banking payment`,
      );
    }
    if (payment.status !== 'awaiting-customer') {
      throw new BadRequestException(
        `Payment ${paymentId} is ${payment.status}; it cannot be confirmed now`,
      );
    }
    payment.senderNumber = dto.senderNumber;
    payment.customerTxnId = dto.transactionId;
    await this.transactions.run((tx) =>
      this.setStatus(payment, 'verification-pending', 'manual-customer-confirmed', {
        senderNumber: dto.senderNumber,
        transactionId: dto.transactionId,
      }, tx),
    );
    return payment;
  }

  /** Staff verification of a manual payment. Only this step can
   * mark a manual payment successful; a rejection fails it. The
   * route is guarded by payments.verify; when an actor is
   * supplied the decision is written to the audit trail. */
  async verifyManualPayment(
    paymentId: string,
    dto: PaymentVerify,
    actor?: AuthPrincipal | null,
  ): Promise<Payment> {
    const payment = await this.requirePayment(paymentId);
    if (payment.channel !== 'manual') {
      throw new BadRequestException(
        `Payment ${paymentId} is not a manual mobile banking payment`,
      );
    }
    if (payment.status !== 'verification-pending') {
      throw new BadRequestException(
        `Payment ${paymentId} is ${payment.status}; there is nothing awaiting verification`,
      );
    }
    await this.transactions.run(async (tx) => {
      if (dto.decision === 'paid') {
        payment.providerTxnId = payment.customerTxnId;
        await this.setStatus(payment, 'successful', 'manual-verified-paid', {
          actorId: actor?.id ?? dto.actorId ?? null,
          note: dto.note ?? null,
          transactionId: payment.customerTxnId,
        }, tx);
      } else {
        await this.setStatus(payment, 'failed', 'manual-verified-rejected', {
          actorId: actor?.id ?? dto.actorId ?? null,
          note: dto.note ?? null,
        }, tx);
      }
    });
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'payment.verified',
        entityType: 'payment',
        entityId: payment.id,
        metadata: {
          orderId: payment.orderId,
          decision: dto.decision,
          note: dto.note ?? null,
        },
      });
    }
    return payment;
  }

  // ------------------------------------------------------------------
  // Gateway outcomes (webhooks)
  // ------------------------------------------------------------------

  /** Applies a verified gateway outcome delivered by webhook.
   * Idempotency is the webhooks module's job; this method assumes
   * the delivery is genuine and not a duplicate. When the caller
   * passes a transaction (the webhooks service records the
   * delivery and applies the outcome atomically), the writes join
   * it; otherwise the application opens its own transaction. */
  async applyGatewayOutcome(input: {
    payment: Payment;
    outcome: 'paid' | 'failed' | 'cancelled';
    providerTxnId: string | null;
    payload: Record<string, unknown> | null;
  }, tx?: Tx): Promise<Payment> {
    const { payment, outcome } = input;
    if (input.providerTxnId && outcome === 'paid') {
      payment.providerTxnId = input.providerTxnId;
    }
    const status: PaymentStatus =
      outcome === 'paid'
        ? 'successful'
        : outcome === 'failed'
          ? 'failed'
          : 'cancelled';
    const apply = (client?: Tx): Promise<void> =>
      this.setStatus(payment, status, `webhook-${outcome}`, input.payload, client);
    if (tx) {
      await apply(tx);
    } else {
      await this.transactions.run(apply);
    }
    return payment;
  }

  // ------------------------------------------------------------------
  // Refunds
  // ------------------------------------------------------------------

  /**
   * Records a refund against a paid payment and runs the channel
   * step:
   * - COD and manual payments go to manual-pending; staff confirm
   *   with confirmRefund once the money is handed back.
   * - Gateway payments go through the adapter. An unconfigured
   *   gateway records the refund as gateway-not-configured and
   *   the payment is NOT marked refunded.
   * Refunding an unpaid payment is refused.
   */
  async requestRefund(
    paymentId: string,
    dto: RefundRequest,
    actor?: AuthPrincipal | null,
  ): Promise<Refund> {
    const payment = await this.requirePayment(paymentId);
    if (!PAID_STATUSES.includes(payment.status)) {
      throw new BadRequestException(
        `Payment ${paymentId} is ${payment.status}; only a paid payment can be refunded`,
      );
    }
    const existing = await this.payments.listRefundsByPayment(paymentId);
    const open = existing.find(
      (refund) =>
        refund.status === 'requested' ||
        refund.status === 'manual-pending' ||
        refund.status === 'gateway-not-configured',
    );
    if (open) {
      throw new BadRequestException(
        `Payment ${paymentId} already has an open refund (${open.id})`,
      );
    }
    const completedMinor = existing
      .filter((refund) => refund.status === 'completed')
      .reduce((sum, refund) => sum + refund.amount.amountMinor, 0);
    const remainingMinor = payment.amount.amountMinor - completedMinor;
    const amountMinor = dto.amountMinor ?? remainingMinor;
    if (amountMinor <= 0 || amountMinor > remainingMinor) {
      throw new BadRequestException(
        `Refund amount must be between 1 and ${remainingMinor} minor units for payment ${paymentId}`,
      );
    }
    const now = new Date().toISOString();
    const refund: Refund = {
      id: randomUUID(),
      paymentId: payment.id,
      orderId: payment.orderId,
      amount: money(amountMinor, payment.amount.currency),
      status: 'requested',
      reason: dto.reason ?? null,
      gatewayNote: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.transactions.run(async (tx) => {
      await this.payments.createRefund(refund, tx);
      await this.recordEvent(
        payment,
        'refund-requested',
        {
          refundId: refund.id,
          amountMinor,
          actorId: actor?.id ?? dto.actorId ?? null,
        },
        tx,
      );
    });
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'payment.refund.requested',
        entityType: 'payment',
        entityId: payment.id,
        metadata: {
          refundId: refund.id,
          orderId: payment.orderId,
          amountMinor,
          reason: dto.reason ?? null,
        },
      });
    }

    if (payment.channel === 'gateway') {
      const provider = this.registry.forPayment(payment);
      if (provider?.refund) {
        const result = await provider.refund(payment, refund);
        refund.gatewayNote = result.note;
        refund.status =
          result.outcome === 'completed'
            ? 'completed'
            : result.outcome === 'not-configured'
              ? 'gateway-not-configured'
              : 'requested';
      } else {
        refund.status = 'gateway-not-configured';
        refund.gatewayNote =
          'No refund-capable gateway adapter is available, so the refund was recorded but not sent to the gateway.';
      }
      refund.updatedAt = new Date().toISOString();
      await this.transactions.run(async (tx) => {
        await this.payments.saveRefund(refund, tx);
        await this.recordEvent(
          payment,
          'refund-gateway-step',
          {
            refundId: refund.id,
            status: refund.status,
            note: refund.gatewayNote,
          },
          tx,
        );
        if (refund.status === 'completed') {
          await this.settleRefund(payment, tx);
        }
      });
    } else {
      refund.status = 'manual-pending';
      refund.updatedAt = new Date().toISOString();
      await this.transactions.run(async (tx) => {
        await this.payments.saveRefund(refund, tx);
        await this.recordEvent(
          payment,
          'refund-manual-pending',
          {
            refundId: refund.id,
            note: 'Return the money to the customer outside the gateway, then confirm the refund.',
          },
          tx,
        );
      });
    }
    return refund;
  }

  /** Staff confirmation that a manual refund has been handed
   * back to the customer. Completes the refund and, when the
   * refunded total covers the payment, marks it refunded. */
  async confirmRefund(
    paymentId: string,
    refundId: string,
    dto: RefundConfirm,
    actor?: AuthPrincipal | null,
  ): Promise<Refund> {
    const payment = await this.requirePayment(paymentId);
    const refund = await this.payments.findRefundById(refundId);
    if (!refund || refund.paymentId !== paymentId) {
      throw new NotFoundException(
        `Refund not found for payment ${paymentId}: ${refundId}`,
      );
    }
    if (refund.status !== 'manual-pending') {
      throw new BadRequestException(
        `Refund ${refundId} is ${refund.status}; only a manual-pending refund can be confirmed`,
      );
    }
    refund.status = 'completed';
    refund.updatedAt = new Date().toISOString();
    await this.transactions.run(async (tx) => {
      await this.payments.saveRefund(refund, tx);
      await this.recordEvent(
        payment,
        'refund-completed',
        {
          refundId: refund.id,
          actorId: actor?.id ?? dto.actorId ?? null,
          note: dto.note ?? null,
        },
        tx,
      );
      await this.settleRefund(payment, tx);
    });
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'payment.refund.confirmed',
        entityType: 'payment',
        entityId: payment.id,
        metadata: {
          refundId: refund.id,
          orderId: payment.orderId,
          note: dto.note ?? null,
        },
      });
    }
    return refund;
  }

  // ------------------------------------------------------------------
  // Reads (reconciliation)
  // ------------------------------------------------------------------

  async getPayment(paymentId: string): Promise<PaymentDetail> {
    const payment = await this.requirePayment(paymentId);
    return {
      payment,
      events: await this.payments.listEvents(paymentId),
      refunds: await this.payments.listRefundsByPayment(paymentId),
    };
  }

  async listPayments(filter: {
    gateway?: PaymentGateway;
    status?: PaymentStatus;
    orderId?: string;
  }): Promise<Payment[]> {
    return this.payments.list(filter);
  }

  /** Counts and totals by gateway and by status, for the admin
   * Payments page reconciliation view. Totals are sums of payment
   * amounts per group, in minor units. */
  async summary(): Promise<PaymentSummary> {
    const all = await this.payments.list({});
    const group = (keyOf: (payment: Payment) => string) => {
      const groups = new Map<string, PaymentSummaryGroup>();
      for (const payment of all) {
        const key = keyOf(payment);
        const entry =
          groups.get(key) ?? { key, count: 0, totalMinor: 0 };
        entry.count += 1;
        entry.totalMinor += payment.amount.amountMinor;
        groups.set(key, entry);
      }
      return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
    };
    return {
      count: all.length,
      totalMinor: all.reduce(
        (sum, payment) => sum + payment.amount.amountMinor,
        0,
      ),
      byGateway: group((payment) => payment.gateway),
      byStatus: group((payment) => payment.status),
    };
  }

  // ------------------------------------------------------------------
  // COD sync with the order status flow
  // ------------------------------------------------------------------

  /**
   * Keeps a COD payment in step with its order:
   * - delivered: the cash was collected, payment becomes collected.
   * - cancelled before delivery: no money moved, payment is voided
   *   (cancelled).
   * - returned: collected cash is handed back with the return, so
   *   a collected payment becomes refunded; an uncollected one is
   *   voided.
   * Other channels are untouched: their money does not move with
   * delivery.
   */
  async handleOrderStatusChanged(event: OrderStatusChangedEvent): Promise<void> {
    const { order, to } = event;
    if (to !== 'delivered' && to !== 'cancelled' && to !== 'returned') {
      return;
    }
    const codPayment = (await this.payments.listByOrder(order.id))
      .filter((payment) => payment.channel === 'cod')
      .at(-1);
    if (!codPayment) return;
    const apply = async (
      status: PaymentStatus,
      eventType: string,
    ): Promise<void> => {
      const startedAt = new Date().toISOString();
      await this.transactions.run((tx) =>
        this.setStatus(codPayment, status, eventType, {
          orderNumber: order.orderNumber,
        }, tx),
      );
      if (this.executions) {
        try {
          await this.executions.append({
            id: randomUUID(),
            workflowKey: 'payment-order-sync',
            entityType: 'order',
            entityId: order.id,
            status: 'success',
            detail: `COD payment for order ${order.orderNumber} synced to ${status} on ${to}`,
            startedAt,
            completedAt: new Date().toISOString(),
          });
        } catch {
          // Logging is observability, not the flow.
        }
      }
    };
    if (to === 'delivered') {
      if (
        codPayment.status === 'pending-collection' ||
        codPayment.status === 'initiated'
      ) {
        await apply('collected', 'cod-collected');
      }
    } else if (to === 'cancelled') {
      if (
        codPayment.status === 'pending-collection' ||
        codPayment.status === 'initiated'
      ) {
        await apply('cancelled', 'cod-voided-on-cancel');
      }
    } else {
      // returned
      if (codPayment.status === 'collected') {
        await apply('refunded', 'cod-refunded-on-return');
      } else if (
        codPayment.status === 'pending-collection' ||
        codPayment.status === 'initiated'
      ) {
        await apply('cancelled', 'cod-voided-on-return');
      }
    }
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private async failNotConfigured(
    payment: Payment,
    message: string,
    throwError: boolean,
    tx?: Tx,
  ): Promise<Payment> {
    await this.setStatus(payment, 'failed', 'gateway-not-configured', { message }, tx);
    if (throwError) {
      throw new GatewayNotConfiguredError(payment.gateway, message);
    }
    return payment;
  }

  /** Marks the payment refunded once completed refunds cover
   * the full amount; partial refunds leave it paid. */
  private async settleRefund(payment: Payment, tx?: Tx): Promise<void> {
    const completedMinor = (await this.payments.listRefundsByPayment(payment.id, tx))
      .filter((refund) => refund.status === 'completed')
      .reduce((sum, refund) => sum + refund.amount.amountMinor, 0);
    if (completedMinor >= payment.amount.amountMinor) {
      await this.setStatus(payment, 'refunded', 'payment-refunded', {
        refundedMinor: completedMinor,
      }, tx);
    }
  }

  /** The single place payment state changes happen: set the
   * status, persist, write the PaymentEvent, and mirror the
   * status onto the owning order. */
  private async setStatus(
    payment: Payment,
    status: PaymentStatus,
    eventType: string,
    payload?: Record<string, unknown> | null,
    tx?: Tx,
  ): Promise<void> {
    payment.status = status;
    payment.updatedAt = new Date().toISOString();
    await this.payments.save(payment, tx);
    await this.recordEvent(payment, eventType, payload, tx);
    await this.syncOrderPaymentStatus(payment, tx);
  }

  private async recordEvent(
    payment: Payment,
    type: string,
    payload?: Record<string, unknown> | null,
    tx?: Tx,
  ): Promise<void> {
    await this.payments.addEvent(
      {
        id: randomUUID(),
        paymentId: payment.id,
        type,
        status: payment.status,
        payload: payload ?? null,
        createdAt: new Date().toISOString(),
      },
      tx,
    );
  }

  private async syncOrderPaymentStatus(
    payment: Payment,
    tx?: Tx,
  ): Promise<void> {
    const order = await this.orders.findById(payment.orderId, tx);
    if (order && order.paymentStatus !== payment.status) {
      order.paymentStatus = payment.status;
      order.updatedAt = payment.updatedAt;
      await this.orders.save(order, tx);
    }
  }

  private async requirePayment(paymentId: string): Promise<Payment> {
    const payment = await this.payments.findById(paymentId);
    if (!payment) {
      throw new NotFoundException(`Payment not found: ${paymentId}`);
    }
    return payment;
  }

  private async requireOrder(payment: Payment, tx?: Tx): Promise<Order> {
    const order = await this.orders.findById(payment.orderId, tx);
    if (!order) {
      throw new NotFoundException(
        `Order not found for payment ${payment.id}: ${payment.orderId}`,
      );
    }
    return order;
  }
}
