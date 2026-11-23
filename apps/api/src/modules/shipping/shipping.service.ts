import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  COURIERS,
  money,
  type Courier,
  type CourierWebhookResult,
  type Order,
  type OrderStatus,
  type Shipment,
  type ShipmentDetail,
  type ShipmentStatus,
} from '@dostelo/types';
import {
  pathaoConfig,
  redxConfig,
  steadfastConfig,
} from '../../config/shipping.config';
import type { AuthPrincipal } from '../../common/auth/principal';
import { AuditService } from '../audit/audit.service';
import { OrdersService } from '../orders/orders.service';
import { ALLOWED_TRANSITIONS } from '../orders/policies/status-flow';
import { PaymentsRepository } from '../payments/repositories/payments.repository';
import { verifyCourierWebhookSignature } from './courier-webhook-signature';
import type { CreateShipment } from './dto/shipping.dto';
import { CourierProviderRegistry } from './providers/courier-provider.registry';
import {
  ShippingRepository,
  type ShipmentListFilter,
} from './repositories/shipping.repository';

/**
 * Order states a shipment may be booked from. 'pending' is out:
 * the order is not confirmed yet (in storefront terms its
 * payment is still pending), and the terminal and in-transit
 * states already have their parcel. The check names the state
 * it refuses, so staff see exactly why.
 */
const SHIPPABLE_ORDER_STATUSES: OrderStatus[] = [
  'confirmed',
  'processing',
  'packed',
  'ready-to-ship',
];

/** Shipment states that mean a parcel is already booked or done
 * for the order; a second booking is refused while one is here.
 * A not-configured, failed, returned or cancelled shipment does
 * not block a fresh booking. */
const ACTIVE_SHIPMENT_STATUSES: ShipmentStatus[] = [
  'created',
  'picked-up',
  'in-transit',
  'delivered',
];

const DEFAULT_WEIGHT_KG = 0.5;

export interface RefreshResult extends ShipmentDetail {
  /** True when the courier's answer changed the shipment. */
  refreshed: boolean;
  /** Why nothing changed, when refreshed is false: no tracking
   * id, courier not configured, courier unreachable, or the
   * status was already current. */
  refreshNote: string | null;
}

/** Shortest legal path through the order status flow from one
 * status to another, or null when the flow cannot get there.
 * Used so a courier milestone moves the order only along the
 * orders service's own legal transitions. */
