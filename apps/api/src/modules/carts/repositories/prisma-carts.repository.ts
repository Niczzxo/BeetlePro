import { Injectable } from '@nestjs/common';
import type { Cart } from '@dostelo/types';
import type { CartStatus, Prisma } from '@prisma/client';
import { date, fromEnum, iso, toEnum, toMoney } from '../../../prisma/prisma.helpers';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import { CartsRepository } from './carts.repository';

const CART_INCLUDE = {
  items: { orderBy: [{ addedAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.CartInclude;

type CartRow = Prisma.CartGetPayload<{ include: typeof CART_INCLUDE }>;

/** Prisma cart repository: Cart plus CartItem rows, items
 * replaced wholesale on save, as the in-memory store replaces
 * the record. */
@Injectable()
export class PrismaCartsRepository extends CartsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma.client;
  }

  private toCart(row: CartRow): Cart {
    return {
      id: row.id,
      customerId: row.customerId,
      sessionToken: row.sessionToken,
      status: fromEnum(row.status),
      items: row.items.map((item) => ({
        id: item.id,
        cartId: item.cartId,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: toMoney(item.unitPriceMinor, item.currency),
        addedAt: iso(item.addedAt),
      })),
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  private itemData(cart: Cart) {
    return cart.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      unitPriceMinor: item.unitPrice.amountMinor,
      currency: item.unitPrice.currency,
      addedAt: date(item.addedAt),
    }));
  }

  async create(cart: Cart, tx?: Tx): Promise<Cart> {
    const row = await this.db(tx).cart.create({
      data: {
        id: cart.id,
        customerId: cart.customerId,
        sessionToken: cart.sessionToken,
        status: toEnum<CartStatus>(cart.status),
        createdAt: date(cart.createdAt),
        updatedAt: date(cart.updatedAt),
        items: { create: this.itemData(cart) },
      },
      include: CART_INCLUDE,
    });
    return this.toCart(row);
  }

  async save(cart: Cart, tx?: Tx): Promise<void> {
    const db = this.db(tx);
    const existing = await db.cart.findUnique({ where: { id: cart.id } });
    if (!existing) {
      await this.create(cart, tx);
      return;
    }
    await db.cartItem.deleteMany({ where: { cartId: cart.id } });
    await db.cart.update({
      where: { id: cart.id },
      data: {
        customerId: cart.customerId,
        sessionToken: cart.sessionToken,
        status: toEnum<CartStatus>(cart.status),
        updatedAt: date(cart.updatedAt),
        items: { create: this.itemData(cart) },
      },
    });
  }

  async findById(id: string, tx?: Tx): Promise<Cart | null> {
    const row = await this.db(tx).cart.findUnique({
      where: { id },
      include: CART_INCLUDE,
    });
    return row ? this.toCart(row) : null;
  }

  async list(tx?: Tx): Promise<Cart[]> {
    const rows = await this.db(tx).cart.findMany({
      include: CART_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toCart(row));
  }
}
