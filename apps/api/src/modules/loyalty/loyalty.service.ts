import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  money,
  type LoyaltyBalance,
  type LoyaltyRules,
  type LoyaltyTransaction,
  type Order,
  type PointsRule,
  type ProductReview,
} from '@dostelo/types';
import type {
  LoyaltyAdjust,
  LoyaltyRulesUpdate,
  PointsRuleUpsert,
} from '@dostelo/validation';
import type { AuthPrincipal } from '../../common/auth/principal';
import {
  OrderEventBus,
  type OrderStatusChangedEvent,
} from '../../store/order-event-bus';
import { SettingsRepository } from '../../store/settings.repository';
import { AuditService } from '../audit/audit.service';
import { CustomersRepository } from '../customers/repositories/customers.repository';
import { OrdersRepository } from '../orders/repositories/orders.repository';
import { LoyaltyRepository } from './repositories/loyalty.repository';

/**
 * Loyalty points (admin master structure module 17). Balances
 * are derived: earned points come from the customer's delivered
 * order total at the stored earn rate, and staff adjustments are
 * stored transactions. Nothing stores a balance, so the figures
 * always reconcile against orders and the adjustment log.
 * Redemption at checkout does not exist in the platform; staff
 * record a redemption as a negative adjustment with its reason.
 */
@Injectable()
export class LoyaltyService {
  constructor(
    private readonly loyalty: LoyaltyRepository,
    private readonly orders: OrdersRepository,
    private readonly customers: CustomersRepository,
    private readonly settings: SettingsRepository,
    @Optional() private readonly audit?: AuditService,
    @Optional() bus?: OrderEventBus,
  ) {
    bus?.subscribe((event) => this.handleOrderStatusChanged(event));
  }

  // ------------------------------------------------------------------
  // Points rules and event awards (Loyalty redesign)
  // ------------------------------------------------------------------

  async listPointRules(): Promise<PointsRule[]> {
    const settings = await this.settings.get();
    return settings.loyaltyPointRules;
  }

