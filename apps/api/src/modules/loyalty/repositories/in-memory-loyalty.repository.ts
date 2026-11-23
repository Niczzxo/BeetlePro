import { Injectable } from '@nestjs/common';
import type { LoyaltyTransaction } from '@dostelo/types';
import { InMemoryDatabase } from '../../../store/in-memory.store';
import { LoyaltyRepository } from './loyalty.repository';

@Injectable()
export class InMemoryLoyaltyRepository extends LoyaltyRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async addTransaction(transaction: LoyaltyTransaction): Promise<void> {
    this.db.loyaltyTransactions.push(transaction);
  }

  async listTransactions(
    customerId?: string,
  ): Promise<LoyaltyTransaction[]> {
    return this.db.loyaltyTransactions
      .filter(
        (transaction) =>
          !customerId || transaction.customerId === customerId,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
