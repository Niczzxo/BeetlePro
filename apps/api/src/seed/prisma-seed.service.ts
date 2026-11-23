import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { MediaType, ProductStatus } from '@prisma/client';
import { date, toEnum } from '../prisma/prisma.helpers';
import { PrismaService } from '../prisma/prisma.service';
import { buildSeedCatalogue } from './seed-catalogue';

/**
 * Seeds the database with the real Dostelo catalogue when the
 * Product table is empty (see seed-catalogue.ts for the mapping
 * rules). The Prisma counterpart of SeedService: same builder,
 * same deterministic ids, variant stock written to
 * ProductVariant.stock, which the Prisma inventory repository
 * reads as on-hand.
 */
@Injectable()
export class PrismaSeedService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const client = this.prisma.client;
    if ((await client.product.count()) > 0) return;
    const now = new Date().toISOString();
    const { categories, products } = buildSeedCatalogue(now);
    for (const category of categories) {
      await client.category.create({
        data: {
          id: category.id,
          slug: category.slug,
          name: category.name,
          parentId: category.parentId,
          position: category.position,
          isActive: category.isActive,
          createdAt: date(category.createdAt),
          updatedAt: date(category.updatedAt),
        },
      });
    }
    for (const product of products) {
      await client.product.create({
        data: {
          id: product.id,
          slug: product.slug,
          name: product.name,
          categoryId: product.categoryId,
          description: product.description,
          status: toEnum<ProductStatus>(product.status),
          isFeatured: product.isFeatured,
          isBestSeller: product.isBestSeller,
          isNewArrival: product.isNewArrival,
          tags: product.tags,
          createdAt: date(product.createdAt),
          updatedAt: date(product.updatedAt),
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
              currency: variant.price.currency,
              stock: variant.stock,
              isActive: variant.isActive,
            })),
          },
          media: {
            create: product.media.map((media) => ({
              id: media.id,
              type: toEnum<MediaType>(media.type),
              url: media.url,
              alt: media.alt,
              position: media.position,
            })),
          },
        },
      });
    }
  }
}
