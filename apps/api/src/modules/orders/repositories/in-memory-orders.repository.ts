import { Injectable } from '@nestjs/common';
import type { Order } from '@dostelo/types';
import {
  InMemoryDatabase,
  type OrderStatusEventRecord,
} from '../../../store/in-memory.store';
import { OrdersRepository } from './orders.repository';

@Injectable()
export class InMemoryOrdersRepository extends OrdersRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  create(order: Order): Order {
    this.db.orders.set(order.id, order);
    return order;
  }

  save(order: Order): void {
    this.db.orders.set(order.id, order);
  }

  findById(id: string): Order | null {
    return this.db.orders.get(id) ?? null;
  }

  findByNumber(orderNumber: string): Order | null {
    return (
      [...this.db.orders.values()].find(
        (order) => order.orderNumber === orderNumber,
      ) ?? null
    );
  }

  listByCustomer(customerId: string): Order[] {
    return [...this.db.orders.values()]
      .filter((order) => order.customerId === customerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  listAll(): Order[] {
    return [...this.db.orders.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }

  countByCustomer(customerId: string): number {
    return [...this.db.orders.values()].filter(
      (order) => order.customerId === customerId,
    ).length;
  }

  addStatusEvent(event: OrderStatusEventRecord): void {
    this.db.orderEvents.push(event);
  }

  listStatusEvents(orderId: string): OrderStatusEventRecord[] {
    return this.db.orderEvents.filter((event) => event.orderId === orderId);
  }
}
