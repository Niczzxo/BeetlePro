import { Injectable } from '@nestjs/common';
import type { Cart } from '@dostelo/types';
import { InMemoryDatabase } from '../../../store/in-memory.store';
import { CartsRepository } from './carts.repository';

@Injectable()
export class InMemoryCartsRepository extends CartsRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  create(cart: Cart): Cart {
    this.db.carts.set(cart.id, cart);
    return cart;
  }

  save(cart: Cart): void {
    this.db.carts.set(cart.id, cart);
  }

  findById(id: string): Cart | null {
    return this.db.carts.get(id) ?? null;
  }

  list(): Cart[] {
    return [...this.db.carts.values()];
  }
}
