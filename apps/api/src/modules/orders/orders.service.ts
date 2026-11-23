import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Order, OrderStatus } from '@dostelo/types';
import type { OrderStatusTransition } from '@dostelo/validation';
import { InventoryRepository } from '../inventory/repositories/inventory.repository';
import { AuditService } from '../audit/audit.service';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  NoopTransactionRunner,
  TransactionRunner,
} from '../../prisma/transaction-runner';
import { OrderEventBus } from '../../store/order-event-bus';
import type { OrderStatusEventRecord } from '../../store/in-memory.store';
import { ALLOWED_TRANSITIONS, canTransition } from './policies/status-flow';
import { OrdersRepository } from './repositories/orders.repository';

/** Staff order detail: the order, its recorded status history and
 * the legal next states from the flow policy, so the admin portal
 * never has to re-derive the flow rules client-side. */
export interface OrderDetail {
  order: Order;
  events: OrderStatusEventRecord[];
  allowedTransitions: OrderStatus[];
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly inventory: InventoryRepository,
    @Optional() private readonly bus?: OrderEventBus,
    @Optional() private readonly audit?: AuditService,
    @Optional()
    private readonly transactions: TransactionRunner = new NoopTransactionRunner(),
  ) {}

  async getByNumber(orderNumber: string): Promise<Order> {
    const order = await this.orders.findByNumber(orderNumber);
    if (!order) {
      throw new NotFoundException(`Order not found: ${orderNumber}`);
    }
    return order;
  }

  async listForCustomer(customerId: string): Promise<Order[]> {
    return this.orders.listByCustomer(customerId);
  }

  /** Staff order list for the admin portal, newest first, with an
   * optional exact status filter. Guarded at the route by
   * orders.read. */
  async listAll(status?: OrderStatus): Promise<Order[]> {
    const all = await this.orders.listAll();
    return status ? all.filter((order) => order.status === status) : all;
  }

  /** Staff order detail with the status event history and the
   * legal next states for the current status. */
  async getDetail(orderNumber: string): Promise<OrderDetail> {
    const order = await this.getByNumber(orderNumber);
    return {
      order,
      events: await this.orders.listStatusEvents(order.id),
      allowedTransitions: ALLOWED_TRANSITIONS[order.status],
    };
  }

  /**
   * Applies a status transition after checking the flow policy.
   * Records an OrderStatusEvent for every accepted move, releases
   * the stock reservation on cancellation and settles it on
   * delivery. The order save, the status event and the inventory
   * effect commit in one transaction (docs/PRISMA_MIGRATION.md);
   * subscribers are notified only after the commit.
   */
  async transition(
    orderNumber: string,
    dto: OrderStatusTransition,
    actor?: AuthPrincipal | null,
  ): Promise<Order> {
    const order = await this.getByNumber(orderNumber);
    if (!canTransition(order.status, dto.status)) {
      throw new BadRequestException(
        `Cannot move order ${orderNumber} from ${order.status} to ${dto.status}`,
      );
    }
    const previousStatus = order.status;
    order.status = dto.status;
    order.updatedAt = new Date().toISOString();
    await this.transactions.run(async (tx) => {
      await this.orders.save(order, tx);
      await this.orders.addStatusEvent(
        {
          id: randomUUID(),
          orderId: order.id,
          status: dto.status,
          note: dto.note ?? null,
          actorId: actor?.id ?? dto.actorId ?? null,
          createdAt: order.updatedAt,
        },
        tx,
      );
      if (dto.status === 'cancelled') {
        await this.inventory.release(order.id, tx);
      }
      if (dto.status === 'delivered') {
        await this.inventory.finalize(order.id, tx);
      }
    });
    // Notify subscribers (payments keeps COD in step with the
    // order) only after the transition is fully committed.
    await this.bus?.emit({ order, from: previousStatus, to: dto.status });
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'order.status.transition',
        entityType: 'order',
        entityId: order.id,
        metadata: {
          orderNumber: order.orderNumber,
          from: previousStatus,
          to: dto.status,
          note: dto.note ?? null,
        },
      });
    }
    return order;
  }
}
