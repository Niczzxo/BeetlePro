import { Injectable } from '@nestjs/common';
import type { Order } from '@dostelo/types';
import type {
  DeliveryZone,
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import {
  date,
  fromEnum,
  iso,
  toEnum,
  toMoney,
} from '../../../prisma/prisma.helpers';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import type { OrderStatusEventRecord } from '../../../store/in-memory.store';
import { OrdersRepository } from './orders.repository';

const ORDER_INCLUDE = {
  address: true,
  // OrderItem carries no timestamp or position column in the
  // schema, so line order is the database's return order; the
  // domain never depends on it (lines are keyed by variant).
  items: true,
} satisfies Prisma.OrderInclude;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

/** Prisma order repository: Order plus OrderItem rows and the
 * one-to-one OrderAddress. Status events are their own model. */
@Injectable()
export class PrismaOrdersRepository extends OrdersRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma.client;
  }

  private toOrder(row: OrderRow): Order {
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      customerId: row.customerId,
      status: fromEnum(row.status),
      paymentStatus: fromEnum(row.paymentStatus),
      address: row.address
        ? {
            fullName: row.address.fullName,
            phone: row.address.phone,
            addressLine: row.address.addressLine,
            area: row.address.area,
            city: row.address.city,
            district: row.address.district,
            deliveryZone: fromEnum(row.address.deliveryZone),
          }
        : {
            fullName: '',
            phone: '',
            addressLine: '',
            area: null,
            city: '',
            district: '',
            deliveryZone: 'dhaka-city',
          },
      items: row.items.map((item) => ({
        id: item.id,
        orderId: item.orderId,
        productId: item.productId,
        variantId: item.variantId,
        productName: item.productName,
        variantName: item.variantName,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: toMoney(item.unitPriceMinor, item.currency),
        lineTotal: toMoney(item.lineTotalMinor, item.currency),
      })),
      subtotal: toMoney(row.subtotalMinor, row.currency),
      deliveryFee: toMoney(row.deliveryFeeMinor, row.currency),
      codFee: toMoney(row.codFeeMinor, row.currency),
      discount: toMoney(row.discountMinor, row.currency),
      total: toMoney(row.totalMinor, row.currency),
      firstOrderFreeDelivery: row.firstOrderFreeDelivery,
      adminNote: row.adminNote,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  private itemData(order: Order) {
    return order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName,
      variantName: item.variantName,
      sku: item.sku,
      quantity: item.quantity,
      unitPriceMinor: item.unitPrice.amountMinor,
      lineTotalMinor: item.lineTotal.amountMinor,
      currency: item.unitPrice.currency,
    }));
  }

  private addressData(order: Order) {
    return {
      fullName: order.address.fullName,
      phone: order.address.phone,
      addressLine: order.address.addressLine,
      area: order.address.area,
      city: order.address.city,
      district: order.address.district,
      deliveryZone: toEnum<DeliveryZone>(order.address.deliveryZone),
    };
  }

  async create(order: Order, tx?: Tx): Promise<Order> {
    const row = await this.db(tx).order.create({
      data: {
        id: order.id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        status: toEnum<OrderStatus>(order.status),
        paymentStatus: toEnum<PaymentStatus>(order.paymentStatus),
        subtotalMinor: order.subtotal.amountMinor,
        deliveryFeeMinor: order.deliveryFee.amountMinor,
        codFeeMinor: order.codFee.amountMinor,
        discountMinor: order.discount.amountMinor,
        totalMinor: order.total.amountMinor,
        currency: order.total.currency,
        firstOrderFreeDelivery: order.firstOrderFreeDelivery,
        adminNote: order.adminNote,
        createdAt: date(order.createdAt),
        updatedAt: date(order.updatedAt),
        address: { create: this.addressData(order) },
        items: { create: this.itemData(order) },
      },
      include: ORDER_INCLUDE,
    });
    return this.toOrder(row);
  }

  async save(order: Order, tx?: Tx): Promise<void> {
    const db = this.db(tx);
    const existing = await db.order.findUnique({
      where: { id: order.id },
    });
    if (!existing) {
      await this.create(order, tx);
      return;
    }
    await db.orderItem.deleteMany({ where: { orderId: order.id } });
    await db.order.update({
      where: { id: order.id },
      data: {
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        status: toEnum<OrderStatus>(order.status),
        paymentStatus: toEnum<PaymentStatus>(order.paymentStatus),
        subtotalMinor: order.subtotal.amountMinor,
        deliveryFeeMinor: order.deliveryFee.amountMinor,
        codFeeMinor: order.codFee.amountMinor,
        discountMinor: order.discount.amountMinor,
        totalMinor: order.total.amountMinor,
        currency: order.total.currency,
        firstOrderFreeDelivery: order.firstOrderFreeDelivery,
        adminNote: order.adminNote,
        updatedAt: date(order.updatedAt),
        address: {
          upsert: {
            create: this.addressData(order),
            update: this.addressData(order),
          },
        },
        items: { create: this.itemData(order) },
      },
    });
  }

  async findById(id: string, tx?: Tx): Promise<Order | null> {
    const row = await this.db(tx).order.findUnique({
      where: { id },
      include: ORDER_INCLUDE,
    });
    return row ? this.toOrder(row) : null;
  }

  async findByNumber(
    orderNumber: string,
    tx?: Tx,
  ): Promise<Order | null> {
    const row = await this.db(tx).order.findUnique({
      where: { orderNumber },
      include: ORDER_INCLUDE,
    });
    return row ? this.toOrder(row) : null;
  }

  async listByCustomer(
    customerId: string,
    tx?: Tx,
  ): Promise<Order[]> {
    const rows = await this.db(tx).order.findMany({
      where: { customerId },
      include: ORDER_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toOrder(row));
  }

  async listAll(tx?: Tx): Promise<Order[]> {
    const rows = await this.db(tx).order.findMany({
      include: ORDER_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toOrder(row));
  }

  async countByCustomer(
    customerId: string,
    tx?: Tx,
  ): Promise<number> {
    return this.db(tx).order.count({ where: { customerId } });
  }

  async addStatusEvent(
    event: OrderStatusEventRecord,
    tx?: Tx,
  ): Promise<void> {
    await this.db(tx).orderStatusEvent.create({
      data: {
        id: event.id,
        orderId: event.orderId,
        status: toEnum<OrderStatus>(event.status),
        note: event.note,
        actorId: event.actorId,
        createdAt: date(event.createdAt),
      },
    });
  }

  async listStatusEvents(
    orderId: string,
    tx?: Tx,
  ): Promise<OrderStatusEventRecord[]> {
    const rows = await this.db(tx).orderStatusEvent.findMany({
      where: { orderId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      orderId: row.orderId,
      status: fromEnum(row.status),
      note: row.note,
      actorId: row.actorId,
      createdAt: iso(row.createdAt),
    }));
  }
}
