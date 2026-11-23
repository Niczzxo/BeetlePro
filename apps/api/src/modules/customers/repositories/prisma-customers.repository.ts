import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DeliveryZone, Prisma } from '@prisma/client';
import { date, fromEnum, iso, toEnum } from '../../../prisma/prisma.helpers';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import type { StoredCustomer } from '../../../store/in-memory.store';
import { CustomersRepository } from './customers.repository';

const CUSTOMER_INCLUDE = {
  user: true,
  addresses: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.CustomerInclude;

type CustomerWithRelations = Prisma.CustomerGetPayload<{
  include: typeof CUSTOMER_INCLUDE;
}>;

/**
 * Prisma customer repository. The schema splits a customer
 * across Customer (profile, tags, counters, addresses) and an
 * optional User (the auth identity holding the password hash).
 * A registered customer (passwordHash set) gets a User row,
 * linked from Customer.userId, because refresh sessions hang
 * off User; a guest customer stays unlinked, exactly as the
 * domain record holds it. The hash is read back from the User
 * row on every load.
 */
@Injectable()
export class PrismaCustomersRepository extends CustomersRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma.client;
  }

  private toStored(row: CustomerWithRelations): StoredCustomer {
    return {
      id: row.id,
      userId: row.userId,
      fullName: row.fullName,
      email: row.email,
      phone: row.phone,
      isPhoneVerified: row.isPhoneVerified,
      isEmailVerified: row.isEmailVerified,
      addresses: row.addresses.map((address) => ({
        id: address.id,
        customerId: address.customerId,
        label: address.label,
        fullName: address.fullName,
        phone: address.phone,
        addressLine: address.addressLine,
        area: address.area,
        city: address.city,
        district: address.district,
        deliveryZone: fromEnum(address.deliveryZone),
        isDefault: address.isDefault,
      })),
      tags: row.tags,
      orderCount: row.orderCount,
      lifetimeValueMinor: row.lifetimeValueMinor,
      passwordHash: row.user?.passwordHash ?? null,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  private addressData(customer: StoredCustomer) {
    return customer.addresses.map((address) => ({
      id: address.id,
      label: address.label,
      fullName: address.fullName,
      phone: address.phone,
      addressLine: address.addressLine,
      area: address.area,
      city: address.city,
      district: address.district,
      deliveryZone: toEnum<DeliveryZone>(address.deliveryZone),
      isDefault: address.isDefault,
    }));
  }

  /** Creates or updates the backing User row for a registered
   * customer and returns its id. */
  private async ensureUser(
    customer: StoredCustomer,
    existingUserId: string | null,
    tx?: Tx,
  ): Promise<string> {
    const db = this.db(tx);
    const data = {
      email: customer.email,
      phone: customer.phone === '' ? null : customer.phone,
      passwordHash: customer.passwordHash,
      name: customer.fullName,
    };
    if (existingUserId) {
      await db.user.update({ where: { id: existingUserId }, data });
      return existingUserId;
    }
    const userId = customer.userId ?? randomUUID();
    await db.user.upsert({
      where: { id: userId },
      create: { id: userId, ...data },
      update: data,
    });
    return userId;
  }

  async create(
    customer: StoredCustomer,
    tx?: Tx,
  ): Promise<StoredCustomer> {
    const db = this.db(tx);
    const userId =
      customer.passwordHash !== null
        ? await this.ensureUser(customer, customer.userId, tx)
        : customer.userId;
    const row = await db.customer.create({
      data: {
        id: customer.id,
        userId,
        fullName: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        isPhoneVerified: customer.isPhoneVerified,
        isEmailVerified: customer.isEmailVerified,
        tags: customer.tags,
        orderCount: customer.orderCount,
        lifetimeValueMinor: customer.lifetimeValueMinor,
        createdAt: date(customer.createdAt),
        updatedAt: date(customer.updatedAt),
        addresses: { create: this.addressData(customer) },
      },
      include: CUSTOMER_INCLUDE,
    });
    return this.toStored(row);
  }

  async save(customer: StoredCustomer, tx?: Tx): Promise<void> {
    const db = this.db(tx);
    const existing = await db.customer.findUnique({
      where: { id: customer.id },
    });
    if (!existing) {
      await this.create(customer, tx);
      return;
    }
    const userId =
      customer.passwordHash !== null
        ? await this.ensureUser(customer, existing.userId, tx)
        : existing.userId;
    await db.customerAddress.deleteMany({
      where: { customerId: customer.id },
    });
    await db.customer.update({
      where: { id: customer.id },
      data: {
        userId,
        fullName: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        isPhoneVerified: customer.isPhoneVerified,
        isEmailVerified: customer.isEmailVerified,
        tags: customer.tags,
        orderCount: customer.orderCount,
        lifetimeValueMinor: customer.lifetimeValueMinor,
        updatedAt: date(customer.updatedAt),
        addresses: { create: this.addressData(customer) },
      },
    });
  }

  async findById(
    id: string,
    tx?: Tx,
  ): Promise<StoredCustomer | null> {
    const row = await this.db(tx).customer.findUnique({
      where: { id },
      include: CUSTOMER_INCLUDE,
    });
    return row ? this.toStored(row) : null;
  }

  async findByEmail(
    email: string,
    tx?: Tx,
  ): Promise<StoredCustomer | null> {
    const row = await this.db(tx).customer.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      include: CUSTOMER_INCLUDE,
    });
    return row ? this.toStored(row) : null;
  }

  async findByPhone(
    phone: string,
    tx?: Tx,
  ): Promise<StoredCustomer | null> {
    const row = await this.db(tx).customer.findFirst({
      where: { phone },
      include: CUSTOMER_INCLUDE,
    });
    return row ? this.toStored(row) : null;
  }

  async list(tx?: Tx): Promise<StoredCustomer[]> {
    const rows = await this.db(tx).customer.findMany({
      include: CUSTOMER_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toStored(row));
  }
}
