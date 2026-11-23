import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { money, type Cart, type CartView } from '@dostelo/types';
import type {
  CartCreate,
  CartLineCreate,
  CartLineUpdate,
} from '@dostelo/validation';
import type { Tx } from '../../prisma/prisma.service';
import { CatalogRepository } from '../catalog/repositories/catalog.repository';
import { InventoryService } from '../inventory/inventory.service';
import { CartsRepository } from './repositories/carts.repository';

@Injectable()
export class CartsService {
  constructor(
    private readonly carts: CartsRepository,
    private readonly catalog: CatalogRepository,
    private readonly inventory: InventoryService,
  ) {}

  async createCart(dto: CartCreate): Promise<CartView> {
    const now = new Date().toISOString();
    const cart: Cart = {
      id: randomUUID(),
      customerId: dto.customerId ?? null,
      sessionToken: dto.sessionToken ?? null,
      status: 'active',
      items: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.carts.create(cart);
    return this.toView(cart);
  }

  private async findCart(cartId: string): Promise<Cart> {
    const cart = await this.carts.findById(cartId);
    if (!cart) {
      throw new NotFoundException(`Cart not found: ${cartId}`);
    }
    return cart;
  }

  private assertActive(cart: Cart): void {
    if (cart.status !== 'active') {
      throw new BadRequestException(`Cart ${cart.id} is ${cart.status}`);
    }
  }

  /** Builds the API view of a cart: each line carries its product
   * and variant names plus a computed line total, and the cart
   * carries the subtotal. Prices are the snapshots taken when the
   * lines were added. */
  async toView(cart: Cart): Promise<CartView> {
    let subtotalMinor = 0;
    const items: CartView['items'] = [];
    for (const item of cart.items) {
      const found = await this.catalog.findVariant(
        item.productId,
        item.variantId,
      );
      const lineTotalMinor =
        item.unitPrice.amountMinor * item.quantity;
      subtotalMinor += lineTotalMinor;
      items.push({
        ...item,
        productName: found?.product.name ?? item.productId,
        variantName: found?.variant.name ?? item.variantId,
        lineTotal: money(lineTotalMinor),
      });
    }
    return { ...cart, items, subtotal: money(subtotalMinor) };
  }

  async getCart(cartId: string): Promise<CartView> {
    return this.toView(await this.findCart(cartId));
  }

  async addLine(cartId: string, dto: CartLineCreate): Promise<CartView> {
    const cart = await this.findCart(cartId);
    this.assertActive(cart);
    const found = await this.catalog.findVariant(
      dto.productId,
      dto.variantId,
    );
    if (!found || !found.variant.isActive) {
      throw new NotFoundException(
        `Variant not found: ${dto.productId}/${dto.variantId}`,
      );
    }
    const existing = cart.items.find(
      (item) => item.variantId === dto.variantId,
    );
    const wanted = (existing?.quantity ?? 0) + dto.quantity;
    const available = await this.inventory.availableFor(dto.variantId);
    if (wanted > available) {
      throw new BadRequestException(
        `Insufficient stock for variant ${dto.variantId}: requested ${wanted}, available ${available}`,
      );
    }
    if (existing) {
      existing.quantity = wanted;
    } else {
      cart.items.push({
        id: randomUUID(),
        cartId: cart.id,
        productId: dto.productId,
        variantId: dto.variantId,
        quantity: dto.quantity,
        unitPrice: found.variant.price,
        addedAt: new Date().toISOString(),
      });
    }
    cart.updatedAt = new Date().toISOString();
    await this.carts.save(cart);
    return this.toView(cart);
  }

  async updateLine(
    cartId: string,
    lineId: string,
    dto: CartLineUpdate,
  ): Promise<CartView> {
    const cart = await this.findCart(cartId);
    this.assertActive(cart);
    const line = cart.items.find((item) => item.id === lineId);
    if (!line) {
      throw new NotFoundException(`Cart line not found: ${lineId}`);
    }
    if (dto.quantity === 0) {
      cart.items = cart.items.filter((item) => item.id !== lineId);
    } else {
      const available = await this.inventory.availableFor(line.variantId);
      if (dto.quantity > available) {
        throw new BadRequestException(
          `Insufficient stock for variant ${line.variantId}: requested ${dto.quantity}, available ${available}`,
        );
      }
      line.quantity = dto.quantity;
    }
    cart.updatedAt = new Date().toISOString();
    await this.carts.save(cart);
    return this.toView(cart);
  }

  async removeLine(cartId: string, lineId: string): Promise<CartView> {
    return this.updateLine(cartId, lineId, { quantity: 0 });
  }

  /** Marks a cart converted when checkout places its order. */
  async markConverted(cartId: string, tx?: Tx): Promise<void> {
    const cart = await this.carts.findById(cartId, tx);
    if (!cart) return;
    cart.status = 'converted';
    cart.updatedAt = new Date().toISOString();
    await this.carts.save(cart, tx);
  }
}
