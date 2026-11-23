import { Injectable } from '@nestjs/common';
import type { Cart } from '@dostelo/types';
import { InMemoryDatabase } from '../../../store/in-memory.store';
import { CartsRepository } from './carts.repository';

@Injectable()
export class InMemoryCartsRepository extends CartsRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async create(cart: Cart): Promise<Cart> {
    this.db.carts.set(cart.id, cart);
    return cart;
  }

  async save(cart: Cart): Promise<void> {
    this.db.carts.set(cart.id, cart);
  }

  async findById(id: string): Promise<Cart | null> {
    return this.db.carts.get(id) ?? null;
  }

  async list(): Promise<Cart[]> {
    return [...this.db.carts.values()];
  }
}
