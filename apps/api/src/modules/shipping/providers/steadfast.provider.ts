import { Injectable } from '@nestjs/common';
import type { Courier, ShipmentStatus } from '@dostelo/types';
import { steadfastConfig } from '../../../config/shipping.config';
import { CourierHttpClient } from './courier-http';
import {
  CourierProvider,
  mapRawStatus,
  readStringField,
  type CourierCreateInput,
  type CourierCreateResult,
  type CourierStatusResult,
} from './courier-provider';

/**
 * Steadfast delivery_status vocabulary onto the canonical one:
 * pending, in_transit, delivered, partial_delivered, cancelled,
 * hold, unknown. 'unknown' deliberately maps to nothing: the raw
 * wording is recorded and no state is claimed.
 */
const STEADFAST_STATUS_RULES: ReadonlyArray<
  readonly [ShipmentStatus, readonly string[]]
> = [
  ['cancelled', ['cancel']],
  ['returned', ['return']],
  ['failed', ['fail', 'lost']],
  ['delivered', ['deliver']],
  ['picked-up', ['picked', 'pickup done', 'pickup_done']],
  ['in-transit', ['transit', 'on the way']],
  ['created', ['pending', 'hold', 'created']],
];

/**
 * Steadfast courier adapter (portal.steadfast.com.bd/api/v1).
 * The mapping follows Steadfast's public API: requests carry
 * Api-Key and Secret-Key headers, parcel creation is
 * POST /create_order with the order number as the invoice (the
 * answer's consignment_id is the tracking id), and status reads
 * are GET /status_by_cid/{consignment_id}, answering a
 * delivery_status string.
 *
 * Without STEADFAST_API_KEY and STEADFAST_SECRET_KEY the adapter
 * is not configured and refuses cleanly; it never invents a
 * consignment or a status.
 */
@Injectable()
export class SteadfastProvider extends CourierProvider {
  readonly courier: Courier = 'steadfast';

  constructor(private readonly http: CourierHttpClient) {
    super();
  }

  isConfigured(): boolean {
    return steadfastConfig().configured;
  }

  notConfiguredDetail(): string {
    const { missing } = steadfastConfig();
    return `steadfast courier is not configured: ${missing.join(' and ')} are not set. No parcel was booked.`;
  }

  mapStatus(rawStatus: string): ShipmentStatus | null {
    return mapRawStatus(rawStatus, STEADFAST_STATUS_RULES);
  }

  private headers(): Record<string, string> {
    const config = steadfastConfig();
    return {
      'api-key': config.apiKey ?? '',
      'secret-key': config.secretKey ?? '',
    };
  }

  async createParcel(
    input: CourierCreateInput,
  ): Promise<CourierCreateResult> {
    const config = steadfastConfig();
    if (!config.configured) {
      return {
        outcome: 'not-configured',
        trackingId: null,
        rawStatus: null,
        detail: this.notConfiguredDetail(),
      };
    }
    let body: unknown;
    try {
      const response = await this.http.request({
        method: 'POST',
        url: `${config.apiBaseUrl}/create_order`,
        headers: this.headers(),
        body: {
          invoice: input.orderNumber,
          recipient_name: input.recipientName,
          recipient_phone: input.recipientPhone,
          recipient_address: input.recipientAddress,
          cod_amount: input.codAmountMinor / 100,
          note: `Dostelo order ${input.orderNumber}`,
          item_description: 'Clothing parcel',
        },
      });
      body = response.body;
    } catch {
      return {
        outcome: 'failed',
        trackingId: null,
        rawStatus: null,
        detail: 'Steadfast is unreachable; the parcel was not booked.',
      };
    }
    const consignmentId = readStringField(
      body,
      ['consignment'],
      'consignment_id',
    );
    if (!consignmentId) {
      const message =
        readStringField(body, [], 'message') ?? 'unknown response';
      return {
        outcome: 'failed',
        trackingId: null,
        rawStatus: null,
        detail: `Steadfast did not confirm the booking: ${message}. No tracking id was issued.`,
      };
    }
    return {
      outcome: 'created',
      trackingId: consignmentId,
      rawStatus: readStringField(body, ['consignment'], 'status'),
      detail: null,
    };
  }

  async fetchStatus(trackingId: string): Promise<CourierStatusResult> {
    const config = steadfastConfig();
    if (!config.configured) {
      return {
        outcome: 'not-configured',
        canonical: null,
        rawStatus: null,
        detail: this.notConfiguredDetail(),
      };
    }
    let body: unknown;
    try {
      const response = await this.http.request({
        method: 'GET',
        url: `${config.apiBaseUrl}/status_by_cid/${encodeURIComponent(trackingId)}`,
        headers: this.headers(),
      });
      body = response.body;
    } catch {
      return {
        outcome: 'failed',
        canonical: null,
        rawStatus: null,
        detail: 'Steadfast is unreachable; no status was read.',
      };
    }
    const rawStatus = readStringField(body, [], 'delivery_status');
    if (!rawStatus) {
      return {
        outcome: 'failed',
        canonical: null,
        rawStatus: null,
        detail: 'Steadfast answered without a delivery_status.',
      };
    }
    return {
      outcome: 'ok',
      canonical: this.mapStatus(rawStatus),
      rawStatus,
      detail: null,
    };
  }
}
