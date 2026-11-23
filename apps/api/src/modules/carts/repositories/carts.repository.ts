import type { Cart } from '@dostelo/types';

/** Cart persistence seam. The Prisma implementation maps to the
 * Cart and CartItem models in the database schema. */
export abstract class CartsRepository {
  abstract create(cart: Cart): Cart;
  abstract save(cart: Cart): void;
  abstract findById(id: string): Cart | null;
  /** Every cart, for the cart recovery scan (Phase 6). */
  abstract list(): Cart[];
}
