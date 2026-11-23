import { Injectable } from '@nestjs/common';
import {
  LOW_STOCK_THRESHOLD,
  type StaffNotification,
} from '@dostelo/types';
import type { AuthPrincipal } from '../../common/auth/principal';
import { CartRecoveryRepository } from '../cart-recovery/repositories/cart-recovery.repository';
import { CatalogRepository } from '../catalog/repositories/catalog.repository';
import { InventoryRepository } from '../inventory/repositories/inventory.repository';
import { OrdersRepository } from '../orders/repositories/orders.repository';
import { NotificationsRepository } from './repositories/notifications.repository';

const FEED_LIMIT = 50;

/**
 * Staff notifications (admin master structure module 20). The
 * feed is derived at read time from real records: orders still
 * pending, variants at or below the low-stock threshold, and
 * abandoned carts in recovery. Nothing is stored except each
 * staff member's read marks, so the feed can never drift from
 * the underlying state: a fulfilled order simply stops being a
 * pending-order notification.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly notifications: NotificationsRepository,
    private readonly orders: OrdersRepository,
    private readonly inventory: InventoryRepository,
    private readonly catalog: CatalogRepository,
    private readonly recovery: CartRecoveryRepository,
  ) {}

  async feed(
    principal: AuthPrincipal,
  ): Promise<{ items: StaffNotification[]; unread: number }> {
    const derived: Omit<StaffNotification, 'read'>[] = [];

    const orders = await this.orders.listAll();
    for (const order of orders) {
      if (order.status !== 'pending') continue;
      derived.push({
        key: `order:${order.orderNumber}`,
        kind: 'new-order',
        title: `New order ${order.orderNumber}`,
        detail: `${order.items.reduce((sum, item) => sum + item.quantity, 0)} item(s), total ৳${(order.total.amountMinor / 100).toFixed(2)}, awaiting confirmation`,
        href: `/orders/${order.orderNumber}`,
        createdAt: order.createdAt,
      });
    }

    const stock = await this.inventory.listStock();
    const low = stock.filter(
      (record) => record.onHand - record.reserved <= LOW_STOCK_THRESHOLD,
    );
    if (low.length > 0) {
      const products = await this.catalog.listProducts();
      const names = new Map<string, string>();
      for (const product of products) {
        for (const variant of product.variants) {
          names.set(
            variant.id,
            `${product.name} (${variant.name})`,
          );
        }
      }
      for (const record of low) {
        const available = record.onHand - record.reserved;
        derived.push({
          key: `low-stock:${record.variantId}`,
          kind: 'low-stock',
          title:
            available <= 0
              ? `Out of stock: ${names.get(record.variantId) ?? record.variantId}`
              : `Low stock: ${names.get(record.variantId) ?? record.variantId}`,
          detail: `${available} available (${record.onHand} on hand, ${record.reserved} reserved)`,
          href: '/inventory',
          createdAt: new Date().toISOString(),
        });
      }
    }

    const recoveries = await this.recovery.list();
    for (const entry of recoveries) {
      if (entry.status !== 'in-recovery') continue;
      derived.push({
        key: `recovery:${entry.id}`,
        kind: 'recovery-detected',
        title: 'Abandoned cart in recovery',
        detail: `${entry.contactName ?? 'A shopper'} left ৳${(entry.cartTotal.amountMinor / 100).toFixed(2)} in a cart (${entry.itemCount} item(s))`,
        href: `/cart-recovery/${entry.id}`,
        createdAt: entry.detectedAt,
      });
    }

    const reads = await this.notifications.listReads(principal.id);
    const readKeys = new Set(reads.map((record) => record.notificationKey));
    const items = derived
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, FEED_LIMIT)
      .map((item) => ({ ...item, read: readKeys.has(item.key) }));
    return {
      items,
      unread: items.filter((item) => !item.read).length,
    };
  }

  async markRead(
    principal: AuthPrincipal,
    keys: string[],
  ): Promise<{ marked: number }> {
    const marked = await this.notifications.markRead(principal.id, keys);
    return { marked };
  }
}
