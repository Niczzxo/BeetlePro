import { Injectable } from '@nestjs/common';
import type {
  Courier,
  Shipment,
  ShipmentStatusEvent,
} from '@dostelo/types';
import {
  InMemoryDatabase,
  type CourierWebhookRecord,
} from '../../../store/in-memory.store';
import {
  ShippingRepository,
  type ShipmentListFilter,
} from './shipping.repository';

@Injectable()
export class InMemoryShippingRepository extends ShippingRepository {
  constructor(private readonly db: InMemoryDatabase) {
    super();
  }

  async create(shipment: Shipment): Promise<Shipment> {
    this.db.shipments.set(shipment.id, shipment);
    return shipment;
  }

  async save(shipment: Shipment): Promise<void> {
    this.db.shipments.set(shipment.id, shipment);
  }

  async findById(id: string): Promise<Shipment | null> {
    return this.db.shipments.get(id) ?? null;
  }

  async findByTrackingId(
    courier: Courier,
    trackingId: string,
  ): Promise<Shipment | null> {
    for (const shipment of this.db.shipments.values()) {
      if (
        shipment.courier === courier &&
        shipment.trackingId === trackingId
      ) {
        return shipment;
      }
    }
    return null;
  }

  async listByOrder(orderId: string): Promise<Shipment[]> {
    return [...this.db.shipments.values()]
      .filter((shipment) => shipment.orderId === orderId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async list(filter: ShipmentListFilter): Promise<Shipment[]> {
    return [...this.db.shipments.values()]
      .filter(
        (shipment) =>
          (!filter.courier || shipment.courier === filter.courier) &&
          (!filter.status || shipment.status === filter.status) &&
          (!filter.orderNumber ||
            shipment.orderNumber === filter.orderNumber),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async addEvent(event: ShipmentStatusEvent): Promise<void> {
    this.db.shipmentEvents.push(event);
  }

  async listEvents(shipmentId: string): Promise<ShipmentStatusEvent[]> {
    return this.db.shipmentEvents.filter(
      (event) => event.shipmentId === shipmentId,
    );
  }

  async recordWebhookDelivery(record: CourierWebhookRecord): Promise<{
    record: CourierWebhookRecord;
    duplicate: boolean;
  }> {
    const key = `${record.courier}:${record.providerEventId}`;
    const existing = this.db.courierWebhookEvents.get(key);
    if (existing) return { record: existing, duplicate: true };
    this.db.courierWebhookEvents.set(key, record);
    return { record, duplicate: false };
  }
}
