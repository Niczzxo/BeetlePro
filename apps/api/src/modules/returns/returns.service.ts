import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  money,
  RETURN_TRANSITIONS,
  type ReturnEvent,
  type ReturnLine,
  type ReturnRequest,
  type ReturnStatus,
} from '@dostelo/types';
import type {
  CreateReturn,
  ReturnAssign,
  ReturnInspectionInput,
  ReturnNote,
  ReturnPickup,
} from '@dostelo/validation';
import type { AuthPrincipal } from '../../common/auth/principal';
import { SettingsRepository } from '../../store/settings.repository';
import { AuditService } from '../audit/audit.service';
import { InventoryRepository } from '../inventory/repositories/inventory.repository';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { PaymentsRepository } from '../payments/repositories/payments.repository';
import {
  ReturnsRepository,
  type ReturnFilter,
} from './repositories/returns.repository';

/**
 * Returns and exchanges (admin master structure module 12).
 *
 * Rules:
 * - A request can only be raised against a delivered order,
 *   inside the store's return window (settings, default 30
 *   days), and only for quantities not already covered by
 *   another non-rejected request for the same order lines.
 * - Movement follows the RETURN_TRANSITIONS state machine;
 *   every move is validated here, recorded as a ReturnEvent and
 *   audited.
 * - Received goods NEVER restock on arrival or approval. Only a
 *   completed inspection with a resellable outcome returns the
 *   received units to sellable stock, through the inventory
 *   repository (which writes the movement ledger entry and,
 *   with the audit record here, keeps the change attributable).
 * - When the completed requests together cover every unit of
 *   the order, the order itself moves to 'returned' through the
 *   normal order status flow, at completion time.
 * - The money side is never settled here: the refund hand-off
 *   creates a refund request in Payments against the order's
 *   paid payment, and Payments owns verification and payout.
 *   The 'refunded' state is reachable only when the linked
 *   Payments refund record itself reads completed.
 */
@Injectable()
export class ReturnsService {
  constructor(
    private readonly returns: ReturnsRepository,
    private readonly orders: OrdersService,
    private readonly inventory: InventoryRepository,
    private readonly paymentsRepo: PaymentsRepository,
    private readonly payments: PaymentsService,
    @Optional() private readonly audit?: AuditService,
    @Optional() private readonly settings?: SettingsRepository,
  ) {}

  /** Records one workflow event for a request. */
  private async recordEvent(
    request: ReturnRequest,
    note: string | null,
    actor?: AuthPrincipal | null,
  ): Promise<void> {
    const event: ReturnEvent = {
      id: randomUUID(),
      returnId: request.id,
      status: request.status,
      note,
      actorId: actor?.id ?? null,
      createdAt: new Date().toISOString(),
    };
    await this.returns.appendEvent(event);
  }

