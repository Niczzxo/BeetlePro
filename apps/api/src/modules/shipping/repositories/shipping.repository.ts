import type {
  Courier,
  Shipment,
  ShipmentStatus,
  ShipmentStatusEvent,
} from '@dostelo/types';
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
  abstract create(shipment: Shipment): Shipment;
  abstract save(shipment: Shipment): void;
  abstract findById(id: string): Shipment | null;
  abstract findByTrackingId(
    courier: Courier,
    trackingId: string,
  ): Shipment | null;
  abstract listByOrder(orderId: string): Shipment[];
  abstract list(filter: ShipmentListFilter): Shipment[];
  abstract addEvent(event: ShipmentStatusEvent): void;
  abstract listEvents(shipmentId: string): ShipmentStatusEvent[];
  /**
   * Records a courier webhook delivery, keyed by courier plus
   * provider event id (the payment webhook pattern): a
   * redelivery comes back with duplicate true and the caller
   * applies nothing twice.
   */
  abstract recordWebhookDelivery(record: CourierWebhookRecord): {
    record: CourierWebhookRecord;
    duplicate: boolean;
  };
}
