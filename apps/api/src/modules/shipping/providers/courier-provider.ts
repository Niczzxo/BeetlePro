import type { Courier, ShipmentStatus } from '@dostelo/types';

/** What a courier booking needs, built by the shipping service
 * from the order: the merchant invoice id is the order number,
 * the recipient comes from the order address, and the COD amount
 * is the cash the courier must collect (0 for prepaid orders). */
export interface CourierCreateInput {
  orderNumber: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  /** COD amount in minor units; adapters convert to taka at
   * their boundary, as the payment providers do. */
  codAmountMinor: number;
  weightKg: number;
  itemCount: number;
}

export interface CourierCreateResult {
  /**
   * - 'created': the courier confirmed the booking and issued a
   *   tracking id.
   * - 'not-configured': the courier has no merchant credentials
   *   in this environment; nothing was booked and no tracking id
   *   exists.
   * - 'failed': a configured courier was asked and refused or
   *   could not be reached.
   */
  outcome: 'created' | 'not-configured' | 'failed';
  trackingId: string | null;
  /** The courier's own status wording at creation, when it gave
   * one. */
  rawStatus: string | null;
  /** Human-readable detail: the missing variables for
   * not-configured, the courier's refusal otherwise. */
  detail: string | null;
}

export interface CourierStatusResult {
  outcome: 'ok' | 'not-configured' | 'failed';
  /** Canonical mapping of the raw status, null when the courier
   * used a status this codebase does not map. */
  canonical: ShipmentStatus | null;
  rawStatus: string | null;
  detail: string | null;
}

/**
 * One courier adapter, following the payment provider pattern:
 * the registry routes a courier key to its adapter, an adapter
 * whose credentials are absent answers not-configured, and no
 * adapter ever invents a booking, a tracking id or a status.
 * Adapters are async because real bookings are network calls,
 * made through the injectable CourierHttpClient.
 */
export abstract class CourierProvider {
  abstract readonly courier: Courier;
  /** Whether this adapter can run right now. */
  abstract isConfigured(): boolean;
  /** The not-configured explanation naming the missing
   * environment variables, recorded on the shipment. */
  abstract notConfiguredDetail(): string;
  abstract createParcel(
    input: CourierCreateInput,
  ): Promise<CourierCreateResult>;
  abstract fetchStatus(
    trackingId: string,
  ): Promise<CourierStatusResult>;
  /** Maps one of the courier's raw status strings onto the
   * canonical vocabulary; null when unrecognised (the delivery
   * is still recorded, with the raw wording preserved). */
  abstract mapStatus(rawStatus: string): ShipmentStatus | null;
}

/**
 * Ordered substring rules for one courier's status vocabulary.
 * The first rule whose needle appears in the lowercased raw
 * status wins, so adapters list their specific phrases before
 * generic ones (a RedX 'pickup-pending' must read as created,
 * not picked-up) and the failed rules before delivered
 * ('delivery-failed' contains 'deliver'). Returns null when
 * nothing matches.
 */
export function mapRawStatus(
  rawStatus: string,
  rules: ReadonlyArray<readonly [ShipmentStatus, readonly string[]]>,
): ShipmentStatus | null {
  const raw = rawStatus.toLowerCase();
  for (const [status, needles] of rules) {
    if (needles.some((needle) => raw.includes(needle))) return status;
  }
  return null;
}

/** Reads a string field from a courier response body that may be
 * nested one level down (several couriers wrap answers in a
 * `data` or named envelope). Returns null when absent. */
export function readStringField(
  body: unknown,
  envelopes: readonly string[],
  field: string,
): string | null {
  if (!body || typeof body !== 'object') return null;
  const root = body as Record<string, unknown>;
  const direct = root[field];
  if (typeof direct === 'string' && direct) return direct;
  if (typeof direct === 'number') return String(direct);
  for (const envelope of envelopes) {
    const inner = root[envelope];
    if (inner && typeof inner === 'object') {
      const value = (inner as Record<string, unknown>)[field];
      if (typeof value === 'string' && value) return value;
      if (typeof value === 'number') return String(value);
    }
  }
  return null;
}
