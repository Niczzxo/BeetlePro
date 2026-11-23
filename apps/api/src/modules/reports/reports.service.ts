import { Injectable } from '@nestjs/common';
import type {
  PaymentMethodSplit,
  RecoveryPerformance,
  ReportsSummary,
  SalesByDay,
  TopProduct,
  ZoneSplit,
} from '@dostelo/types';
import { CartRecoveryRepository } from '../cart-recovery/repositories/cart-recovery.repository';
import { OrdersRepository } from '../orders/repositories/orders.repository';
import { PaymentsRepository } from '../payments/repositories/payments.repository';

/**
 * Business reports (admin master structure module 18). Read-only
 * aggregations over the orders, payments and cart recovery
 * repositories; reports own no stored data. Revenue counts
 * orders that were not cancelled, at their recorded totals, in
 * the requested window (default: the last 30 days).
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly payments: PaymentsRepository,
    private readonly recovery: CartRecoveryRepository,
  ) {}

  async summary(range?: {
    from?: string;
    to?: string;
  }): Promise<ReportsSummary> {
    const now = new Date();
    const to = range?.to ? new Date(range.to) : now;
    const from = range?.from
      ? new Date(range.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60_000);
    const fromIso = from.toISOString();
    const toIso = to.toISOString();
    const inWindow = (iso: string) => iso >= fromIso && iso <= toIso;

    const orders = (await this.orders.listAll()).filter(
      (order) => inWindow(order.createdAt) && order.status !== 'cancelled',
    );

    const byDay = new Map<string, SalesByDay>();
    const byProduct = new Map<string, TopProduct>();
    const byZone = new Map<string, ZoneSplit>();
    let revenueMinor = 0;
    for (const order of orders) {
      revenueMinor += order.total.amountMinor;
      const date = order.createdAt.slice(0, 10);
      const day = byDay.get(date) ?? { date, orders: 0, revenueMinor: 0 };
      day.orders += 1;
      day.revenueMinor += order.total.amountMinor;
      byDay.set(date, day);

      const zone = order.address.deliveryZone;
      const zoneRow = byZone.get(zone) ?? {
        zone,
        orders: 0,
        revenueMinor: 0,
      };
      zoneRow.orders += 1;
      zoneRow.revenueMinor += order.total.amountMinor;
      byZone.set(zone, zoneRow);

      for (const item of order.items) {
        const row = byProduct.get(item.productId) ?? {
          productId: item.productId,
          productName: item.productName,
          quantity: 0,
          revenueMinor: 0,
        };
        row.quantity += item.quantity;
        row.revenueMinor += item.lineTotal.amountMinor;
        byProduct.set(item.productId, row);
      }
    }

    const payments = (await this.payments.list({})).filter((payment) =>
      inWindow(payment.createdAt),
    );
    const byMethod = new Map<string, PaymentMethodSplit>();
    for (const payment of payments) {
      const row = byMethod.get(payment.gateway) ?? {
        method: payment.gateway,
        payments: 0,
        amountMinor: 0,
      };
      row.payments += 1;
      row.amountMinor += payment.amount.amountMinor;
      byMethod.set(payment.gateway, row);
    }

    const recoveries = (await this.recovery.list()).filter((entry) =>
      inWindow(entry.createdAt),
    );
    const recovered = recoveries.filter(
      (entry) => entry.status === 'recovered',
    );
    const recovery: RecoveryPerformance = {
      detected: recoveries.length,
      recovered: recovered.length,
      cancelled: recoveries.filter(
        (entry) => entry.status === 'cancelled',
      ).length,
      inProgress: recoveries.filter(
        (entry) => entry.status === 'in-recovery',
      ).length,
      recoveryRatePercent:
        recoveries.length === 0
          ? 0
          : Math.round((recovered.length / recoveries.length) * 1000) / 10,
      recoveredValueMinor: recovered.reduce(
        (sum, entry) => sum + entry.cartTotal.amountMinor,
        0,
      ),
    };

    return {
      from: fromIso,
      to: toIso,
      orderCount: orders.length,
      revenueMinor,
      salesByDay: [...byDay.values()].sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
      topProducts: [...byProduct.values()]
        .sort((a, b) => b.revenueMinor - a.revenueMinor)
        .slice(0, 10),
      zoneSplit: [...byZone.values()].sort(
        (a, b) => b.revenueMinor - a.revenueMinor,
      ),
      paymentSplit: [...byMethod.values()].sort(
        (a, b) => b.amountMinor - a.amountMinor,
      ),
      recovery,
    };
  }
}
