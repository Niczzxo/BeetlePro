import type { Cart } from '@dostelo/types';
import type { Tx } from '../../../prisma/prisma.service';

/** Cart persistence seam. The Prisma implementation maps to the
 * Cart and CartItem models in the database schema. */
export abstract class CartsRepository {
  abstract create(cart: Cart, tx?: Tx): Promise<Cart>;
  abstract save(cart: Cart, tx?: Tx): Promise<void>;
  abstract findById(id: string, tx?: Tx): Promise<Cart | null>;
  /** Every cart, for the cart recovery scan (Phase 6). */
  abstract list(tx?: Tx): Promise<Cart[]>;
}
