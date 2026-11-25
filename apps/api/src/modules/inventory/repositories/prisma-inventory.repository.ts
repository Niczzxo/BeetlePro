import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import type {
  StockMovement,
  StockMovementFilter,
  StockRecord,
} from '../../../store/in-memory.store';
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

  /** Appends one movement to the ledger inside the caller's
   * transaction, so a stock change and its record commit or
   * roll back together. */
  private async recordMovement(
    movement: Omit<StockMovement, 'id' | 'createdAt'>,
    tx?: Tx,
  ): Promise<void> {
    await this.db(tx).stockMovement.create({
      data: {
        id: randomUUID(),
        variantId: movement.variantId,
        productId: movement.productId,
        type: movement.type,
        deltaOnHand: movement.deltaOnHand,
        deltaReserved: movement.deltaReserved,
        onHandAfter: movement.onHandAfter,
        reservedAfter: movement.reservedAfter,
        reference: movement.reference,
      },
    });
  }

  async listMovements(
    filter: StockMovementFilter,
    tx?: Tx,
  ): Promise<StockMovement[]> {
    const rows = await this.db(tx).stockMovement.findMany({
      where: {
        variantId: filter.variantId,
        productId: filter.productId,
        createdAt: {
          gte: filter.from ? new Date(filter.from) : undefined,
          lte: filter.to ? new Date(filter.to) : undefined,
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: filter.limit ?? 500,
    });
    return rows.map((row) => ({
      id: row.id,
      variantId: row.variantId,
      productId: row.productId,
      type: row.type as StockMovement['type'],
      deltaOnHand: row.deltaOnHand,
      deltaReserved: row.deltaReserved,
      onHandAfter: row.onHandAfter,
      reservedAfter: row.reservedAfter,
      reference: row.reference,
      createdAt: row.createdAt.toISOString(),
    }));
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
    await this.recordMovement(
      {
        variantId,
        productId: updated.productId,
        type: 'adjustment',
        deltaOnHand: delta,
        deltaReserved: 0,
        onHandAfter: updated.stock,
        reservedAfter: reserved,
        reference: null,
      },
      tx,
    );
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
      const record = await this.getStock(line.variantId, tx);
      if (record) {
        await this.recordMovement(
          {
            variantId: line.variantId,
            productId: record.productId,
            type: 'reserve',
            deltaOnHand: 0,
            deltaReserved: line.quantity,
            onHandAfter: record.onHand,
            reservedAfter: record.reserved,
            reference: orderId,
          },
          tx,
        );
      }
    }
  }

  async release(orderId: string, tx?: Tx): Promise<void> {
    const db = this.db(tx);
    const active = await db.stockReservation.findMany({
      where: { orderId, state: 'ACTIVE' },
    });
    await db.stockReservation.updateMany({
      where: { orderId, state: 'ACTIVE' },
      data: { state: 'RELEASED' },
    });
    for (const reservation of active) {
      const record = await this.getStock(reservation.variantId, tx);
      if (record) {
        await this.recordMovement(
          {
            variantId: reservation.variantId,
            productId: record.productId,
            type: 'release',
            deltaOnHand: 0,
            deltaReserved: -reservation.quantity,
            onHandAfter: record.onHand,
            reservedAfter: record.reserved,
            reference: orderId,
          },
          tx,
        );
      }
    }
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
    for (const reservation of active) {
      const record = await this.getStock(reservation.variantId, tx);
      if (record) {
        await this.recordMovement(
          {
            variantId: reservation.variantId,
            productId: record.productId,
            type: 'finalize',
            deltaOnHand: -reservation.quantity,
            deltaReserved: -reservation.quantity,
            onHandAfter: record.onHand,
            reservedAfter: record.reserved,
            reference: orderId,
          },
          tx,
        );
      }
    }
  }
}