function flowPath(
  from: OrderStatus,
  to: OrderStatus,
): OrderStatus[] | null {
  if (from === to) return [];
  const parent = new Map<OrderStatus, OrderStatus | null>([
    [from, null],
  ]);
  const queue: OrderStatus[] = [from];
  while (queue.length > 0) {
    const current = queue.shift() as OrderStatus;
    for (const next of ALLOWED_TRANSITIONS[current]) {
      if (parent.has(next)) continue;
      parent.set(next, current);
      if (next === to) {
        const path: OrderStatus[] = [];
        let cursor: OrderStatus | null = to;
        while (cursor !== null && cursor !== from) {
          path.unshift(cursor);
          cursor = parent.get(cursor) ?? null;
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

/**
 * Shipping service (Phase 6, chunk 2): courier booking, status
 * sync and courier webhooks for Pathao, Steadfast and RedX.
 *
 * Honesty rules, following the payments and communications
 * modules:
 * - A courier without merchant credentials books nothing: the
 *   shipment is recorded 'not-configured' with the missing
 *   variables named, and no tracking id exists.
 * - A configured courier that refuses or cannot be reached
 *   records a 'failed' shipment with the courier's answer; the
 *   booking is never dressed up as created.
 * - Courier statuses land on the canonical vocabulary through
 *   each adapter's mapping; the raw wording is preserved.
 * - A delivered (or picked-up, in-transit, returned) report
 *   moves the order only through OrdersService.transition along
 *   the legal flow path, never by direct writes.
 */
@Injectable()
export class ShippingService {
  constructor(
    private readonly shipping: ShippingRepository,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsRepository,
    private readonly couriers: CourierProviderRegistry,
    @Optional() private readonly audit?: AuditService,
  ) {}

  /**
   * Books a parcel for an order with the chosen courier. The
   * recipient and COD amount come from the order itself; the
   * shipment record exists whatever the courier answers, with
   * the honest outcome as its status.
   */
  async createShipment(
    dto: CreateShipment,
    actor: AuthPrincipal | null,
  ): Promise<Shipment> {
    const order = await this.orders.getByNumber(dto.orderNumber);
    if (!SHIPPABLE_ORDER_STATUSES.includes(order.status)) {
      throw new BadRequestException(
        `Order ${order.orderNumber} cannot be shipped from status ${order.status}; shipments are booked for confirmed, processing, packed or ready-to-ship orders.`,
      );
    }
    const active = (await this.shipping.listByOrder(order.id)).find(
      (shipment) => ACTIVE_SHIPMENT_STATUSES.includes(shipment.status),
    );
    if (active) {
      throw new ConflictException(
        `Order ${order.orderNumber} already has a ${active.status} shipment with ${active.courier} (${active.id}); a second active booking is refused.`,
      );
    }
    const provider = this.couriers.forCourier(dto.courier);
    const now = new Date().toISOString();
    const shipment: Shipment = {
      id: randomUUID(),
      orderId: order.id,
      orderNumber: order.orderNumber,
      courier: dto.courier,
      status: 'not-configured',
      trackingId: null,
      recipientName: order.address.fullName,
      recipientPhone: order.address.phone,
      recipientAddress: [
        order.address.addressLine,
        order.address.area,
        order.address.city,
        order.address.district,
      ]
        .filter(Boolean)
        .join(', '),
      codAmount: money(await this.codAmountMinorFor(order)),
      weightKg: dto.weightKg ?? DEFAULT_WEIGHT_KG,
      notConfiguredReason: null,
      lastRawStatus: null,
      createdById: actor?.id ?? null,
      createdAt: now,
      updatedAt: now,
    };
    const result = await provider.createParcel({
      orderNumber: order.orderNumber,
      recipientName: shipment.recipientName,
      recipientPhone: shipment.recipientPhone,
      recipientAddress: shipment.recipientAddress,
      codAmountMinor: shipment.codAmount.amountMinor,
      weightKg: shipment.weightKg,
      itemCount: order.items.reduce(
        (sum, item) => sum + item.quantity,
        0,
      ),
    });
    if (result.outcome === 'created' && result.trackingId) {
      shipment.status = 'created';
      shipment.trackingId = result.trackingId;
    } else if (result.outcome === 'not-configured') {
      shipment.status = 'not-configured';
      shipment.notConfiguredReason = result.detail;
    } else {
      // A configured courier refused, was unreachable, or
      // answered without a tracking id: the booking failed and
      // the record says so, with the courier's answer as detail.
      shipment.status = 'failed';
    }
    shipment.lastRawStatus = result.rawStatus;
    await this.shipping.create(shipment);
    await this.shipping.addEvent({
      id: randomUUID(),
      shipmentId: shipment.id,
      status: shipment.status,
      rawStatus: result.rawStatus,
      source: 'create',
      note: result.detail,
      createdAt: now,
    });
    await this.recordAudit(actor, 'shipment.created', shipment, {
      orderNumber: order.orderNumber,
      courier: shipment.courier,
      status: shipment.status,
      trackingId: shipment.trackingId,
    });
    return shipment;
  }

  async listShipments(filter: ShipmentListFilter): Promise<Shipment[]> {
    return this.shipping.list(filter);
  }

  async getDetail(id: string): Promise<ShipmentDetail> {
    const shipment = await this.getShipment(id);
    return { shipment, events: await this.shipping.listEvents(id) };
  }

  /**
   * Asks the courier for the current status and applies it.
   * Honest no-ops: a shipment with no tracking id has nothing to
   * refresh, and an unconfigured courier cannot be asked; both
   * answer with refreshed false and the reason, recording no
   * event.
   */
  async refreshStatus(
    id: string,
    actor: AuthPrincipal | null,
  ): Promise<RefreshResult> {
    const shipment = await this.getShipment(id);
    const detail = async (): Promise<RefreshResult> => ({
      shipment: await this.getShipment(id),
      events: await this.shipping.listEvents(id),
      refreshed: false,
      refreshNote: null,
    });
    if (!shipment.trackingId) {
      return {
        ...(await detail()),
        refreshNote:
          'This shipment has no tracking id: the courier never confirmed a booking, so there is no status to refresh.',
      };
    }
    const provider = this.couriers.forCourier(shipment.courier);
    const result = await provider.fetchStatus(shipment.trackingId);
    if (result.outcome !== 'ok') {
      return {
        ...(await detail()),
        refreshNote:
          result.detail ??
          'The courier could not provide a status right now.',
      };
    }
    if (!result.canonical) {
      return {
        ...(await detail()),
        refreshNote: `The courier reported a status this system does not map: ${result.rawStatus ?? 'unknown'}. It was not applied.`,
      };
    }
    const applied = await this.applyStatus(
      shipment,
      result.canonical,
      result.rawStatus,
      'refresh',
      actor,
    );
    const after = await detail();
    return {
      ...after,
      refreshed: applied,
      refreshNote: applied
        ? null
        : 'The courier status is unchanged since the last update.',
    };
  }

  /**
   * Courier webhook receiver logic: POST
   * /v1/webhooks/couriers/:courier.
   *
   * Trust rules, mirroring the payment webhooks:
   * 1. Only the three couriers with adapters have an endpoint;
   *    anything else is a 404.
   * 2. With no webhook secret configured for the courier, the
   *    delivery is rejected (503): unsigned state changes are
   *    never trusted.
   * 3. A bad signature is rejected (401) and nothing is
   *    recorded or applied.
   * 4. A verified delivery is stored keyed by courier plus
   *    provider event id; a redelivery returns duplicate and
   *    applies nothing.
   * 5. A first, verified delivery applies its mapped status to
   *    the shipment (and, through the legal flow, to the order).
   */
  async handleCourierWebhook(
    courierParam: string,
    payload: Record<string, unknown>,
    signature: string | undefined,
    rawBody: string | undefined,
  ): Promise<CourierWebhookResult> {
    if (!COURIERS.includes(courierParam as Courier)) {
      throw new NotFoundException(
        `No courier webhook endpoint for courier: ${courierParam}`,
      );
    }
    const courier = courierParam as Courier;
    const secret = this.webhookSecretFor(courier);
    if (!secret) {
      throw new ServiceUnavailableException(
        `Webhook not configured for courier: ${courier} (${this.webhookSecretEnvName(courier)} is not set).`,
      );
    }
    const body = rawBody ?? JSON.stringify(payload);
    if (!verifyCourierWebhookSignature(body, signature, secret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    const trackingId = firstString(payload, [
      'consignment_id',
      'tracking_code',
      'tracking_id',
      'consignmentId',
      'trackingId',
    ]);
    const rawStatus = firstString(payload, [
      'delivery_status',
      'status',
      'order_status',
    ]);
    const providerEventId =
      firstString(payload, ['event_id', 'delivery_id', 'webhook_id', 'id']) ??
      createHash('sha256').update(body).digest('hex');
    const shipment = trackingId
      ? await this.shipping.findByTrackingId(courier, trackingId)
      : null;
    const { record, duplicate } = await this.shipping.recordWebhookDelivery({
      id: randomUUID(),
      courier,
      providerEventId,
      shipmentId: shipment?.id ?? null,
      payload,
      createdAt: new Date().toISOString(),
    });
    if (duplicate) {
      return {
        received: true,
        duplicate: true,
        applied: false,
        shipmentId: record.shipmentId,
      };
    }
    if (!shipment) {
      return {
        received: true,
        duplicate: false,
        applied: false,
        shipmentId: null,
        reason:
          'No shipment matches this delivery; it was recorded only.',
      };
    }
    if (!rawStatus) {
      return {
        received: true,
        duplicate: false,
        applied: false,
        shipmentId: shipment.id,
        reason: 'The delivery carries no status; it was recorded only.',
      };
    }
    const canonical = this.couriers.forCourier(courier).mapStatus(rawStatus);
    if (!canonical) {
      return {
        received: true,
        duplicate: false,
        applied: false,
        shipmentId: shipment.id,
        reason: `Unhandled courier status: ${rawStatus}`,
      };
    }
    const applied = await this.applyStatus(
      shipment,
      canonical,
      rawStatus,
      'webhook',
      null,
    );
    return {
      received: true,
      duplicate: false,
      applied,
      shipmentId: shipment.id,
    };
  }

  /**
   * Applies one canonical status to a shipment: records the
   * event, then moves the order toward the matching milestone
   * along the legal flow path. Returns false when the shipment
   * already carries exactly this status and raw wording (a
   * repeated poll or a duplicate report), so nothing is recorded
   * twice for the same fact.
   */
  private async applyStatus(
    shipment: Shipment,
    canonical: ShipmentStatus,
    rawStatus: string | null,
    source: 'refresh' | 'webhook',
    actor: AuthPrincipal | null,
  ): Promise<boolean> {
    if (
      canonical === shipment.status &&
      rawStatus === shipment.lastRawStatus
    ) {
      return false;
    }
    const previousStatus = shipment.status;
    shipment.status = canonical;
    shipment.lastRawStatus = rawStatus ?? shipment.lastRawStatus;
    shipment.updatedAt = new Date().toISOString();
    await this.shipping.save(shipment);
    await this.shipping.addEvent({
      id: randomUUID(),
      shipmentId: shipment.id,
      status: canonical,
      rawStatus,
      source,
      note: null,
      createdAt: shipment.updatedAt,
    });
    const advancedTo = await this.advanceOrder(shipment, canonical, actor);
    await this.recordAudit(actor, 'shipment.status-updated', shipment, {
      orderNumber: shipment.orderNumber,
      courier: shipment.courier,
      from: previousStatus,
      to: canonical,
      rawStatus,
      source,
      orderAdvancedTo: advancedTo,
    });
    return true;
  }

  /**
   * Moves the shipment's order toward the milestone a canonical
   * status implies, one legal transition at a time through the
   * orders service. Milestones: picked-up and in-transit mean
   * the order is shipped; delivered means delivered; returned
   * means returned, and only from delivered (a parcel reported
   * returned earlier never walks the order through delivered,
   * which would wrongly collect COD). Returns the order status
   * reached, or null when no move applied.
   */
  private async advanceOrder(
    shipment: Shipment,
    canonical: ShipmentStatus,
    actor: AuthPrincipal | null,
  ): Promise<OrderStatus | null> {
    const target: OrderStatus | null =
      canonical === 'picked-up' || canonical === 'in-transit'
        ? 'shipped'
        : canonical === 'delivered'
          ? 'delivered'
          : canonical === 'returned'
            ? 'returned'
            : null;
    if (!target) return null;
    let order: Order;
    try {
      order = await this.orders.getByNumber(shipment.orderNumber);
    } catch {
      return null;
    }
    if (canonical === 'returned' && order.status !== 'delivered') {
      return null;
    }
    const path = flowPath(order.status, target);
    if (!path || path.length === 0) return null;
    for (const step of path) {
      await this.orders.transition(
        shipment.orderNumber,
        {
          status: step,
          note: `${shipment.courier} reported ${canonical} (tracking ${shipment.trackingId ?? 'none'})`,
          actorId: actor?.id ?? undefined,
        },
        null,
      );
    }
    return target;
  }

  /** COD cash to collect: the order total when the order carries
   * a COD payment that has not been collected or settled, else
   * zero (a prepaid order collects nothing at the door). */
  private async codAmountMinorFor(order: Order): Promise<number> {
    const attempts = await this.payments.listByOrder(order.id);
    const hasCod = attempts.some(
      (payment) => payment.gateway === 'cod',
    );
    if (!hasCod) return 0;
    if (
      order.paymentStatus === 'successful' ||
      order.paymentStatus === 'collected' ||
      order.paymentStatus === 'refunded'
    ) {
      return 0;
    }
    return order.total.amountMinor;
  }

  private async getShipment(id: string): Promise<Shipment> {
    const shipment = await this.shipping.findById(id);
    if (!shipment) {
      throw new NotFoundException(`Shipment not found: ${id}`);
    }
    return shipment;
  }

  private webhookSecretFor(courier: Courier): string | null {
    switch (courier) {
      case 'pathao':
        return pathaoConfig().webhookSecret;
      case 'steadfast':
        return steadfastConfig().webhookSecret;
      case 'redx':
        return redxConfig().webhookSecret;
    }
  }

  private webhookSecretEnvName(courier: Courier): string {
    switch (courier) {
      case 'pathao':
        return 'PATHAO_WEBHOOK_SECRET';
      case 'steadfast':
        return 'STEADFAST_WEBHOOK_SECRET';
      case 'redx':
        return 'REDX_WEBHOOK_SECRET';
    }
  }

  private async recordAudit(
    actor: AuthPrincipal | null,
    action: string,
    shipment: Shipment,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    if (!this.audit) return;
    if (actor) {
      await this.audit.recordForPrincipal(actor, {
        action,
        entityType: 'shipment',
        entityId: shipment.id,
        metadata,
      });
    } else {
      await this.audit.record({
        actorType: 'system',
        actorId: null,
        action,
        entityType: 'shipment',
        entityId: shipment.id,
        metadata,
      });
    }
  }
}

/** First non-empty string (or number, stringified) among the
 * candidate field names, for reading courier webhook payloads
 * whose shapes differ per courier. */
function firstString(
  payload: Record<string, unknown>,
  fields: readonly string[],
): string | null {
  for (const field of fields) {
    const value = payload[field];
    if (typeof value === 'string' && value) return value;
    if (typeof value === 'number') return String(value);
  }
  return null;
}
