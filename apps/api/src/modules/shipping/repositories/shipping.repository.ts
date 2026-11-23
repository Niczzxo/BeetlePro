import type {
  Courier,
  Shipment,
  ShipmentStatus,
  ShipmentStatusEvent,
} from '@dostelo/types';
import type { Tx } from '../../../prisma/prisma.service';
import type { CourierWebhookRecord } from '../../../store/in-memory.store';

export interface ShipmentListFilter {
  courier?: Courier;
  status?: ShipmentStatus;
  orderNumber?: string;
}

/**
 * Shipping persistence seam. The Prisma implementation maps to
 * the Shipment, ShipmentEvent and CourierWebhookEvent models in
 * the database schema.
 */
export abstract class ShippingRepository {
  abstract create(shipment: Shipment, tx?: Tx): Promise<Shipment>;
  abstract save(shipment: Shipment, tx?: Tx): Promise<void>;
  abstract findById(id: string, tx?: Tx): Promise<Shipment | null>;
  abstract findByTrackingId(
    courier: Courier,
    trackingId: string,
    tx?: Tx,
  ): Promise<Shipment | null>;
  abstract listByOrder(
    orderId: string,
    tx?: Tx,
  ): Promise<Shipment[]>;
  abstract list(
    filter: ShipmentListFilter,
    tx?: Tx,
  ): Promise<Shipment[]>;
  abstract addEvent(
    event: ShipmentStatusEvent,
    tx?: Tx,
  ): Promise<void>;
  abstract listEvents(
    shipmentId: string,
    tx?: Tx,
  ): Promise<ShipmentStatusEvent[]>;
  /**
   * Records a courier webhook delivery, keyed by courier plus
   * provider event id (the payment webhook pattern): a
   * redelivery comes back with duplicate true and the caller
   * applies nothing twice.
   */
  abstract recordWebhookDelivery(
    record: CourierWebhookRecord,
    tx?: Tx,
  ): Promise<{ record: CourierWebhookRecord; duplicate: boolean }>;
}
