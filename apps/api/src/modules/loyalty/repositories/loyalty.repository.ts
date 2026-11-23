import type { LoyaltyTransaction } from '@dostelo/types';
import type { Tx } from '../../../prisma/prisma.service';

/**
 * Loyalty persistence seam: staff point adjustments only. Earned
 * points are derived from delivered orders by the service and
 * are never stored, so this seam has no balance writes.
 */
export abstract class LoyaltyRepository {
  abstract addTransaction(
    transaction: LoyaltyTransaction,
    tx?: Tx,
  ): Promise<void>;
  abstract listTransactions(
    customerId?: string,
    tx?: Tx,
  ): Promise<LoyaltyTransaction[]>;
}
