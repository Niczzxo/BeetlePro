import { Injectable } from '@nestjs/common';
import type { Category, Product, ProductVariant } from '@dostelo/types';
import type { Category as CategoryRow, Prisma } from '@prisma/client';
import { slugify } from '../../../common/parse-body';
import { fromEnum, iso, toMoney } from '../../../prisma/prisma.helpers';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import {
  CatalogRepository,
  type ProductWithVariant,
} from './catalog.repository';

const PRODUCT_INCLUDE = {
  variants: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
  media: { orderBy: { position: 'asc' } },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{
  include: typeof PRODUCT_INCLUDE;
}>;

/**
 * Prisma catalog repository: the same contract as the in-memory
 * implementation against the Category, Product, ProductVariant
 * and ProductMedia models. Variant stock is overlaid from
 * ProductVariant.stock (on-hand) on every read, mirroring the
 * in-memory overlay of the stock map.
 */
@Injectable()
export class PrismaCatalogRepository extends CatalogRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma.client;
  }

  private toVariant(row: ProductRow['variants'][number]): ProductVariant {
    return {
      id: row.id,
      productId: row.productId,
      sku: row.sku,
      name: row.name,
      size: row.size,
      colour: row.colour,
      price: toMoney(row.priceMinor, row.currency),
      compareAtPrice:
        row.compareAtPriceMinor === null
          ? null
          : toMoney(row.compareAtPriceMinor, row.currency),
      stock: row.stock,
      isActive: row.isActive,
    };
  }

  private toProduct(row: ProductRow): Product {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      categoryId: row.categoryId,
      description: row.description,
      status: fromEnum(row.status),
      isFeatured: row.isFeatured,
      isBestSeller: row.isBestSeller,
      isNewArrival: row.isNewArrival,
      tags: row.tags,
      variants: row.variants.map((variant) => this.toVariant(variant)),
      media: row.media.map((media) => ({
        id: media.id,
        productId: media.productId,
        type: fromEnum(media.type),
        url: media.url,
        alt: media.alt,
        position: media.position,
      })),
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  private toCategory(row: CategoryRow): Category {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      parentId: row.parentId,
      position: row.position,
      isActive: row.isActive,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  async listProducts(tx?: Tx): Promise<Product[]> {
    const rows = await this.db(tx).product.findMany({
      include: PRODUCT_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toProduct(row));
  }

  async findByIdOrSlug(key: string, tx?: Tx): Promise<Product | null> {
    const row = await this.db(tx).product.findFirst({
      where: { OR: [{ id: key }, { slug: key }] },
      include: PRODUCT_INCLUDE,
    });
    return row ? this.toProduct(row) : null;
  }

  async findVariant(
    productId: string,
    variantId: string,
    tx?: Tx,
  ): Promise<ProductWithVariant | null> {
    const product = await this.findByIdOrSlug(productId, tx);
    if (!product) return null;
    const variant = product.variants.find((v) => v.id === variantId);
    return variant ? { product, variant } : null;
  }

  async listCategories(tx?: Tx): Promise<Category[]> {
    const rows = await this.db(tx).category.findMany({
      orderBy: { position: 'asc' },
    });
    return rows.map((row) => this.toCategory(row));
  }

  async findCategoryBySlugOrName(
    key: string,
    tx?: Tx,
  ): Promise<Category | null> {
    const row = await this.db(tx).category.findFirst({
      where: {
        OR: [
          { slug: slugify(key) },
          { name: { equals: key, mode: 'insensitive' } },
        ],
      },
    });
    return row ? this.toCategory(row) : null;
  }
}
