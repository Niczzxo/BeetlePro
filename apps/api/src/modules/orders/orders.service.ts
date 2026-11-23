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
  ) {}

  getByNumber(orderNumber: string): Order {
    const order = this.orders.findByNumber(orderNumber);
    if (!order) {
      throw new NotFoundException(`Order not found: ${orderNumber}`);
    }
    return order;
  }

  listForCustomer(customerId: string): Order[] {
    return this.orders.listByCustomer(customerId);
  }

  /** Staff order list for the admin portal, newest first, with an
   * optional exact status filter. Guarded at the route by
   * orders.read. */
  listAll(status?: OrderStatus): Order[] {
    const all = this.orders.listAll();
    return status ? all.filter((order) => order.status === status) : all;
  }

  /** Staff order detail with the status event history and the
   * legal next states for the current status. */
  getDetail(orderNumber: string): OrderDetail {
    const order = this.getByNumber(orderNumber);
    return {
      order,
      events: this.orders.listStatusEvents(order.id),
      allowedTransitions: ALLOWED_TRANSITIONS[order.status],
    };
  }

  /**
   * Applies a status transition after checking the flow policy.
   * Records an OrderStatusEvent for every accepted move, releases
   * the stock reservation on cancellation and settles it on
   * delivery.
   */
  transition(
    orderNumber: string,
    dto: OrderStatusTransition,
    actor?: AuthPrincipal | null,
  ): Order {
    const order = this.getByNumber(orderNumber);
    if (!canTransition(order.status, dto.status)) {
      throw new BadRequestException(
        `Cannot move order ${orderNumber} from ${order.status} to ${dto.status}`,
      );
    }
    const previousStatus = order.status;
    order.status = dto.status;
    order.updatedAt = new Date().toISOString();
    this.orders.save(order);
    this.orders.addStatusEvent({
      id: randomUUID(),
      orderId: order.id,
      status: dto.status,
      note: dto.note ?? null,
      actorId: actor?.id ?? dto.actorId ?? null,
      createdAt: order.updatedAt,
    });
    if (dto.status === 'cancelled') {
      this.inventory.release(order.id);
    }
    if (dto.status === 'delivered') {
      this.inventory.finalize(order.id);
    }
    // Notify subscribers (payments keeps COD in step with the
    // order) only after the transition is fully committed.
    this.bus?.emit({ order, from: previousStatus, to: dto.status });
    if (actor && this.audit) {
      this.audit.recordForPrincipal(actor, {
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
