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

  async create(order: Order): Promise<Order> {
    this.db.orders.set(order.id, order);
    return order;
  }

  async save(order: Order): Promise<void> {
    this.db.orders.set(order.id, order);
  }

  async findById(id: string): Promise<Order | null> {
    return this.db.orders.get(id) ?? null;
  }

  async findByNumber(orderNumber: string): Promise<Order | null> {
    return (
      [...this.db.orders.values()].find(
        (order) => order.orderNumber === orderNumber,
      ) ?? null
    );
  }

  async listByCustomer(customerId: string): Promise<Order[]> {
    return [...this.db.orders.values()]
      .filter((order) => order.customerId === customerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listAll(): Promise<Order[]> {
    return [...this.db.orders.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }

  async countByCustomer(customerId: string): Promise<number> {
    return [...this.db.orders.values()].filter(
      (order) => order.customerId === customerId,
    ).length;
  }

  async addStatusEvent(event: OrderStatusEventRecord): Promise<void> {
    this.db.orderEvents.push(event);
  }

  async listStatusEvents(orderId: string): Promise<OrderStatusEventRecord[]> {
    return this.db.orderEvents.filter((event) => event.orderId === orderId);
  }
}
