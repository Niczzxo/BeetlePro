import { Injectable } from '@nestjs/common';
import type { Courier, ShipmentStatus } from '@dostelo/types';
import {
  pathaoConfig,
  type PathaoConfig,
} from '../../../config/shipping.config';
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
 * Pathao status vocabulary onto the canonical one. Pathao
 * reports an order_status (Pending, Pickup Requested, Picked,
 * At Sorting Hub, Out for Delivery and similar) and a
 * delivery_status (pending, in_transit, delivered,
 * partial_delivered, cancelled, hold, in_review, returned).
 * 'Pickup Requested' is still with the store, so it maps to
 * created; only an explicit picked wording is picked-up.
 */
const PATHAO_STATUS_RULES: ReadonlyArray<
  readonly [ShipmentStatus, readonly string[]]
> = [
  ['cancelled', ['cancel']],
  ['returned', ['return']],
  ['failed', ['fail', 'lost']],
  // 'Out for Delivery' contains 'deliver', so it is read before
  // the delivered rule below.
  ['in-transit', ['out for delivery', 'out_for_delivery']],
  ['delivered', ['deliver']],
  ['picked-up', ['picked']],
  ['in-transit', ['transit', 'hub', 'on the way']],
  ['created', ['pending', 'pickup', 'hold', 'review', 'created']],
];

/**
 * Pathao courier adapter (api-hermes.pathao.com). The mapping
 * follows Pathao's public merchant API: an OAuth-style token
 * grant at /aladdin/api/v1/issue-token with the merchant
 * credentials, parcel creation at /aladdin/api/v1/orders
 * (consignment_id is the tracking id), and status reads at
 * /aladdin/api/v1/orders/{consignment_id}.
 *
 * Without PATHAO_CLIENT_ID, PATHAO_CLIENT_SECRET,
 * PATHAO_USERNAME, PATHAO_PASSWORD and PATHAO_STORE_ID the
 * adapter is not configured and refuses cleanly; it never
 * invents a token, a consignment or a status.
 */
@Injectable()
export class PathaoProvider extends CourierProvider {
  readonly courier: Courier = 'pathao';

  constructor(private readonly http: CourierHttpClient) {
    super();
  }

  isConfigured(): boolean {
    return pathaoConfig().configured;
  }

  notConfiguredDetail(): string {
    const { missing } = pathaoConfig();
    return `pathao courier is not configured: ${missing.join(' and ')} are not set. No parcel was booked.`;
  }

  mapStatus(rawStatus: string): ShipmentStatus | null {
    return mapRawStatus(rawStatus, PATHAO_STATUS_RULES);
  }

  private async issueToken(config: PathaoConfig): Promise<string | null> {
    const clientSecret = config.clientSecret;
    const merchantPassword = config.password;
    try {
      const response = await this.http.request({
        method: 'POST',
        url: `${config.apiBaseUrl}/aladdin/api/v1/issue-token`,
        body: {
          client_id: config.clientId,
          client_secret: clientSecret,
          grant_type: 'password',
          username: config.username,
          password: merchantPassword,
        },
      });
      return readStringField(response.body, [], 'access_token');
    } catch {
      return null;
    }
  }

  async createParcel(
    input: CourierCreateInput,
  ): Promise<CourierCreateResult> {
    const config = pathaoConfig();
    if (!config.configured) {
      return {
        outcome: 'not-configured',
        trackingId: null,
        rawStatus: null,
        detail: this.notConfiguredDetail(),
      };
    }
    const token = await this.issueToken(config);
    if (!token) {
      return {
        outcome: 'failed',
        trackingId: null,
        rawStatus: null,
        detail:
          'Pathao refused the token grant; the parcel was not booked.',
      };
    }
    let body: unknown;
    try {
      const response = await this.http.request({
        method: 'POST',
        url: `${config.apiBaseUrl}/aladdin/api/v1/orders`,
        headers: { authorization: `Bearer ${token}` },
        body: {
          store_id: Number(config.storeId),
          merchant_order_id: input.orderNumber,
          recipient_name: input.recipientName,
          recipient_phone: input.recipientPhone,
          recipient_address: input.recipientAddress,
          delivery_type: 48,
          item_type: 2,
          special_instruction: '',
          item_quantity: input.itemCount,
          item_weight: input.weightKg,
          amount_to_collect: input.codAmountMinor / 100,
        },
      });
      body = response.body;
    } catch {
      return {
        outcome: 'failed',
        trackingId: null,
        rawStatus: null,
        detail: 'Pathao is unreachable; the parcel was not booked.',
      };
    }
    const consignmentId = readStringField(
      body,
      ['data'],
      'consignment_id',
    );
    if (!consignmentId) {
      const message =
        readStringField(body, [], 'message') ?? 'unknown response';
      return {
        outcome: 'failed',
        trackingId: null,
        rawStatus: null,
        detail: `Pathao did not confirm the booking: ${message}. No tracking id was issued.`,
      };
    }
    return {
      outcome: 'created',
      trackingId: consignmentId,
      rawStatus:
        readStringField(body, ['data'], 'delivery_status') ??
        readStringField(body, ['data'], 'order_status'),
      detail: null,
    };
  }

  async fetchStatus(trackingId: string): Promise<CourierStatusResult> {
    const config = pathaoConfig();
    if (!config.configured) {
      return {
        outcome: 'not-configured',
        canonical: null,
        rawStatus: null,
        detail: this.notConfiguredDetail(),
      };
    }
    const token = await this.issueToken(config);
    if (!token) {
      return {
        outcome: 'failed',
        canonical: null,
        rawStatus: null,
        detail: 'Pathao refused the token grant; no status was read.',
      };
    }
    let body: unknown;
    try {
      const response = await this.http.request({
        method: 'GET',
        url: `${config.apiBaseUrl}/aladdin/api/v1/orders/${encodeURIComponent(trackingId)}`,
        headers: { authorization: `Bearer ${token}` },
      });
      body = response.body;
    } catch {
      return {
        outcome: 'failed',
        canonical: null,
        rawStatus: null,
        detail: 'Pathao is unreachable; no status was read.',
      };
    }
    const rawStatus =
      readStringField(body, ['data'], 'delivery_status') ??
      readStringField(body, ['data'], 'order_status');
    if (!rawStatus) {
      return {
        outcome: 'failed',
        canonical: null,
        rawStatus: null,
        detail: 'Pathao answered without a status for this consignment.',
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
