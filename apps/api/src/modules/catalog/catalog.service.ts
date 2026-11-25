import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  money,
  type Category,
  type Product,
  type ProductMedia,
  type ProductVariant,
} from '@dostelo/types';
import type {
  ProductCreate,
  ProductUpdate,
  ProductVariantInput,
} from '@dostelo/validation';
import type { AuthPrincipal } from '../../common/auth/principal';
import { SettingsRepository } from '../../store/settings.repository';
import { AuditService } from '../audit/audit.service';
import { CatalogRepository } from './repositories/catalog.repository';

export interface CategoryWithCount extends Category {
  productCount: number;
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly catalog: CatalogRepository,
    private readonly audit: AuditService,
    @Optional() private readonly settings?: SettingsRepository,
  ) {}

  /** Store-live gate (Website Management): while the store is
   * switched off, the public catalogue serves nothing. */
  private async assertStoreLive(): Promise<void> {
    if (this.settings && !(await this.settings.get()).storeLive) {
      throw new ServiceUnavailableException(
        'The store is currently closed',
      );
    }
  }

  async listProducts(categoryKey?: string): Promise<{ items: Product[]; total: number }> {
    await this.assertStoreLive();
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
    await this.assertStoreLive();
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

  // -- Staff catalogue administration -----------------------------
  // The public reads above serve active products only. The admin
  // portal works with every status; publication status governs
  // the public catalogue, so a draft or archived product never
  // reaches the storefront API.

  /** Every product, every status, for the admin portal. */
  async listAllProducts(): Promise<{ items: Product[]; total: number }> {
    const items = await this.catalog.listProducts();
    return { items, total: items.length };
  }

  async getProductForAdmin(id: string): Promise<Product> {
    const product = await this.catalog.findByIdOrSlug(id);
    if (!product) {
      throw new NotFoundException(`Product not found: ${id}`);
    }
    return product;
  }

  private buildVariant(
    productId: string,
    input: ProductVariantInput,
  ): ProductVariant {
    return {
      id: input.id ?? randomUUID(),
      productId,
      sku: input.sku,
      name: input.name,
      size: input.size ?? null,
      colour: input.colour ?? null,
      price: money(input.priceMinor),
      compareAtPrice:
        input.compareAtPriceMinor == null
          ? null
          : money(input.compareAtPriceMinor),
      stock: input.stock,
      isActive: input.isActive ?? true,
    };
  }

  private async assertUnique(
    slug: string,
    skus: string[],
    excludeProductId?: string,
  ): Promise<void> {
    const all = await this.catalog.listProducts();
    const others = all.filter(
      (product) => product.id !== excludeProductId,
    );
    if (others.some((product) => product.slug === slug)) {
      throw new ConflictException(
        `A product with slug "${slug}" already exists`,
      );
    }
    const taken = new Set(
      others.flatMap((product) =>
        product.variants.map((variant) => variant.sku),
      ),
    );
    const duplicate = skus.find((sku) => taken.has(sku));
    if (duplicate) {
      throw new ConflictException(
        `SKU "${duplicate}" is already used by another product`,
      );
    }
    if (new Set(skus).size !== skus.length) {
      throw new BadRequestException(
        'SKUs must be unique within the product',
      );
    }
  }

  private async assertCategory(categoryId: string): Promise<void> {
    const categories = await this.catalog.listCategories();
    if (!categories.some((category) => category.id === categoryId)) {
      throw new BadRequestException(`Unknown category: ${categoryId}`);
    }
  }

  async createProduct(
    dto: ProductCreate,
    actor: AuthPrincipal,
  ): Promise<Product> {
    await this.assertCategory(dto.categoryId);
    await this.assertUnique(
      dto.slug,
      dto.variants.map((variant) => variant.sku),
    );
    const id = randomUUID();
    const now = new Date().toISOString();
    const product: Product = {
      id,
      slug: dto.slug,
      name: dto.name,
      categoryId: dto.categoryId,
      description: dto.description ?? null,
      status: dto.status ?? 'draft',
      isFeatured: dto.isFeatured ?? false,
      isBestSeller: dto.isBestSeller ?? false,
      isNewArrival: dto.isNewArrival ?? false,
      tags: dto.tags ?? [],
      variants: dto.variants.map((variant) =>
        this.buildVariant(id, variant),
      ),
      media: (dto.media ?? []).map(
        (item, index): ProductMedia => ({
          id: randomUUID(),
          productId: id,
          type: 'image',
          url: item.url,
          alt: item.alt ?? '',
          position: index,
        }),
      ),
      createdAt: now,
      updatedAt: now,
    };
    const saved = await this.catalog.createProduct(product);
    await this.audit.recordForPrincipal(actor, {
      action: 'products.created',
      entityType: 'product',
      entityId: saved.id,
      metadata: { slug: saved.slug, status: saved.status },
    });
    return saved;
  }

  async updateProduct(
    id: string,
    dto: ProductUpdate,
    actor: AuthPrincipal,
  ): Promise<Product> {
    const existing = await this.getProductForAdmin(id);
    const slug = dto.slug ?? existing.slug;
    const variantInputs = dto.variants ?? null;
    if (dto.categoryId) await this.assertCategory(dto.categoryId);
    if (variantInputs) {
      for (const input of variantInputs) {
        if (
          input.id &&
          !existing.variants.some((variant) => variant.id === input.id)
        ) {
          throw new BadRequestException(
            `Variant ${input.id} does not belong to this product`,
          );
        }
      }
    }
    await this.assertUnique(
      slug,
      variantInputs
        ? variantInputs.map((variant) => variant.sku)
        : existing.variants.map((variant) => variant.sku),
      existing.id,
    );
    const variants: ProductVariant[] = variantInputs
      ? variantInputs.map((input) => this.buildVariant(existing.id, input))
      : existing.variants;
    // Variants left out of the submitted set are kept, per the
    // update contract: history may reference them.
    if (variantInputs) {
      const submitted = new Set(variants.map((variant) => variant.id));
      for (const kept of existing.variants) {
        if (!submitted.has(kept.id)) variants.push(kept);
      }
    }
    const product: Product = {
      ...existing,
      name: dto.name ?? existing.name,
      slug,
      categoryId: dto.categoryId ?? existing.categoryId,
      description:
        dto.description === undefined
          ? existing.description
          : dto.description,
      status: dto.status ?? existing.status,
      isFeatured: dto.isFeatured ?? existing.isFeatured,
      isBestSeller: dto.isBestSeller ?? existing.isBestSeller,
      isNewArrival: dto.isNewArrival ?? existing.isNewArrival,
      tags: dto.tags ?? existing.tags,
      variants,
      media:
        dto.media === undefined
          ? existing.media
          : dto.media.map(
              (item, index): ProductMedia => ({
                id: randomUUID(),
                productId: existing.id,
                type: 'image',
                url: item.url,
                alt: item.alt ?? '',
                position: index,
              }),
            ),
      updatedAt: new Date().toISOString(),
    };
    const saved = await this.catalog.updateProduct(product);
    await this.audit.recordForPrincipal(actor, {
      action: 'products.updated',
      entityType: 'product',
      entityId: saved.id,
      metadata: { slug: saved.slug, status: saved.status },
    });
    return saved;
  }

  async deleteProduct(
    id: string,
    actor: AuthPrincipal,
  ): Promise<{ id: string; deleted: true }> {
    const existing = await this.getProductForAdmin(id);
    const refs = await this.catalog.countProductReferences(existing.id);
    const total =
      refs.orderItems + refs.cartItems + refs.reservations + refs.reviews;
    if (total > 0) {
      throw new BadRequestException(
        `This product is referenced by ${refs.orderItems} order line(s), ${refs.cartItems} cart line(s), ${refs.reservations} reservation(s) and ${refs.reviews} review(s). Archive it instead of deleting it, so history stays intact.`,
      );
    }
    await this.catalog.deleteProduct(existing.id);
    await this.audit.recordForPrincipal(actor, {
      action: 'products.deleted',
      entityType: 'product',
      entityId: existing.id,
      metadata: { slug: existing.slug },
    });
    return { id: existing.id, deleted: true };
  }
}
