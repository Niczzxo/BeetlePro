import type { Order } from '@dostelo/types';
import type { OrderStatusEventRecord } from '../../../store/in-memory.store';

/**
 * Order persistence seam. The Prisma implementation will map to the
 * Order, OrderItem, OrderAddress and OrderStatusEvent models and
 * wrap placement plus status changes in transactions.
 */
export abstract class OrdersRepository {
  abstract create(order: Order): Order;
  abstract save(order: Order): void;
  abstract findById(id: string): Order | null;
  abstract findByNumber(orderNumber: string): Order | null;
  abstract listByCustomer(customerId: string): Order[];
  /** Every order, newest first. Staff reads only; the route guard
   * (orders.read) is what keeps this staff-shaped. */
  abstract listAll(): Order[];
  abstract countByCustomer(customerId: string): number;
  abstract addStatusEvent(event: OrderStatusEventRecord): void;
  abstract listStatusEvents(orderId: string): OrderStatusEventRecord[];
}
