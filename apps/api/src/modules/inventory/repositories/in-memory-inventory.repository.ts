import { BadRequestException, Injectable } from '@nestjs/common';
import { InMemoryDatabase } from '../../../store/in-memory.store';
import {
  InventoryRepository,
  type StockLine,
} from './inventory.repository';
import type { StockRecord } from '../../../store/in-memory.store';

@Injectable()
export class InMemoryInventoryRepository extends InventoryRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  getStock(variantId: string): StockRecord | null {
    return this.db.stock.get(variantId) ?? null;
  }

  listStock(
    productId?: string,
  ): (StockRecord & { variantId: string })[] {
    return [...this.db.stock.entries()]
      .filter(([, record]) => !productId || record.productId === productId)
      .map(([variantId, record]) => ({ variantId, ...record }));
  }

  adjust(variantId: string, delta: number): StockRecord {
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
    return record;
  }

  reserve(orderId: string, lines: StockLine[]): void {
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
      if (record) record.reserved += line.quantity;
    }
    this.db.reservations.set(orderId, lines);
  }

  release(orderId: string): void {
    const lines = this.db.reservations.get(orderId);
    if (!lines) return;
    for (const line of lines) {
      const record = this.db.stock.get(line.variantId);
      if (record) record.reserved -= line.quantity;
    }
    this.db.reservations.delete(orderId);
  }

  finalize(orderId: string): void {
    const lines = this.db.reservations.get(orderId);
    if (!lines) return;
    for (const line of lines) {
      const record = this.db.stock.get(line.variantId);
      if (record) {
        record.reserved -= line.quantity;
        record.onHand -= line.quantity;
      }
    }
    this.db.reservations.delete(orderId);
  }
}
