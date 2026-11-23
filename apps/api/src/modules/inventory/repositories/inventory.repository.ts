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
 * The Prisma implementation will map stock to ProductVariant.stock
 * with StockReservation rows per order, per the database domains in
 * docs/BACKEND_AND_DATABASE.md.
 */
export abstract class InventoryRepository {
  abstract getStock(variantId: string): StockRecord | null;
  abstract listStock(productId?: string): (StockRecord & { variantId: string })[];
  abstract adjust(variantId: string, delta: number): StockRecord;
  /** Moves quantity from available to reserved for an order. Throws
   * when any line cannot be fully reserved. */
  abstract reserve(orderId: string, lines: StockLine[]): void;
  /** Returns an order's reserved quantity to available (cancel). */
  abstract release(orderId: string): void;
  /** Settles an order's reservation as sold (delivered): on-hand and
   * reserved both drop by the reserved quantity. */
  abstract finalize(orderId: string): void;
}
