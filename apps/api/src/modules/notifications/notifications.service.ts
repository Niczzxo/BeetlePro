import { Injectable, Optional } from '@nestjs/common';
import {
  LOW_STOCK_THRESHOLD,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_KIND_CATEGORY,
  type NotificationCategory,
  type NotificationPreference,
  type PermissionKey,
  type StaffNotification,
} from '@dostelo/types';
import type { AuthPrincipal } from '../../common/auth/principal';
import { AutomationExecutionsRepository } from '../../store/automation-executions.repository';
import { CartRecoveryRepository } from '../cart-recovery/repositories/cart-recovery.repository';
import { CatalogRepository } from '../catalog/repositories/catalog.repository';
import { InventoryRepository } from '../inventory/repositories/inventory.repository';
import { LeadsRepository } from '../leads/repositories/leads.repository';
import { OrdersRepository } from '../orders/repositories/orders.repository';
import { PaymentsRepository } from '../payments/repositories/payments.repository';
import { SupportRepository } from '../support/repositories/support.repository';
import { NotificationsRepository } from './repositories/notifications.repository';

const FEED_LIMIT = 200;

/** Which permission lets a staff member see a category. A feed
 * never shows a category the API would forbid elsewhere. */
const CATEGORY_PERMISSIONS: Record<NotificationCategory, PermissionKey> = {
  inventory: 'inventory.read',
  orders: 'orders.read',
  customers: 'customers.read',
  marketing: 'marketing.read',
  system: 'settings.manage',
};

