import { Injectable } from '@nestjs/common';
import type { LoyaltyTransaction as TxRow } from '@prisma/client';
import type { LoyaltyTransaction } from '@dostelo/types';
import { iso } from '../../../prisma/prisma.helpers';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import { LoyaltyRepository } from './loyalty.repository';

function toDomain(row: TxRow): LoyaltyTransaction {
  return {
    id: row.id,
    customerId: row.customerId,
    delta: row.delta,
    reason: row.reason,
    orderId: row.orderId,
    createdById: row.createdById,
    createdAt: iso(row.createdAt),
  };
}

/** Prisma loyalty repository over the LoyaltyTransaction model. */
@Injectable()
export class PrismaLoyaltyRepository extends LoyaltyRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma.client;
  }

  async addTransaction(
    transaction: LoyaltyTransaction,
    tx?: Tx,
  ): Promise<void> {
    await this.db(tx).loyaltyTransaction.create({
      data: {
        id: transaction.id,
        customerId: transaction.customerId,
        delta: transaction.delta,
        reason: transaction.reason,
        orderId: transaction.orderId,
        createdById: transaction.createdById,
      },
    });
  }

  async listTransactions(
    customerId?: string,
    tx?: Tx,
  ): Promise<LoyaltyTransaction[]> {
    const rows = await this.db(tx).loyaltyTransaction.findMany({
      where: customerId ? { customerId } : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toDomain);
  }
}
