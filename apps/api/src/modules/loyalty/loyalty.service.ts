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
} from '@dostelo/types';
import type {
  LoyaltyAdjust,
  LoyaltyRulesUpdate,
} from '@dostelo/validation';
import type { AuthPrincipal } from '../../common/auth/principal';
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
  ) {}

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
    const earnedPoints = Math.floor(
      deliveredSpendMinor / 100 / rules.takaPerPoint,
    );
    const transactions = await this.loyalty.listTransactions(customerId);
    const adjustmentPoints = transactions.reduce(
      (sum, transaction) => sum + transaction.delta,
      0,
    );
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
