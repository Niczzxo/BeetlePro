import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  InMemoryDatabase,
  type StockMovement,
  type StockMovementFilter,
  type StockRecord,
} from '../../../store/in-memory.store';
import {
  InventoryRepository,
  type StockLine,
} from './inventory.repository';

@Injectable()
export class InMemoryInventoryRepository extends InventoryRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  private record(
    movement: Omit<StockMovement, 'id' | 'createdAt'>,
  ): void {
    this.db.stockMovements.push({
      ...movement,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    });
  }

  async listMovements(
    filter: StockMovementFilter,
  ): Promise<StockMovement[]> {
    return this.db.stockMovements
      .filter((movement) => {
        if (filter.variantId && movement.variantId !== filter.variantId) {
          return false;
        }
        if (filter.productId && movement.productId !== filter.productId) {
          return false;
        }
        if (filter.from && movement.createdAt < filter.from) return false;
        if (filter.to && movement.createdAt > filter.to) return false;
        return true;
      })
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, filter.limit ?? 500);
  }

  async getStock(variantId: string): Promise<StockRecord | null> {
    return this.db.stock.get(variantId) ?? null;
  }

  async listStock(
    productId?: string,
  ): Promise<(StockRecord & { variantId: string })[]> {
    return [...this.db.stock.entries()]
      .filter(([, record]) => !productId || record.productId === productId)
      .map(([variantId, record]) => ({ variantId, ...record }));
  }

  async adjust(variantId: string, delta: number): Promise<StockRecord> {
    const record = this.db.stock.get(variantId);
    if (!record) {
      throw new BadRequestException(`Unknown variant: ${variantId}`);
    }
    const next = record.onHand + delta;
    if (next < record.reserved) {
      throw new BadRequestException(
        `Adjustment would drop on-hand below the reserved quantity for variant ${variantId}`,
      );
    }
    record.onHand = next;
    this.record({
      variantId,
      productId: record.productId,
      type: 'adjustment',
      deltaOnHand: delta,
      deltaReserved: 0,
      onHandAfter: record.onHand,
      reservedAfter: record.reserved,
      reference: null,
    });
    return record;
  }

  async reserve(orderId: string, lines: StockLine[]): Promise<void> {
    // Validate every line before mutating any record.
    for (const line of lines) {
      const record = this.db.stock.get(line.variantId);
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
      const record = this.db.stock.get(line.variantId);
      if (record) {
        record.reserved += line.quantity;
        this.record({
          variantId: line.variantId,
          productId: record.productId,
          type: 'reserve',
          deltaOnHand: 0,
          deltaReserved: line.quantity,
          onHandAfter: record.onHand,
          reservedAfter: record.reserved,
          reference: orderId,
        });
      }
    }
    this.db.reservations.set(orderId, lines);
  }

  async release(orderId: string): Promise<void> {
    const lines = this.db.reservations.get(orderId);
    if (!lines) return;
    for (const line of lines) {
      const record = this.db.stock.get(line.variantId);
      if (record) {
        record.reserved -= line.quantity;
        this.record({
          variantId: line.variantId,
          productId: record.productId,
          type: 'release',
          deltaOnHand: 0,
          deltaReserved: -line.quantity,
          onHandAfter: record.onHand,
          reservedAfter: record.reserved,
          reference: orderId,
        });
      }
    }
    this.db.reservations.delete(orderId);
  }

  async finalize(orderId: string): Promise<void> {
    const lines = this.db.reservations.get(orderId);
    if (!lines) return;
    for (const line of lines) {
      const record = this.db.stock.get(line.variantId);
      if (record) {
        record.reserved -= line.quantity;
        record.onHand -= line.quantity;
        this.record({
          variantId: line.variantId,
          productId: record.productId,
          type: 'finalize',
          deltaOnHand: -line.quantity,
          deltaReserved: -line.quantity,
          onHandAfter: record.onHand,
          reservedAfter: record.reserved,
          reference: orderId,
        });
      }
    }
    this.db.reservations.delete(orderId);
  }
}