  /** Validates and applies a status move, then records the
   * event and the audit entry. */
  private async move(
    request: ReturnRequest,
    to: ReturnStatus,
    actor: AuthPrincipal | null | undefined,
    note?: string | null,
  ): Promise<ReturnRequest> {
    const allowed = RETURN_TRANSITIONS[request.status];
    if (!allowed.includes(to)) {
      throw new BadRequestException(
        `Return ${request.id} is ${request.status}; it cannot move to ${to}`,
      );
    }
    request.status = to;
    request.updatedAt = new Date().toISOString();
    await this.returns.save(request);
    await this.recordEvent(request, note ?? null, actor);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: `return.${to}`,
        entityType: 'return-request',
        entityId: request.id,
        metadata: {
          orderNumber: request.orderNumber,
          note: note ?? null,
        },
      });
    }
    return request;
  }

  async create(
    dto: CreateReturn,
    actor?: AuthPrincipal | null,
  ): Promise<ReturnRequest> {
    const order = await this.orders.getByNumber(dto.orderNumber);
    if (order.status !== 'delivered') {
      throw new BadRequestException(
        `Returns can only be raised against a delivered order; order ${order.orderNumber} is ${order.status}`,
      );
    }
    if (this.settings) {
      const windowDays = (await this.settings.get()).returnWindowDays;
      if (windowDays > 0) {
        const detail = await this.orders.getDetail(order.orderNumber);
        const deliveredEvent = detail.events
          .filter((event) => event.status === 'delivered')
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        if (deliveredEvent) {
          const deliveredAt = new Date(deliveredEvent.createdAt).getTime();
          const deadline = deliveredAt + windowDays * 24 * 60 * 60 * 1000;
          if (Date.now() > deadline) {
            throw new BadRequestException(
              `Order ${order.orderNumber} was delivered more than ${windowDays} days ago; the return window has closed`,
            );
          }
        }
      }
    }
    const existing = await this.returns.list({
      orderNumber: order.orderNumber,
    });
    const covered = new Map<string, number>();
    for (const request of existing) {
      if (request.status === 'rejected') continue;
      for (const line of request.items) {
        covered.set(
          line.orderItemId,
          (covered.get(line.orderItemId) ?? 0) + line.quantity,
        );
      }
    }
    const lines: ReturnLine[] = [];
    let totalMinor = 0;
    for (const item of dto.items) {
      const orderItem = order.items.find(
        (candidate) => candidate.id === item.orderItemId,
      );
      if (!orderItem) {
        throw new BadRequestException(
          `Order ${order.orderNumber} has no line ${item.orderItemId}`,
        );
      }
      const already = covered.get(orderItem.id) ?? 0;
      if (already + item.quantity > orderItem.quantity) {
        throw new BadRequestException(
          `Line ${orderItem.productName} has ${orderItem.quantity - already} unit(s) left to return; ${item.quantity} requested`,
        );
      }
      covered.set(orderItem.id, already + item.quantity);
      lines.push({
        orderItemId: orderItem.id,
        variantId: orderItem.variantId,
        productName: orderItem.productName,
        variantName: orderItem.variantName,
        quantity: item.quantity,
        unitPrice: orderItem.unitPrice,
      });
      totalMinor += orderItem.unitPrice.amountMinor * item.quantity;
    }
    const now = new Date().toISOString();
    const request: ReturnRequest = {
      id: randomUUID(),
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      kind: dto.kind,
      status: 'requested',
      reason: dto.reason ?? null,
      note: dto.note ?? null,
      resolutionType:
        dto.resolutionType ??
        (dto.kind === 'exchange' ? 'exchange' : 'refund'),
      condition: dto.condition ?? null,
      assigneeId: null,
      pickupScheduledAt: null,
      receivedAt: null,
      inspection: null,
      items: lines,
      total: money(totalMinor, order.total.currency),
      refundState: dto.kind === 'exchange' ? 'not-required' : 'none',
      refundId: null,
      restocked: false,
      createdById: actor?.id ?? null,
      decidedById: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.returns.create(request);
    await this.recordEvent(request, 'Return requested', actor);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'return.created',
        entityType: 'return-request',
        entityId: request.id,
        metadata: {
          orderNumber: request.orderNumber,
          kind: request.kind,
          totalMinor,
        },
      });
    }
    return request;
  }

  async list(filter?: ReturnFilter): Promise<ReturnRequest[]> {
    return this.returns.list(filter);
  }

  async getById(id: string): Promise<ReturnRequest> {
    const request = await this.returns.findById(id);
    if (!request) {
      throw new NotFoundException(`Return request not found: ${id}`);
    }
    return request;
  }

  /** The request plus its recorded workflow events, for the
   * details view timeline. */
  async getDetail(
    id: string,
  ): Promise<{ request: ReturnRequest; events: ReturnEvent[] }> {
    const request = await this.getById(id);
    return { request, events: await this.returns.listEvents(id) };
  }

  async startReview(
    id: string,
    actor?: AuthPrincipal | null,
  ): Promise<ReturnRequest> {
    const request = await this.getById(id);
    return this.move(request, 'under-review', actor, 'Review started');
  }

  async approve(
    id: string,
    actor?: AuthPrincipal | null,
  ): Promise<ReturnRequest> {
    const request = await this.getById(id);
    request.decidedById = actor?.id ?? null;
    // Approval no longer restocks: goods restock only after a
    // resellable inspection of what actually arrived.
    return this.move(request, 'approved', actor, 'Return approved');
  }

  async reject(
    id: string,
    actor?: AuthPrincipal | null,
  ): Promise<ReturnRequest> {
    const request = await this.getById(id);
    request.decidedById = actor?.id ?? null;
    return this.move(request, 'rejected', actor, 'Return rejected');
  }

  /** Records a request for more information from the customer.
   * The status does not change; the request is on the timeline
   * and in the audit trail. */
  async requestInfo(
    id: string,
    dto: ReturnNote,
    actor?: AuthPrincipal | null,
  ): Promise<ReturnRequest> {
    const request = await this.getById(id);
    if (request.status !== 'requested' && request.status !== 'under-review') {
      throw new BadRequestException(
        `Return ${id} is ${request.status}; information can only be requested while it is requested or under review`,
      );
    }
    await this.recordEvent(
      request,
      `More information requested: ${dto.note}`,
      actor,
    );
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'return.info-requested',
        entityType: 'return-request',
        entityId: request.id,
        metadata: { orderNumber: request.orderNumber, note: dto.note },
      });
    }
    return request;
  }

  /** Assigns the staff member who will inspect the goods. */
  async assignInspector(
    id: string,
    dto: ReturnAssign,
    actor?: AuthPrincipal | null,
  ): Promise<ReturnRequest> {
    const request = await this.getById(id);
    if (request.status === 'rejected' || request.status === 'completed') {
      throw new BadRequestException(
        `Return ${id} is ${request.status}; it can no longer be assigned`,
      );
    }
    request.assigneeId = dto.assigneeId;
    request.updatedAt = new Date().toISOString();
    await this.returns.save(request);
    await this.recordEvent(
      request,
      `Inspector assigned: ${dto.assigneeId}`,
      actor,
    );
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'return.assigned',
        entityType: 'return-request',
        entityId: request.id,
        metadata: {
          orderNumber: request.orderNumber,
          assigneeId: dto.assigneeId,
        },
      });
    }
    return request;
  }

  /** Records a pickup schedule and moves the return to awaiting
   * pickup. This is a schedule record only: no courier pickup
   * is booked (courier accounts are not configured). */
  async schedulePickup(
    id: string,
    dto: ReturnPickup,
    actor?: AuthPrincipal | null,
  ): Promise<ReturnRequest> {
    const request = await this.getById(id);
    request.pickupScheduledAt = dto.pickupAt;
    return this.move(
      request,
      'awaiting-pickup',
      actor,
      `Pickup scheduled for ${dto.pickupAt} (recorded schedule; no courier booking was made)`,
    );
  }

  async markInTransit(
    id: string,
    actor?: AuthPrincipal | null,
  ): Promise<ReturnRequest> {
    const request = await this.getById(id);
    return this.move(request, 'in-transit', actor, 'Return in transit');
  }

  /** Records that the goods arrived. Nothing restocks here:
   * the units wait for inspection. */
  async recordReceived(
    id: string,
    actor?: AuthPrincipal | null,
  ): Promise<ReturnRequest> {
    const request = await this.getById(id);
    request.receivedAt = new Date().toISOString();
    return this.move(request, 'received', actor, 'Items received');
  }

  async startInspection(
    id: string,
    actor?: AuthPrincipal | null,
  ): Promise<ReturnRequest> {
    const request = await this.getById(id);
    return this.move(request, 'inspection', actor, 'Inspection started');
  }

  /**
   * Completes the inspection. A resellable outcome restocks the
   * received units (allocated across the return lines in order,
   * never more than was received) through the inventory
   * repository; every other outcome leaves sellable stock
   * untouched. The return then moves to refund-pending,
   * exchange-processing or completed, per its resolution.
   */
  async completeInspection(
    id: string,
    dto: ReturnInspectionInput,
    actor?: AuthPrincipal | null,
  ): Promise<ReturnRequest> {
    const request = await this.getById(id);
    if (request.status !== 'inspection' && request.status !== 'received') {
      throw new BadRequestException(
        `Return ${id} is ${request.status}; only a received return under inspection can complete an inspection`,
      );
    }
    if (request.status === 'received') {
      await this.move(request, 'inspection', actor, 'Inspection started');
    }
    request.inspection = {
      condition: dto.condition,
      packaging: dto.packaging ?? null,
      accessories: dto.accessories ?? null,
      quantityReceived: dto.quantityReceived,
      outcome: dto.outcome,
      notes: dto.notes ?? null,
      inspectedById: actor?.id ?? null,
      inspectedAt: new Date().toISOString(),
    };
    if (dto.outcome === 'resellable' && dto.quantityReceived > 0) {
      let remaining = dto.quantityReceived;
      for (const line of request.items) {
        if (remaining <= 0) break;
        if (!line.variantId) continue;
        const units = Math.min(line.quantity, remaining);
        if (units > 0) {
          await this.inventory.adjust(line.variantId, units);
          remaining -= units;
        }
      }
      request.restocked = remaining < dto.quantityReceived;
    }
    await this.returns.save(request);
    const next: ReturnStatus =
      request.resolutionType === 'refund'
        ? request.refundState === 'not-required'
          ? 'completed'
          : 'refund-pending'
        : 'exchange-processing';
    const moved = await this.move(
      request,
      next,
      actor,
      `Inspection completed: ${dto.outcome}, ${dto.quantityReceived} unit(s) received`,
    );
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'return.inspected',
        entityType: 'return-request',
        entityId: request.id,
        metadata: {
          orderNumber: request.orderNumber,
          outcome: dto.outcome,
          quantityReceived: dto.quantityReceived,
          restocked: request.restocked,
        },
      });
    }
    return moved;
  }

  /** Marks the return refunded, but only when the linked
   * Payments refund record itself reads completed: this module
   * never declares money returned on its own. */
  async markRefunded(
    id: string,
    actor?: AuthPrincipal | null,
  ): Promise<ReturnRequest> {
    const request = await this.getById(id);
    if (request.status !== 'refund-pending') {
      throw new BadRequestException(
        `Return ${id} is ${request.status}; only a refund-pending return can be marked refunded`,
      );
    }
    if (!request.refundId) {
      throw new BadRequestException(
        `Return ${id} has no linked refund yet; hand the refund off to Payments first`,
      );
    }
    const attempts = await this.paymentsRepo.listByOrder(request.orderId);
    let refund: { id: string; status: string } | null = null;
    for (const payment of attempts) {
      const refunds = await this.paymentsRepo.listRefundsByPayment(
        payment.id,
      );
      const match = refunds.find((entry) => entry.id === request.refundId);
      if (match) {
        refund = match;
        break;
      }
    }
    if (!refund) {
      throw new BadRequestException(
        `Linked refund ${request.refundId} was not found in Payments`,
      );
    }
    if (refund.status !== 'completed') {
      throw new BadRequestException(
        `Refund ${refund.id} is ${refund.status} in Payments; the return can be marked refunded only when the refund completes`,
      );
    }
    return this.move(request, 'refunded', actor, 'Refund completed in Payments');
  }

  /**
   * Hands the money side to Payments: creates a refund request
   * for the returned value against the order's paid payment.
   * When the order has no paid payment (for example an exchange,
   * or a COD order whose collection never landed), the hand-off
   * records 'not-required' instead of inventing a refund.
   */
  async handOffRefund(
    id: string,
    actor?: AuthPrincipal | null,
  ): Promise<{ request: ReturnRequest; refundId: string | null }> {
    const request = await this.getById(id);
    if (
      request.status !== 'approved' &&
      request.status !== 'refund-pending'
    ) {
      throw new BadRequestException(
        `Return ${id} is ${request.status}; only an approved or refund-pending return can hand off a refund`,
      );
    }
    if (request.refundState === 'handed-off') {
      throw new BadRequestException(
        `Return ${id} already handed off its refund (${request.refundId})`,
      );
    }
    if (request.refundState === 'not-required') {
      return { request, refundId: null };
    }
    const attempts = await this.paymentsRepo.listByOrder(request.orderId);
    const paid = attempts.find(
      (payment) =>
        payment.status === 'successful' || payment.status === 'collected',
    );
    if (!paid) {
      // A collected COD payment is settled by the payments
      // module itself when the order moves to returned (the
      // cash is handed back with the goods), so a fully
      // returned COD order already shows refunded here: the
      // hand-off is complete with nothing left to refund.
      const alreadyRefunded = attempts.find(
        (payment) => payment.status === 'refunded',
      );
      request.refundState = alreadyRefunded
        ? 'handed-off'
        : 'not-required';
      request.updatedAt = new Date().toISOString();
      await this.returns.save(request);
      return { request, refundId: null };
    }
    const refund = await this.payments.requestRefund(
      paid.id,
      {
        amountMinor: request.total.amountMinor,
        reason: `Return ${request.id} for order ${request.orderNumber}`,
      },
      actor,
    );
    request.refundState = 'handed-off';
    request.refundId = refund.id;
    request.updatedAt = new Date().toISOString();
    await this.returns.save(request);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'return.refund-handed-off',
        entityType: 'return-request',
        entityId: request.id,
        metadata: {
          orderNumber: request.orderNumber,
          refundId: refund.id,
          paymentId: paid.id,
          amountMinor: request.total.amountMinor,
        },
      });
    }
    return { request, refundId: refund.id };
  }

  async complete(
    id: string,
    actor?: AuthPrincipal | null,
  ): Promise<ReturnRequest> {
    const request = await this.getById(id);
    const completable =
      request.status === 'refunded' ||
      request.status === 'exchange-processing';
    if (!completable) {
      throw new BadRequestException(
        `Return ${id} is ${request.status}; only a refunded or exchange-processing return can be completed`,
      );
    }
    const moved = await this.move(
      request,
      'completed',
      actor,
      'Return completed',
    );
    // A fully returned order moves to 'returned' in the order
    // flow at completion; a partial return leaves it delivered.
    const order = await this.orders.getByNumber(request.orderNumber);
    if (order.status === 'delivered') {
      const all = await this.returns.list({
        orderNumber: request.orderNumber,
      });
      const covered = new Map<string, number>();
      for (const entry of all) {
        if (entry.status !== 'completed') continue;
        for (const line of entry.items) {
          covered.set(
            line.orderItemId,
            (covered.get(line.orderItemId) ?? 0) + line.quantity,
          );
        }
      }
      const fullyReturned = order.items.every(
        (item) => (covered.get(item.id) ?? 0) >= item.quantity,
      );
      if (fullyReturned) {
        await this.orders.transition(
          order.orderNumber,
          { status: 'returned' },
          actor,
        );
      }
    }
    return moved;
  }
}
