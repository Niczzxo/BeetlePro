import type { Tx } from '../../../prisma/prisma.service';
import type { StockRecord } from '../../../store/in-memory.store';

export interface StockView extends StockRecord {
  variantId: string;
  available: number;
}

export interface StockLine {
  variantId: string;
  quantity: number;
}

/**
 * Inventory persistence seam: stock levels plus order reservations.
 * The Prisma implementation maps stock to ProductVariant.stock
 * with StockReservation rows per order, per the database domains in
 * docs/BACKEND_AND_DATABASE.md.
 */
export abstract class InventoryRepository {
  abstract getStock(
    variantId: string,
    tx?: Tx,
  ): Promise<StockRecord | null>;
  abstract listStock(
    productId?: string,
    tx?: Tx,
  ): Promise<(StockRecord & { variantId: string })[]>;
  abstract adjust(
    variantId: string,
    delta: number,
    tx?: Tx,
  ): Promise<StockRecord>;
  /** Moves quantity from available to reserved for an order. Throws
   * when any line cannot be fully reserved. */
  abstract reserve(
    orderId: string,
    lines: StockLine[],
    tx?: Tx,
  ): Promise<void>;
  /** Returns an order's reserved quantity to available (cancel). */
  abstract release(orderId: string, tx?: Tx): Promise<void>;
  /** Settles an order's reservation as sold (delivered): on-hand and
   * reserved both drop by the reserved quantity. */
  abstract finalize(orderId: string, tx?: Tx): Promise<void>;
}
