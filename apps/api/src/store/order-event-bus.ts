import { Injectable } from '@nestjs/common';
import type { Order, OrderStatus } from '@dostelo/types';

export interface OrderStatusChangedEvent {
  order: Order;
  from: OrderStatus;
  to: OrderStatus;
}

type OrderStatusListener = (event: OrderStatusChangedEvent) => void;

/**
 * In-process notification that an order changed status.
 *
 * Orders emit after a transition is saved; the payments module
 * subscribes to keep COD payments in step with delivery,
 * cancellation and returns without a circular module import
 * (orders never imports payments). Listeners must not throw:
 * a failing listener is logged and the order flow continues,
 * because the order transition is already committed.
 */
@Injectable()
export class OrderEventBus {
  private readonly listeners = new Set<OrderStatusListener>();

  subscribe(listener: OrderStatusListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: OrderStatusChangedEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Order status listener failed', error);
      }
    }
  }
}
