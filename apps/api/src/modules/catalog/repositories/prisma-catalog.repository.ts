import { Injectable } from '@nestjs/common';
import type { Category, Product, ProductVariant } from '@dostelo/types';
import type {
  Category as CategoryRow,
  Prisma,
  ProductStatus as PrismaProductStatus,
} from '@prisma/client';
import { slugify } from '../../../common/parse-body';
import {
  fromEnum,
  iso,
  toEnum,
  toMoney,
} from '../../../prisma/prisma.helpers';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import {
  CatalogRepository,
  type ProductReferenceCounts,
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

  async createProduct(product: Product, tx?: Tx): Promise<Product> {
    const row = await this.db(tx).product.create({
      data: {
        id: product.id,
        slug: product.slug,
        name: product.name,
        categoryId: product.categoryId,
        description: product.description,
        status: toEnum<PrismaProductStatus>(product.status),
        isFeatured: product.isFeatured,
        isBestSeller: product.isBestSeller,
        isNewArrival: product.isNewArrival,
        tags: product.tags,
        variants: {
          create: product.variants.map((variant) => ({
            id: variant.id,
            sku: variant.sku,
            name: variant.name,
            size: variant.size,
            colour: variant.colour,
            priceMinor: variant.price.amountMinor,
            compareAtPriceMinor:
              variant.compareAtPrice?.amountMinor ?? null,
            currency: 'BDT',
            stock: variant.stock,
            isActive: variant.isActive,
          })),
        },
        media: {
          create: product.media.map((item, index) => ({
            id: item.id,
            type: 'IMAGE',
            url: item.url,
            alt: item.alt,
            position: index,
          })),
        },
      },
      include: PRODUCT_INCLUDE,
    });
    return this.toProduct(row);
  }

  async updateProduct(product: Product, tx?: Tx): Promise<Product> {
    const db = this.db(tx);
    await db.product.update({
      where: { id: product.id },
      data: {
        slug: product.slug,
        name: product.name,
        categoryId: product.categoryId,
        description: product.description,
        status: toEnum<PrismaProductStatus>(product.status),
        isFeatured: product.isFeatured,
        isBestSeller: product.isBestSeller,
        isNewArrival: product.isNewArrival,
        tags: product.tags,
      },
    });
    for (const variant of product.variants) {
      const data = {
        sku: variant.sku,
        name: variant.name,
        size: variant.size,
        colour: variant.colour,
        priceMinor: variant.price.amountMinor,
        compareAtPriceMinor: variant.compareAtPrice?.amountMinor ?? null,
        stock: variant.stock,
        isActive: variant.isActive,
      };
      const existing = await db.productVariant.findUnique({
        where: { id: variant.id },
      });
      if (existing) {
        await db.productVariant.update({
          where: { id: variant.id },
          data,
        });
      } else {
        await db.productVariant.create({
          data: { id: variant.id, productId: product.id, currency: 'BDT', ...data },
        });
      }
    }
    await db.productMedia.deleteMany({
      where: { productId: product.id },
    });
    for (const [index, item] of product.media.entries()) {
      await db.productMedia.create({
        data: {
          id: item.id,
          productId: product.id,
          type: 'IMAGE',
          url: item.url,
          alt: item.alt,
          position: index,
        },
      });
    }
    const row = await db.product.findUnique({
      where: { id: product.id },
      include: PRODUCT_INCLUDE,
    });
    return this.toProduct(row as ProductRow);
  }

  async deleteProduct(id: string, tx?: Tx): Promise<boolean> {
    const db = this.db(tx);
    const existing = await db.product.findUnique({ where: { id } });
    if (!existing) return false;
    await db.productMedia.deleteMany({ where: { productId: id } });
    await db.productVariant.deleteMany({ where: { productId: id } });
    await db.product.delete({ where: { id } });
    return true;
  }

  async countProductReferences(
    id: string,
    tx?: Tx,
  ): Promise<ProductReferenceCounts> {
    const db = this.db(tx);
    const [orderItems, cartItems, reservations, reviews] =
      await Promise.all([
        db.orderItem.count({ where: { productId: id } }),
        db.cartItem.count({ where: { productId: id } }),
        db.stockReservation.count({
          where: { variant: { productId: id } },
        }),
        db.productReview.count({ where: { productId: id } }),
      ]);
    return { orderItems, cartItems, reservations, reviews };
  }
}
