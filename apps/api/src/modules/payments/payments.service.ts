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
import { AuditService } from '../audit/audit.service';
import type { AuthPrincipal } from '../../common/auth/principal';
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
  events: ReturnType<PaymentsRepository['listEvents']>;
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
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly payments: PaymentsRepository,
    private readonly orders: OrdersRepository,
    private readonly registry: PaymentProviderRegistry,
    @Optional() bus?: OrderEventBus,
    @Optional() private readonly audit?: AuditService,
  ) {
    bus?.subscribe((event) => this.handleOrderStatusChanged(event));
  }

  // ------------------------------------------------------------------
  // Attempt creation and initiation
  // ------------------------------------------------------------------

  /** Creates a payment attempt for an order in initiated state.
   * The amount always comes from the order total. */
  createAttempt(order: Order, gateway: PaymentGateway): Payment {
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
    this.payments.create(payment);
    this.recordEvent(payment, 'attempt-created', {
      gateway,
      amountMinor: order.total.amountMinor,
    });
    return payment;
  }

  /**
   * The synchronous part of initiation. COD attempts move to
   * pending-collection and manual attempts to awaiting-customer
   * inline; gateway attempts wait for their session (created by
   * initiatePayment). An unconfigured gateway marks the attempt
   * failed with a gateway-not-configured event; whether that is
   * thrown to the caller or just recorded is the caller's choice
   * (checkout records it, the initiate endpoint throws it).
   */
  beginAttempt(
    payment: Payment,
    options: { throwOnNotConfigured: boolean },
  ): Payment {
    const provider = this.registry.forGateway(payment.gateway);
    if (!provider) {
      return this.failNotConfigured(
        payment,
        `No payment adapter is available for ${payment.gateway} in this build.`,
        options.throwOnNotConfigured,
      );
    }
    let result: ProviderInitiateResult;
    try {
      result = provider.begin({ payment, order: this.requireOrder(payment) });
    } catch (error) {
      if (error instanceof GatewayNotConfiguredError) {
        return this.failNotConfigured(
          payment,
          error.message,
          options.throwOnNotConfigured,
        );
      }
      throw error;
    }
    if (result.instructions) payment.instructions = result.instructions;
    if (result.providerTxnId) payment.providerTxnId = result.providerTxnId;
    this.setStatus(payment, result.status, result.eventType, result.eventPayload);
    return payment;
  }

  /** Checkout entry point: create the attempt and begin it,
   * recording (not throwing) a gateway-not-configured outcome so
   * the order itself still stands with a visibly failed payment. */
  initiateForCheckout(order: Order, gateway: PaymentGateway): Payment {
    const payment = this.createAttempt(order, gateway);
    return this.beginAttempt(payment, { throwOnNotConfigured: false });
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
      this.orders.findById(dto.orderId) ??
      this.orders.findByNumber(dto.orderId);
    if (!order) {
      throw new NotFoundException(`Order not found: ${dto.orderId}`);
    }
    const attempts = this.payments.listByOrder(order.id);
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
      payment = this.createAttempt(order, dto.gateway);
      payment = this.beginAttempt(payment, { throwOnNotConfigured: true });
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
        this.setStatus(payment, 'failed', 'gateway-not-configured', {
          message: error.message,
        });
      }
      throw error;
    }
    if (result.providerTxnId) payment.providerTxnId = result.providerTxnId;
    this.setStatus(payment, result.status, result.eventType, result.eventPayload);
    return { payment, redirectUrl: result.redirectUrl ?? null };
  }

  // ------------------------------------------------------------------
  // Manual mobile banking
  // ------------------------------------------------------------------

  /** The customer reports that they sent the money. Records the
   * sender number and transaction id and moves the payment to
   * verification-pending. This never marks anything paid. */
  confirmManualPayment(
    paymentId: string,
    dto: ManualPaymentConfirm,
  ): Payment {
    const payment = this.requirePayment(paymentId);
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
    this.setStatus(payment, 'verification-pending', 'manual-customer-confirmed', {
      senderNumber: dto.senderNumber,
      transactionId: dto.transactionId,
    });
    return payment;
  }

  /** Staff verification of a manual payment. Only this step can
   * mark a manual payment successful; a rejection fails it. The
   * route is guarded by payments.verify; when an actor is
   * supplied the decision is written to the audit trail. */
  verifyManualPayment(
    paymentId: string,
    dto: PaymentVerify,
    actor?: AuthPrincipal | null,
  ): Payment {
    const payment = this.requirePayment(paymentId);
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
    if (dto.decision === 'paid') {
      payment.providerTxnId = payment.customerTxnId;
      this.setStatus(payment, 'successful', 'manual-verified-paid', {
        actorId: actor?.id ?? dto.actorId ?? null,
        note: dto.note ?? null,
        transactionId: payment.customerTxnId,
      });
    } else {
      this.setStatus(payment, 'failed', 'manual-verified-rejected', {
        actorId: actor?.id ?? dto.actorId ?? null,
        note: dto.note ?? null,
      });
    }
    if (actor && this.audit) {
      this.audit.recordForPrincipal(actor, {
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
   * the delivery is genuine and not a duplicate. */
  applyGatewayOutcome(input: {
    payment: Payment;
    outcome: 'paid' | 'failed' | 'cancelled';
    providerTxnId: string | null;
    payload: Record<string, unknown> | null;
  }): Payment {
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
    this.setStatus(payment, status, `webhook-${outcome}`, input.payload);
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
    const payment = this.requirePayment(paymentId);
    if (!PAID_STATUSES.includes(payment.status)) {
      throw new BadRequestException(
        `Payment ${paymentId} is ${payment.status}; only a paid payment can be refunded`,
      );
    }
    const existing = this.payments.listRefundsByPayment(paymentId);
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
    this.payments.createRefund(refund);
    this.recordEvent(payment, 'refund-requested', {
      refundId: refund.id,
      amountMinor,
      actorId: actor?.id ?? dto.actorId ?? null,
    });
    if (actor && this.audit) {
      this.audit.recordForPrincipal(actor, {
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
      this.payments.saveRefund(refund);
      this.recordEvent(payment, 'refund-gateway-step', {
        refundId: refund.id,
        status: refund.status,
        note: refund.gatewayNote,
      });
      if (refund.status === 'completed') {
        this.settleRefund(payment);
      }
    } else {
      refund.status = 'manual-pending';
      refund.updatedAt = new Date().toISOString();
      this.payments.saveRefund(refund);
      this.recordEvent(payment, 'refund-manual-pending', {
        refundId: refund.id,
        note: 'Return the money to the customer outside the gateway, then confirm the refund.',
      });
    }
    return refund;
  }

  /** Staff confirmation that a manual refund has been handed
   * back to the customer. Completes the refund and, when the
   * refunded total covers the payment, marks it refunded. */
  confirmRefund(
    paymentId: string,
    refundId: string,
    dto: RefundConfirm,
    actor?: AuthPrincipal | null,
  ): Refund {
    const payment = this.requirePayment(paymentId);
    const refund = this.payments.findRefundById(refundId);
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
    this.payments.saveRefund(refund);
    this.recordEvent(payment, 'refund-completed', {
      refundId: refund.id,
      actorId: actor?.id ?? dto.actorId ?? null,
      note: dto.note ?? null,
    });
    if (actor && this.audit) {
      this.audit.recordForPrincipal(actor, {
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
    this.settleRefund(payment);
    return refund;
  }

  // ------------------------------------------------------------------
  // Reads (reconciliation)
  // ------------------------------------------------------------------

  getPayment(paymentId: string): PaymentDetail {
    const payment = this.requirePayment(paymentId);
    return {
      payment,
      events: this.payments.listEvents(paymentId),
      refunds: this.payments.listRefundsByPayment(paymentId),
    };
  }

  listPayments(filter: {
    gateway?: PaymentGateway;
    status?: PaymentStatus;
    orderId?: string;
  }): Payment[] {
    return this.payments.list(filter);
  }

  /** Counts and totals by gateway and by status, for the admin
   * Payments page reconciliation view. Totals are sums of payment
   * amounts per group, in minor units. */
  summary(): PaymentSummary {
    const all = this.payments.list({});
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
  handleOrderStatusChanged(event: OrderStatusChangedEvent): void {
    const { order, to } = event;
    if (to !== 'delivered' && to !== 'cancelled' && to !== 'returned') {
      return;
    }
    const codPayment = this.payments
      .listByOrder(order.id)
      .filter((payment) => payment.channel === 'cod')
      .at(-1);
    if (!codPayment) return;
    if (to === 'delivered') {
      if (
        codPayment.status === 'pending-collection' ||
        codPayment.status === 'initiated'
      ) {
        this.setStatus(codPayment, 'collected', 'cod-collected', {
          orderNumber: order.orderNumber,
        });
      }
    } else if (to === 'cancelled') {
      if (
        codPayment.status === 'pending-collection' ||
        codPayment.status === 'initiated'
      ) {
        this.setStatus(codPayment, 'cancelled', 'cod-voided-on-cancel', {
          orderNumber: order.orderNumber,
        });
      }
    } else {
      // returned
      if (codPayment.status === 'collected') {
        this.setStatus(codPayment, 'refunded', 'cod-refunded-on-return', {
          orderNumber: order.orderNumber,
        });
      } else if (
        codPayment.status === 'pending-collection' ||
        codPayment.status === 'initiated'
      ) {
        this.setStatus(codPayment, 'cancelled', 'cod-voided-on-return', {
          orderNumber: order.orderNumber,
        });
      }
    }
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private failNotConfigured(
    payment: Payment,
    message: string,
    throwError: boolean,
  ): Payment {
    this.setStatus(payment, 'failed', 'gateway-not-configured', { message });
    if (throwError) {
      throw new GatewayNotConfiguredError(payment.gateway, message);
    }
    return payment;
  }

  /** Marks the payment refunded once completed refunds cover
   * the full amount; partial refunds leave it paid. */
  private settleRefund(payment: Payment): void {
    const completedMinor = this.payments
      .listRefundsByPayment(payment.id)
      .filter((refund) => refund.status === 'completed')
      .reduce((sum, refund) => sum + refund.amount.amountMinor, 0);
    if (completedMinor >= payment.amount.amountMinor) {
      this.setStatus(payment, 'refunded', 'payment-refunded', {
        refundedMinor: completedMinor,
      });
    }
  }

  /** The single place payment state changes happen: set the
   * status, persist, write the PaymentEvent, and mirror the
   * status onto the owning order. */
  private setStatus(
    payment: Payment,
    status: PaymentStatus,
    eventType: string,
    payload?: Record<string, unknown> | null,
  ): void {
    payment.status = status;
    payment.updatedAt = new Date().toISOString();
    this.payments.save(payment);
    this.recordEvent(payment, eventType, payload);
    this.syncOrderPaymentStatus(payment);
  }

  private recordEvent(
    payment: Payment,
    type: string,
    payload?: Record<string, unknown> | null,
  ): void {
    this.payments.addEvent({
      id: randomUUID(),
      paymentId: payment.id,
      type,
      status: payment.status,
      payload: payload ?? null,
      createdAt: new Date().toISOString(),
    });
  }

  private syncOrderPaymentStatus(payment: Payment): void {
    const order = this.orders.findById(payment.orderId);
    if (order && order.paymentStatus !== payment.status) {
      order.paymentStatus = payment.status;
      order.updatedAt = payment.updatedAt;
      this.orders.save(order);
    }
  }

  private requirePayment(paymentId: string): Payment {
    const payment = this.payments.findById(paymentId);
    if (!payment) {
      throw new NotFoundException(`Payment not found: ${paymentId}`);
    }
    return payment;
  }

  private requireOrder(payment: Payment): Order {
    const order = this.orders.findById(payment.orderId);
    if (!order) {
      throw new NotFoundException(
        `Order not found for payment ${payment.id}: ${payment.orderId}`,
      );
    }
    return order;
  }
}