  async upsertPointRule(
    dto: PointsRuleUpsert,
    actor?: AuthPrincipal | null,
  ): Promise<PointsRule[]> {
    const settings = await this.settings.get();
    const rule: PointsRule = {
      id: dto.id ?? `rule-${dto.activity}-${randomUUID().slice(0, 8)}`,
      activity: dto.activity,
      calculation: dto.calculation,
      points: dto.points,
      perAmountTaka: dto.perAmountTaka ?? null,
      minOrderMinor: dto.minOrderMinor ?? null,
      maxPointsPerOrder: dto.maxPointsPerOrder ?? null,
      active: dto.active,
    };
    const existing = settings.loyaltyPointRules.findIndex(
      (item) => item.id === rule.id,
    );
    if (existing >= 0) settings.loyaltyPointRules[existing] = rule;
    else settings.loyaltyPointRules.push(rule);
    await this.settings.save(settings);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'loyalty.point-rule-saved',
        entityType: 'loyalty-rule',
        entityId: rule.id,
        metadata: { activity: rule.activity, active: rule.active },
      });
    }
    return settings.loyaltyPointRules;
  }

  private async activeRule(
    activity: PointsRule['activity'],
  ): Promise<PointsRule | null> {
    const settings = await this.settings.get();
    return (
      settings.loyaltyPointRules.find(
        (rule) => rule.activity === activity && rule.active,
      ) ?? null
    );
  }

  private async hasTransaction(
    customerId: string,
    referenceKey: string,
  ): Promise<LoyaltyTransaction | null> {
    const transactions = await this.loyalty.listTransactions(customerId);
    return (
      transactions.find((item) => item.referenceKey === referenceKey) ?? null
    );
  }

  /** Order lifecycle hook: delivered awards, returned reverses. */
  async handleOrderStatusChanged(
    event: OrderStatusChangedEvent,
  ): Promise<void> {
    if (event.to === 'delivered') {
      await this.awardForOrder(event.order);
    } else if (event.to === 'returned') {
      await this.reverseForOrder(event.order);
    }
  }

  /**
   * Award the completed-order rule for a delivered order.
   * Idempotent per order: the reference key is checked before
   * writing, so a redelivered event never awards twice. Points
   * are never awarded on placed or paid, only on delivered.
   */
  async awardForOrder(order: Order): Promise<void> {
    if (!order.customerId) return;
    const rule = await this.activeRule('completed-order');
    if (!rule) return;
    const referenceKey = `order:${order.id}`;
    if (await this.hasTransaction(order.customerId, referenceKey)) return;
    if (
      rule.minOrderMinor !== null &&
      order.total.amountMinor < rule.minOrderMinor
    ) {
      return;
    }
    let points = rule.points;
    if (rule.calculation === 'per-amount') {
      const perAmount = rule.perAmountTaka ?? 100;
      points =
        Math.floor(order.total.amountMinor / 100 / perAmount) * rule.points;
    }
    if (rule.maxPointsPerOrder !== null) {
      points = Math.min(points, rule.maxPointsPerOrder);
    }
    if (points <= 0) return;
    await this.loyalty.addTransaction({
      id: randomUUID(),
      customerId: order.customerId,
      delta: points,
      reason: `Points for delivered order ${order.orderNumber}`,
      orderId: order.id,
      type: 'earned-order',
      referenceKey,
      createdById: null,
      createdAt: new Date().toISOString(),
    });
  }

  /** Reverse an order's earned points (refund or return). */
  async reverseForOrder(order: Order): Promise<void> {
    if (!order.customerId) return;
    const award = await this.hasTransaction(
      order.customerId,
      `order:${order.id}`,
    );
    if (!award || award.type !== 'earned-order') return;
    const reversalKey = `order:${order.id}:reversal`;
    if (await this.hasTransaction(order.customerId, reversalKey)) return;
    await this.loyalty.addTransaction({
      id: randomUUID(),
      customerId: order.customerId,
      delta: -award.delta,
      reason: `Reversal of points for returned order ${order.orderNumber}`,
      orderId: order.id,
      type: 'reversal',
      referenceKey: reversalKey,
      createdById: null,
      createdAt: new Date().toISOString(),
    });
  }

  /** Award the verified-review rule when a verified review is
   * published. Idempotent per review. */
  async awardForReview(review: ProductReview): Promise<void> {
    if (!review.customerId || !review.verified) return;
    const rule = await this.activeRule('verified-review');
    if (!rule) return;
    const referenceKey = `review:${review.id}`;
    if (await this.hasTransaction(review.customerId, referenceKey)) return;
    await this.loyalty.addTransaction({
      id: randomUUID(),
      customerId: review.customerId,
      delta: rule.points,
      reason: 'Points for a verified product review',
      orderId: null,
      type: 'earned-review',
      referenceKey,
      createdById: null,
      createdAt: new Date().toISOString(),
    });
  }

  /** Every ledger transaction, newest first (portal table). */
  async listAllTransactions(): Promise<LoyaltyTransaction[]> {
    return this.loyalty.listTransactions();
  }

  async getRules(): Promise<LoyaltyRules> {
    const settings = await this.settings.get();
    return settings.loyaltyRules;
  }

  async updateRules(
    dto: LoyaltyRulesUpdate,
    actor?: AuthPrincipal | null,
  ): Promise<LoyaltyRules> {
    const settings = await this.settings.get();
    settings.loyaltyRules = {
      takaPerPoint: dto.takaPerPoint,
      pointValueMinor: dto.pointValueMinor,
    };
    await this.settings.save(settings);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'loyalty.rules-updated',
        entityType: 'settings',
        entityId: 'loyalty-rules',
        metadata: { ...settings.loyaltyRules },
      });
    }
    return settings.loyaltyRules;
  }

  async balanceFor(customerId: string): Promise<LoyaltyBalance> {
    const customer = await this.customers.findById(customerId);
    if (!customer) {
      throw new NotFoundException(`Customer not found: ${customerId}`);
    }
    const rules = await this.getRules();
    const orders = await this.orders.listByCustomer(customerId);
    const deliveredSpendMinor = orders
      .filter((order) => order.status === 'delivered')
      .reduce((sum, order) => sum + order.total.amountMinor, 0);
    const transactions = await this.loyalty.listTransactions(customerId);
    // Earned points are the ledger's earned entries plus their
    // reversals; adjustments are staff entries (grants,
    // redemptions recorded by staff, expiries). The ledger
    // starts with the rules engine: orders delivered before it
    // have no award entries and earn nothing retroactively.
    const earnedPoints = transactions
      .filter(
        (transaction) =>
          transaction.type.startsWith('earned') ||
          transaction.type === 'reversal',
      )
      .reduce((sum, transaction) => sum + transaction.delta, 0);
    const adjustmentPoints = transactions
      .filter(
        (transaction) =>
          !transaction.type.startsWith('earned') &&
          transaction.type !== 'reversal',
      )
      .reduce((sum, transaction) => sum + transaction.delta, 0);
    const balancePoints = earnedPoints + adjustmentPoints;
    return {
      customerId,
      customerName: customer.fullName,
      deliveredSpend: money(deliveredSpendMinor),
      earnedPoints,
      adjustmentPoints,
      balancePoints,
      balanceValue: money(balancePoints * rules.pointValueMinor),
    };
  }

  async listBalances(): Promise<LoyaltyBalance[]> {
    const customers = await this.customers.list();
    const balances: LoyaltyBalance[] = [];
    for (const customer of customers) {
      balances.push(await this.balanceFor(customer.id));
    }
    return balances.sort((a, b) => b.balancePoints - a.balancePoints);
  }

  async listTransactions(
    customerId: string,
  ): Promise<LoyaltyTransaction[]> {
    const customer = await this.customers.findById(customerId);
    if (!customer) {
      throw new NotFoundException(`Customer not found: ${customerId}`);
    }
    return this.loyalty.listTransactions(customerId);
  }

  async adjust(
    customerId: string,
    dto: LoyaltyAdjust,
    actor?: AuthPrincipal | null,
  ): Promise<LoyaltyBalance> {
    const before = await this.balanceFor(customerId);
    if (before.balancePoints + dto.delta < 0) {
      throw new BadRequestException(
        `Adjustment of ${dto.delta} would take the balance below zero (current balance ${before.balancePoints})`,
      );
    }
    const transaction: LoyaltyTransaction = {
      id: randomUUID(),
      customerId,
      delta: dto.delta,
      reason: dto.reason,
      orderId: dto.orderId ?? null,
      type: 'adjusted',
      referenceKey: null,
      createdById: actor?.id ?? null,
      createdAt: new Date().toISOString(),
    };
    await this.loyalty.addTransaction(transaction);
    if (actor && this.audit) {
      await this.audit.recordForPrincipal(actor, {
        action: 'loyalty.adjusted',
        entityType: 'customer',
        entityId: customerId,
        metadata: {
          delta: dto.delta,
          reason: dto.reason,
          transactionId: transaction.id,
        },
      });
    }
    return this.balanceFor(customerId);
  }
}
