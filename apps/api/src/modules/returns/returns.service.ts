import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  money,
  type ReturnLine,
  type ReturnRequest,
} from '@dostelo/types';
import type { CreateReturn } from '@dostelo/validation';
import type { AuthPrincipal } from '../../common/auth/principal';
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
 * - A request can only be raised against a delivered order, and
 *   only for quantities not already covered by another open or
 *   approved request for the same order lines.
 * - Approval restocks the returned units through the inventory
 *   repository. When the approved requests together cover every
 *   unit of the order, the order itself moves to 'returned'
 *   through the normal order status flow.
 * - The money side is never settled here: the refund hand-off
 *   creates a refund request in Payments against the order's
 *   paid payment, and Payments owns verification and payout.
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
  ) {}

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

  async approve(
    id: string,
    actor?: AuthPrincipal | null,
  ): Promise<ReturnRequest> {
    const request = await this.getById(id);
    if (request.status !== 'requested') {
      throw new BadRequestException(
        `Return ${id} is ${request.status}; only a requested return can be approved`,
      );
    }
    for (const line of request.items) {
      if (line.variantId) {
        await this.inventory.adjust(line.variantId, line.quantity);
      }
    }
    request.restocked = true;
    request.status = 'approved';
    request.decidedById = actor?.id ?? null;
    request.updatedAt = new Date().toISOString();
    await this.returns.save(request);

    // A fully returned order moves to 'returned' in the order
    // flow; a partial return leaves the order delivered.
    const order = await this.orders.getByNumber(request.orderNumber);
    const all = await this.returns.list({
      orderNumber: request.orderNumber,
    });
    const covered = new Map<string, number>();
    for (const entry of all) {
      if (entry.status !== 'approved' && entry.status !== 'completed') {
        continue;
      }
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
    if (fullyReturned && order.status === 'delivered') {
      await this.orders.transition(
        order.orderNumber,
        { status: 'returned' },
        actor,
      );
    }
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'return.approved',
        entityType: 'return-request',
        entityId: request.id,
        metadata: {
          orderNumber: request.orderNumber,
          restocked: true,
          orderReturned: fullyReturned,
        },
      });
    }
    return request;
  }

  async reject(
    id: string,
    actor?: AuthPrincipal | null,
  ): Promise<ReturnRequest> {
    const request = await this.getById(id);
    if (request.status !== 'requested') {
      throw new BadRequestException(
        `Return ${id} is ${request.status}; only a requested return can be rejected`,
      );
    }
    request.status = 'rejected';
    request.decidedById = actor?.id ?? null;
    request.updatedAt = new Date().toISOString();
    await this.returns.save(request);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'return.rejected',
        entityType: 'return-request',
        entityId: request.id,
        metadata: { orderNumber: request.orderNumber },
      });
    }
    return request;
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
    if (request.status !== 'approved') {
      throw new BadRequestException(
        `Return ${id} is ${request.status}; only an approved return can hand off a refund`,
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
    if (request.status !== 'approved') {
      throw new BadRequestException(
        `Return ${id} is ${request.status}; only an approved return can be completed`,
      );
    }
    if (request.refundState === 'none') {
      throw new BadRequestException(
        `Return ${id} still needs its refund hand-off before it can complete`,
      );
    }
    request.status = 'completed';
    request.updatedAt = new Date().toISOString();
    await this.returns.save(request);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'return.completed',
        entityType: 'return-request',
        entityId: request.id,
        metadata: { orderNumber: request.orderNumber },
      });
    }
    return request;
  }
}
