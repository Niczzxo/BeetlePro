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

  create(shipment: Shipment): Shipment {
    this.db.shipments.set(shipment.id, shipment);
    return shipment;
  }

  save(shipment: Shipment): void {
    this.db.shipments.set(shipment.id, shipment);
  }

  findById(id: string): Shipment | null {
    return this.db.shipments.get(id) ?? null;
  }

  findByTrackingId(
    courier: Courier,
    trackingId: string,
  ): Shipment | null {
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

  listByOrder(orderId: string): Shipment[] {
    return [...this.db.shipments.values()]
      .filter((shipment) => shipment.orderId === orderId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  list(filter: ShipmentListFilter): Shipment[] {
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

  addEvent(event: ShipmentStatusEvent): void {
    this.db.shipmentEvents.push(event);
  }

  listEvents(shipmentId: string): ShipmentStatusEvent[] {
    return this.db.shipmentEvents.filter(
      (event) => event.shipmentId === shipmentId,
    );
  }

  recordWebhookDelivery(record: CourierWebhookRecord): {
    record: CourierWebhookRecord;
    duplicate: boolean;
  } {
    const key = `${record.courier}:${record.providerEventId}`;
    const existing = this.db.courierWebhookEvents.get(key);
    if (existing) return { record: existing, duplicate: true };
    this.db.courierWebhookEvents.set(key, record);
    return { record, duplicate: false };
  }
}
