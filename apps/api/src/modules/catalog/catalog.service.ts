import { Injectable, NotFoundException } from '@nestjs/common';
import type { Category, Product } from '@dostelo/types';
import { CatalogRepository } from './repositories/catalog.repository';

export interface CategoryWithCount extends Category {
  productCount: number;
}

@Injectable()
export class CatalogService {
  constructor(private readonly catalog: CatalogRepository) {}

  async listProducts(categoryKey?: string): Promise<{ items: Product[]; total: number }> {
    let items = (await this.catalog.listProducts()).filter(
      (product) => product.status === 'active',
    );
    if (categoryKey) {
      const category =
        await this.catalog.findCategoryBySlugOrName(categoryKey);
      if (!category) {
        throw new NotFoundException(`Category not found: ${categoryKey}`);
      }
      items = items.filter((product) => product.categoryId === category.id);
    }
    return { items, total: items.length };
  }

  async getProduct(key: string): Promise<Product> {
    const product = await this.catalog.findByIdOrSlug(key);
    if (!product || product.status !== 'active') {
      throw new NotFoundException(`Product not found: ${key}`);
    }
    return product;
  }

  async listCategories(): Promise<CategoryWithCount[]> {
    const products = (await this.catalog.listProducts()).filter(
      (product) => product.status === 'active',
    );
    return (await this.catalog.listCategories()).map((category) => ({
      ...category,
      productCount: products.filter(
        (product) => product.categoryId === category.id,
      ).length,
    }));
  }
}
