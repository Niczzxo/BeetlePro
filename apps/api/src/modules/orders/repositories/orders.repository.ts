import type { Order } from '@dostelo/types';
import type { Tx } from '../../../prisma/prisma.service';
import type { OrderStatusEventRecord } from '../../../store/in-memory.store';

/**
 * Order persistence seam. The Prisma implementation maps to the
 * Order, OrderItem, OrderAddress and OrderStatusEvent models and
 * wraps placement plus status changes in transactions.
 */
export abstract class OrdersRepository {
  abstract create(order: Order, tx?: Tx): Promise<Order>;
  abstract save(order: Order, tx?: Tx): Promise<void>;
  abstract findById(id: string, tx?: Tx): Promise<Order | null>;
  abstract findByNumber(
    orderNumber: string,
    tx?: Tx,
  ): Promise<Order | null>;
  abstract listByCustomer(
    customerId: string,
    tx?: Tx,
  ): Promise<Order[]>;
  /** Every order, newest first. Staff reads only; the route guard
   * (orders.read) is what keeps this staff-shaped. */
  abstract listAll(tx?: Tx): Promise<Order[]>;
  abstract countByCustomer(
    customerId: string,
    tx?: Tx,
  ): Promise<number>;
  abstract addStatusEvent(
    event: OrderStatusEventRecord,
    tx?: Tx,
  ): Promise<void>;
  abstract listStatusEvents(
    orderId: string,
    tx?: Tx,
  ): Promise<OrderStatusEventRecord[]>;
}
