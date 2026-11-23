import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import type { StockRecord } from '../../../store/in-memory.store';
import {
  InventoryRepository,
  type StockLine,
} from './inventory.repository';

/**
 * Prisma inventory repository. On-hand stock is
 * ProductVariant.stock; the reserved quantity is derived as the
 * sum of ACTIVE StockReservation rows for the variant, so
 * availability is on-hand minus active reservations, exactly as
 * the in-memory stock map computes it (see
 * docs/PRISMA_MIGRATION.md, schema gap 1). Release and finalize
 * transition the order's reservation rows instead of deleting
 * them, keeping an audit trail of what was held.
 */
@Injectable()
export class PrismaInventoryRepository extends InventoryRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma.client;
  }

  private async reservedFor(
    variantId: string,
    tx?: Tx,
  ): Promise<number> {
    const aggregate = await this.db(tx).stockReservation.aggregate({
      where: { variantId, state: 'ACTIVE' },
      _sum: { quantity: true },
    });
    return aggregate._sum.quantity ?? 0;
  }

  async getStock(
    variantId: string,
    tx?: Tx,
  ): Promise<StockRecord | null> {
    const variant = await this.db(tx).productVariant.findUnique({
      where: { id: variantId },
    });
    if (!variant) return null;
    return {
      productId: variant.productId,
      onHand: variant.stock,
      reserved: await this.reservedFor(variantId, tx),
    };
  }

  async listStock(
    productId?: string,
    tx?: Tx,
  ): Promise<(StockRecord & { variantId: string })[]> {
    const db = this.db(tx);
    const variants = await db.productVariant.findMany({
      where: productId ? { productId } : undefined,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const grouped = await db.stockReservation.groupBy({
      by: ['variantId'],
      where: {
        state: 'ACTIVE',
        variantId: { in: variants.map((variant) => variant.id) },
      },
      _sum: { quantity: true },
    });
    const reservedByVariant = new Map(
      grouped.map((row) => [row.variantId, row._sum.quantity ?? 0]),
    );
    return variants.map((variant) => ({
      variantId: variant.id,
      productId: variant.productId,
      onHand: variant.stock,
      reserved: reservedByVariant.get(variant.id) ?? 0,
    }));
  }

  async adjust(
    variantId: string,
    delta: number,
    tx?: Tx,
  ): Promise<StockRecord> {
    const db = this.db(tx);
    const variant = await db.productVariant.findUnique({
      where: { id: variantId },
    });
    if (!variant) {
      throw new BadRequestException(`Unknown variant: ${variantId}`);
    }
    const reserved = await this.reservedFor(variantId, tx);
    const next = variant.stock + delta;
    if (next < reserved) {
      throw new BadRequestException(
        `Adjustment would drop on-hand below the reserved quantity for variant ${variantId}`,
      );
    }
    const updated = await db.productVariant.update({
      where: { id: variantId },
      data: { stock: next },
    });
    return { productId: updated.productId, onHand: updated.stock, reserved };
  }

  async reserve(
    orderId: string,
    lines: StockLine[],
    tx?: Tx,
  ): Promise<void> {
    const db = this.db(tx);
    // Validate every line before mutating any record.
    for (const line of lines) {
      const record = await this.getStock(line.variantId, tx);
      if (!record) {
        throw new BadRequestException(
          `Unknown variant: ${line.variantId}`,
        );
      }
      const available = record.onHand - record.reserved;
      if (available < line.quantity) {
        throw new BadRequestException(
          `Insufficient stock for variant ${line.variantId}: requested ${line.quantity}, available ${available}`,
        );
      }
    }
    for (const line of lines) {
      await db.stockReservation.create({
        data: {
          orderId,
          variantId: line.variantId,
          quantity: line.quantity,
          state: 'ACTIVE',
        },
      });
    }
  }

  async release(orderId: string, tx?: Tx): Promise<void> {
    await this.db(tx).stockReservation.updateMany({
      where: { orderId, state: 'ACTIVE' },
      data: { state: 'RELEASED' },
    });
  }

  async finalize(orderId: string, tx?: Tx): Promise<void> {
    const db = this.db(tx);
    const active = await db.stockReservation.findMany({
      where: { orderId, state: 'ACTIVE' },
    });
    for (const reservation of active) {
      await db.productVariant.update({
        where: { id: reservation.variantId },
        data: { stock: { decrement: reservation.quantity } },
      });
    }
    await db.stockReservation.updateMany({
      where: { orderId, state: 'ACTIVE' },
      data: { state: 'FINALIZED' },
    });
  }
}
