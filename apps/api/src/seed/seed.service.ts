import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InMemoryDatabase } from '../store/in-memory.store';
import { buildSeedCatalogue } from './seed-catalogue';

/**
 * Seeds the in-memory store with the real Dostelo catalogue
 * (see seed-catalogue.ts for the mapping rules). The Prisma
 * binding seeds the same catalogue through PrismaSeedService.
 */
@Injectable()
export class SeedService implements OnModuleInit {
  constructor(private readonly db: InMemoryDatabase) {}

  async onModuleInit(): Promise<void> {
    if (this.db.products.size > 0) return;
    const now = new Date().toISOString();
    const { categories, products } = buildSeedCatalogue(now);
    for (const category of categories) {
      this.db.categories.set(category.id, category);
    }
    for (const product of products) {
      this.db.products.set(product.id, product);
      for (const variant of product.variants) {
        this.db.stock.set(variant.id, {
          productId: product.id,
          onHand: variant.stock,
          reserved: 0,
        });
      }
    }
  }
}
