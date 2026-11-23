import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type Courier as CourierEnum,
  type Shipment as ShipmentRow,
  type ShipmentStatus as ShipmentStatusEnum,
} from '@prisma/client';
import type {
  Courier,
  Shipment,
  ShipmentStatusEvent,
} from '@dostelo/types';
import { date, fromEnum, iso, toEnum, toMoney } from '../../../prisma/prisma.helpers';
import { PrismaService, type Tx } from '../../../prisma/prisma.service';
import type { CourierWebhookRecord } from '../../../store/in-memory.store';
import {
  ShippingRepository,
  type ShipmentListFilter,
} from './shipping.repository';

/** Prisma shipping repository over Shipment, ShipmentEvent and
 * CourierWebhookEvent. Webhook recording keeps the (courier,
 * providerEventId) idempotency contract, including under a
 * concurrent redelivery. */
@Injectable()
export class PrismaShippingRepository extends ShippingRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: Tx) {
    return tx ?? this.prisma.client;
  }

  private toShipment(row: ShipmentRow): Shipment {
    return {
      id: row.id,
      orderId: row.orderId,
      orderNumber: row.orderNumber,
      courier: fromEnum(row.courier),
      status: fromEnum(row.status),
      trackingId: row.trackingId,
      recipientName: row.recipientName,
      recipientPhone: row.recipientPhone,
      recipientAddress: row.recipientAddress,
      codAmount: toMoney(row.codAmountMinor, row.currency),
      weightKg: row.weightKg,
      notConfiguredReason: row.notConfiguredReason,
      lastRawStatus: row.lastRawStatus,
      createdById: row.createdById,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  private shipmentData(shipment: Shipment) {
    return {
      orderId: shipment.orderId,
      orderNumber: shipment.orderNumber,
      courier: toEnum<ShipmentRow['courier']>(shipment.courier),
      status: toEnum<ShipmentRow['status']>(shipment.status),
      trackingId: shipment.trackingId,
      recipientName: shipment.recipientName,
      recipientPhone: shipment.recipientPhone,
      recipientAddress: shipment.recipientAddress,
      codAmountMinor: shipment.codAmount.amountMinor,
      currency: shipment.codAmount.currency,
      weightKg: shipment.weightKg,
      notConfiguredReason: shipment.notConfiguredReason,
      lastRawStatus: shipment.lastRawStatus,
      createdById: shipment.createdById,
    };
  }

  async create(shipment: Shipment, tx?: Tx): Promise<Shipment> {
    const row = await this.db(tx).shipment.create({
      data: {
        id: shipment.id,
        createdAt: date(shipment.createdAt),
        ...this.shipmentData(shipment),
      },
    });
    return this.toShipment(row);
  }

  async save(shipment: Shipment, tx?: Tx): Promise<void> {
    const db = this.db(tx);
    const existing = await db.shipment.findUnique({
      where: { id: shipment.id },
    });
    if (!existing) {
      await this.create(shipment, tx);
      return;
    }
    await db.shipment.update({
      where: { id: shipment.id },
      data: this.shipmentData(shipment),
    });
  }

  async findById(id: string, tx?: Tx): Promise<Shipment | null> {
    const row = await this.db(tx).shipment.findUnique({ where: { id } });
    return row ? this.toShipment(row) : null;
  }

  async findByTrackingId(
    courier: Courier,
    trackingId: string,
    tx?: Tx,
  ): Promise<Shipment | null> {
    const row = await this.db(tx).shipment.findFirst({
      where: { courier: toEnum<CourierEnum>(courier), trackingId },
    });
    return row ? this.toShipment(row) : null;
  }

  async listByOrder(orderId: string, tx?: Tx): Promise<Shipment[]> {
    const rows = await this.db(tx).shipment.findMany({
      where: { orderId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toShipment(row));
  }

  async list(
    filter: ShipmentListFilter,
    tx?: Tx,
  ): Promise<Shipment[]> {
    const rows = await this.db(tx).shipment.findMany({
      where: {
        courier: filter.courier
          ? toEnum<CourierEnum>(filter.courier)
          : undefined,
        status: filter.status
          ? toEnum<ShipmentStatusEnum>(filter.status)
          : undefined,
        orderNumber: filter.orderNumber,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toShipment(row));
  }

  async addEvent(event: ShipmentStatusEvent, tx?: Tx): Promise<void> {
    await this.db(tx).shipmentEvent.create({
      data: {
        id: event.id,
        shipmentId: event.shipmentId,
        status: toEnum(event.status),
        rawStatus: event.rawStatus,
        source: event.source,
        note: event.note,
        createdAt: date(event.createdAt),
      },
    });
  }

  async listEvents(
    shipmentId: string,
    tx?: Tx,
  ): Promise<ShipmentStatusEvent[]> {
    const rows = await this.db(tx).shipmentEvent.findMany({
      where: { shipmentId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      shipmentId: row.shipmentId,
      status: fromEnum(row.status),
      rawStatus: row.rawStatus,
      source: row.source as ShipmentStatusEvent['source'],
      note: row.note,
      createdAt: iso(row.createdAt),
    }));
  }

  private toRecord(row: {
    id: string;
    courier: ShipmentRow['courier'];
    providerEventId: string;
    shipmentId: string | null;
    payload: unknown;
    createdAt: Date;
  }): CourierWebhookRecord {
    return {
      id: row.id,
      courier: fromEnum(row.courier),
      providerEventId: row.providerEventId,
      shipmentId: row.shipmentId,
      payload: row.payload as Record<string, unknown>,
      createdAt: iso(row.createdAt),
    };
  }

  async recordWebhookDelivery(
    record: CourierWebhookRecord,
    tx?: Tx,
  ): Promise<{ record: CourierWebhookRecord; duplicate: boolean }> {
    const db = this.db(tx);
    const key = {
      courier: toEnum<ShipmentRow['courier']>(record.courier),
      providerEventId: record.providerEventId,
    };
    const existing = await db.courierWebhookEvent.findUnique({
      where: { courier_providerEventId: key },
    });
    if (existing) {
      return { record: this.toRecord(existing), duplicate: true };
    }
    try {
      const row = await db.courierWebhookEvent.create({
        data: {
          id: record.id,
          ...key,
          shipmentId: record.shipmentId,
          payload: record.payload as Prisma.InputJsonValue,
          createdAt: date(record.createdAt),
        },
      });
      return { record: this.toRecord(row), duplicate: false };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const stored = await db.courierWebhookEvent.findUnique({
          where: { courier_providerEventId: key },
        });
        if (stored) {
          return { record: this.toRecord(stored), duplicate: true };
        }
      }
      throw error;
    }
  }
}