/**
 * Staff notifications (admin master structure module 20). The
 * feed is derived at read time from real records: pending
 * orders, failed payments, variants at or below the low-stock
 * threshold (out of stock is its own kind, never double
 * counted as low stock), abandoned carts in recovery,
 * high-intent leads, open support tickets and failed automation
 * executions. Nothing is stored except each staff member's read
 * marks, hidden keys and category preferences, so the feed can
 * never drift from the underlying state: a fulfilled order
 * simply stops being a pending-order notification, and a stock
 * alert resolves itself when stock recovers.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly notifications: NotificationsRepository,
    private readonly orders: OrdersRepository,
    private readonly inventory: InventoryRepository,
    private readonly catalog: CatalogRepository,
    private readonly recovery: CartRecoveryRepository,
    @Optional() private readonly payments?: PaymentsRepository,
    @Optional() private readonly leads?: LeadsRepository,
    @Optional() private readonly support?: SupportRepository,
    @Optional() private readonly executions?: AutomationExecutionsRepository,
  ) {}

  async feed(
    principal: AuthPrincipal,
  ): Promise<{ items: StaffNotification[]; unread: number }> {
    const derived: Omit<StaffNotification, 'read'>[] = [];
    const push = (
      item: Omit<StaffNotification, 'read' | 'category' | 'productId'> & {
        productId?: string | null;
      },
    ) => {
      derived.push({
        ...item,
        category: NOTIFICATION_KIND_CATEGORY[item.kind],
        productId: item.productId ?? null,
      });
    };

    const orders = await this.orders.listAll();
    for (const order of orders) {
      if (order.status !== 'pending') continue;
      push({
        key: `order:${order.orderNumber}`,
        kind: 'new-order',
        title: `New order ${order.orderNumber}`,
        detail: `${order.items.reduce((sum, item) => sum + item.quantity, 0)} item(s), total ৳${(order.total.amountMinor / 100).toFixed(2)}, awaiting confirmation`,
        href: `/orders/${order.orderNumber}`,
        createdAt: order.createdAt,
      });
    }

    if (this.payments) {
      const failed = await this.payments.list({ status: 'failed' });
      for (const payment of failed.slice(0, 25)) {
        push({
          key: `payment-failed:${payment.id}`,
          kind: 'payment-failed',
          title: `Payment failed (${payment.gateway})`,
          detail: `A ${payment.gateway} payment of ৳${(payment.amount.amountMinor / 100).toFixed(2)} is recorded failed.`,
          href: `/payments/${payment.id}`,
          createdAt: payment.updatedAt,
        });
      }
    }

    const stock = await this.inventory.listStock();
    const low = stock.filter(
      (record) => record.onHand - record.reserved <= LOW_STOCK_THRESHOLD,
    );
    if (low.length > 0) {
      const products = await this.catalog.listProducts();
      const names = new Map<string, string>();
      const productIds = new Map<string, string>();
      for (const product of products) {
        for (const variant of product.variants) {
          names.set(variant.id, `${product.name} (${variant.name})`);
          productIds.set(variant.id, product.id);
        }
      }
      for (const record of low) {
        const available = record.onHand - record.reserved;
        const out = available <= 0;
        push({
          key: `${out ? 'out-of-stock' : 'low-stock'}:${record.variantId}`,
          kind: out ? 'out-of-stock' : 'low-stock',
          title: out
            ? `Out of stock: ${names.get(record.variantId) ?? record.variantId}`
            : `Low stock: ${names.get(record.variantId) ?? record.variantId}`,
          detail: `${available} available (${record.onHand} on hand, ${record.reserved} reserved)`,
          href: '/inventory',
          createdAt: new Date().toISOString(),
          productId: productIds.get(record.variantId) ?? null,
        });
      }
    }

    const recoveries = await this.recovery.list();
    for (const entry of recoveries) {
      if (entry.status !== 'in-recovery') continue;
      push({
        key: `recovery:${entry.id}`,
        kind: 'recovery-detected',
        title: 'Abandoned cart in recovery',
        detail: `${entry.contactName ?? 'A shopper'} left ৳${(entry.cartTotal.amountMinor / 100).toFixed(2)} in a cart (${entry.itemCount} item(s))`,
        href: `/cart-recovery/${entry.id}`,
        createdAt: entry.detectedAt,
      });
    }

    if (this.leads) {
      const leads = await this.leads.list();
      for (const lead of leads) {
        if ((lead.score ?? 0) < 70 || lead.optedOut) continue;
        if (lead.status === 'converted' || lead.status === 'lost') continue;
        push({
          key: `lead-high-intent:${lead.id}`,
          kind: 'lead-high-intent',
          title: `High-intent lead (score ${lead.score})`,
          detail: `${lead.fullName ?? 'An identified buyer'} reached a hot lead score and is ${lead.status}.`,
          href: `/leads`,
          createdAt: lead.updatedAt,
        });
      }
    }

    if (this.support) {
      const tickets = await this.support.list({ status: 'open' });
      for (const ticket of tickets.slice(0, 25)) {
        push({
          key: `support-ticket:${ticket.id}`,
          kind: 'support-ticket',
          title: `Support ticket: ${ticket.subject}`,
          detail: `From ${ticket.customerName}, priority ${ticket.priority}, still open.`,
          href: '/support',
          createdAt: ticket.createdAt,
        });
      }
    }

    if (this.executions) {
      const failedRuns = await this.executions.list({
        status: 'failed',
        limit: 25,
      });
      for (const run of failedRuns) {
        push({
          key: `automation-failed:${run.id}`,
          kind: 'automation-failed',
          title: `Automation failed: ${run.workflowKey}`,
          detail: run.detail,
          href: '/automation',
          createdAt: run.completedAt,
        });
      }
    }

    // RBAC: categories the staff member cannot open elsewhere
    // do not appear in their feed. Preferences then narrow the
    // feed further, per admin.
    const permitted = derived.filter((item) => {
      if (!principal.permissions || principal.permissions.length === 0) {
        return true;
      }
      return principal.permissions.includes(
        CATEGORY_PERMISSIONS[item.category],
      );
    });
    const preference = await this.getPreferences(principal);
    const wanted = new Set(preference.categories);
    const visible = permitted.filter((item) => wanted.has(item.category));

    const reads = await this.notifications.listReads(principal.id);
    const readKeys = new Set(
      reads.filter((record) => !record.hidden).map((r) => r.notificationKey),
    );
    const hiddenKeys = new Set(
      reads.filter((record) => record.hidden).map((r) => r.notificationKey),
    );
    const items = visible
      .filter((item) => !hiddenKeys.has(item.key))
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

  async markUnread(
    principal: AuthPrincipal,
    keys: string[],
  ): Promise<{ marked: number }> {
    const marked = await this.notifications.markUnread(principal.id, keys);
    return { marked };
  }

  async hide(
    principal: AuthPrincipal,
    keys: string[],
  ): Promise<{ marked: number }> {
    const marked = await this.notifications.markHidden(principal.id, keys);
    return { marked };
  }

  async getPreferences(
    principal: AuthPrincipal,
  ): Promise<NotificationPreference> {
    const stored = await this.notifications.getPreference(principal.id);
    if (stored) return stored;
    return {
      adminUserId: principal.id,
      categories: [...NOTIFICATION_CATEGORIES],
      emailEnabled: false,
    };
  }

  async savePreferences(
    principal: AuthPrincipal,
    dto: { categories: NotificationCategory[]; emailEnabled: boolean },
  ): Promise<NotificationPreference> {
    const preference: NotificationPreference = {
      adminUserId: principal.id,
      categories: dto.categories,
      emailEnabled: dto.emailEnabled,
    };
    await this.notifications.savePreference(preference);
    return preference;
  }
}
