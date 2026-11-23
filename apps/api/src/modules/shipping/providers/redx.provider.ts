import { Injectable } from '@nestjs/common';
import type { Courier, ShipmentStatus } from '@dostelo/types';
import { redxConfig } from '../../../config/shipping.config';
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
 * RedX status vocabulary onto the canonical one. RedX reports
 * hyphenated lifecycle strings (pickup-pending,
 * pickup-completed, in-transit, out-for-delivery, delivered,
 * delivery-failed, returned). The pending pickup must be read
 * before the generic pickup rule, so it maps to created: the
 * parcel is booked but still with the store.
 */
const REDX_STATUS_RULES: ReadonlyArray<
  readonly [ShipmentStatus, readonly string[]]
> = [
  ['cancelled', ['cancel']],
  ['returned', ['return']],
  ['failed', ['fail', 'lost']],
  // 'out-for-delivery' contains 'deliver', so it is read before
  // the delivered rule below.
  ['in-transit', ['out-for-delivery', 'out_for_delivery']],
  ['delivered', ['deliver']],
  ['created', ['pickup-pending', 'pickup_pending', 'pending', 'created']],
  ['picked-up', ['pickup', 'picked']],
  ['in-transit', ['transit', 'on the way', 'hub']],
];

/**
 * RedX courier adapter (openapi.redx.com.bd/v1). The mapping
 * follows RedX's public open API: requests carry an
 * API-ACCESS-TOKEN header, parcel creation is POST /parcel with
 * the order number as merchant_invoice_id (the answer's
 * tracking_id is the tracking id), and tracking reads are
 * GET /parcel/track/{tracking_id}.
 *
 * Without REDX_ACCESS_TOKEN the adapter is not configured and
 * refuses cleanly; it never invents a tracking id or a status.
 */
@Injectable()
export class RedxProvider extends CourierProvider {
  readonly courier: Courier = 'redx';

  constructor(private readonly http: CourierHttpClient) {
    super();
  }

  isConfigured(): boolean {
    return redxConfig().configured;
  }

  notConfiguredDetail(): string {
    const { missing } = redxConfig();
    return `redx courier is not configured: ${missing.join(' and ')} are not set. No parcel was booked.`;
  }

  mapStatus(rawStatus: string): ShipmentStatus | null {
    return mapRawStatus(rawStatus, REDX_STATUS_RULES);
  }

  private headers(): Record<string, string> {
    return {
      'api-access-token': redxConfig().accessToken ?? '',
    };
  }

  async createParcel(
    input: CourierCreateInput,
  ): Promise<CourierCreateResult> {
    const config = redxConfig();
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
        url: `${config.apiBaseUrl}/parcel`,
        headers: this.headers(),
        body: {
          customer_name: input.recipientName,
          customer_phone: input.recipientPhone,
          customer_address: input.recipientAddress,
          merchant_invoice_id: input.orderNumber,
          cash_collection_amount: input.codAmountMinor / 100,
          parcel_weight: input.weightKg,
          value: input.codAmountMinor / 100,
        },
      });
      body = response.body;
    } catch {
      return {
        outcome: 'failed',
        trackingId: null,
        rawStatus: null,
        detail: 'RedX is unreachable; the parcel was not booked.',
      };
    }
    const trackingId = readStringField(body, ['data'], 'tracking_id');
    if (!trackingId) {
      const message =
        readStringField(body, [], 'message') ?? 'unknown response';
      return {
        outcome: 'failed',
        trackingId: null,
        rawStatus: null,
        detail: `RedX did not confirm the booking: ${message}. No tracking id was issued.`,
      };
    }
    return {
      outcome: 'created',
      trackingId,
      rawStatus: readStringField(body, ['data'], 'status'),
      detail: null,
    };
  }

  async fetchStatus(trackingId: string): Promise<CourierStatusResult> {
    const config = redxConfig();
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
        url: `${config.apiBaseUrl}/parcel/track/${encodeURIComponent(trackingId)}`,
        headers: this.headers(),
      });
      body = response.body;
    } catch {
      return {
        outcome: 'failed',
        canonical: null,
        rawStatus: null,
        detail: 'RedX is unreachable; no status was read.',
      };
    }
    const rawStatus =
      readStringField(body, ['data'], 'status') ??
      readStringField(body, ['data'], 'delivery_status');
    if (!rawStatus) {
      return {
        outcome: 'failed',
        canonical: null,
        rawStatus: null,
        detail: 'RedX answered without a status for this parcel.',
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
