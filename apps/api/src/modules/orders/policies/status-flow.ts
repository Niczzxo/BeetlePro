import type { OrderStatus } from '@dostelo/types';

/**
 * Order status flow across the 10 statuses from the admin master
 * structure. Rules:
 *
 * - Fulfilment moves forward one stage at a time.
 * - Cancellation is allowed only before the order ships.
 * - Delivered is final except for a return.
 * - Cancelled and returned are terminal.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['packed', 'cancelled'],
  packed: ['ready-to-ship', 'cancelled'],
  'ready-to-ship': ['shipped', 'cancelled'],
  shipped: ['out-for-delivery'],
  'out-for-delivery': ['delivered'],
  delivered: ['returned'],
  cancelled: [],
  returned: [],
};

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
