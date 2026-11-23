import { Injectable, NotFoundException } from '@nestjs/common';
import type { Category, Product } from '@dostelo/types';
import { CatalogRepository } from './repositories/catalog.repository';

export interface CategoryWithCount extends Category {
  productCount: number;
}

@Injectable()
export class CatalogService {
  constructor(private readonly catalog: CatalogRepository) {}

  listProducts(categoryKey?: string): { items: Product[]; total: number } {
    let items = this.catalog
      .listProducts()
      .filter((product) => product.status === 'active');
    if (categoryKey) {
      const category = this.catalog.findCategoryBySlugOrName(categoryKey);
      if (!category) {
        throw new NotFoundException(`Category not found: ${categoryKey}`);
      }
      items = items.filter((product) => product.categoryId === category.id);
    }
    return { items, total: items.length };
  }

  getProduct(key: string): Product {
    const product = this.catalog.findByIdOrSlug(key);
    if (!product || product.status !== 'active') {
      throw new NotFoundException(`Product not found: ${key}`);
    }
    return product;
  }

  listCategories(): CategoryWithCount[] {
    const products = this.catalog
      .listProducts()
      .filter((product) => product.status === 'active');
    return this.catalog.listCategories().map((category) => ({
      ...category,
      productCount: products.filter(
        (product) => product.categoryId === category.id,
      ).length,
    }));
  }
}
