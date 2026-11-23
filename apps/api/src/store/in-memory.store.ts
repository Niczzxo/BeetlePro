import { Injectable } from '@nestjs/common';
import type {
  AbandonedCart,
  AdminRole,
  AuditLogEntry,
  Cart,
  Category,
  CommunicationLog,
  ConsentRecord,
  Courier,
  Customer,
  CustomerNote,
  FollowUpTask,
  IdentityLink,
  Lead,
  LeadContactAttempt,
  Order,
  OrderStatus,
  Payment,
  PaymentEvent,
  Product,
  RecoveryAttempt,
  RecoverySettings,
  Refund,
  Shipment,
  ShipmentStatusEvent,
  VisitorEvent,
  VisitorSession,
  WebhookEvent,
} from '@dostelo/types';

/** A customer record as stored, including the password hash. The
 * public Customer type never carries the hash; services strip it. */
export interface StoredCustomer extends Customer {
  passwordHash: string | null;
}

/**
 * A staff account as stored (Phase 4). Mirrors the User plus
 * AdminUser models in the Prisma schema, flattened for the
 * in-memory store: roles are the AdminRole keys from
 * @dostelo/types, and the TOTP secret stays server-side only.
 */
export interface StoredAdminUser {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  roles: AdminRole[];
  isActive: boolean;
  mfaSecret: string | null;
  mfaEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * A refresh-token session as stored (Phase 4), mirroring the
 * Prisma Session model. The token itself is never stored: only
 * its SHA-256 hash. Rotation keeps one familyId per login; a
 * session is revoked on logout, on rotation (replacedById points
 * at its successor), or wholesale when a rotated token is reused.
 * subjectId is the customer id or admin user id, per subjectType;
 * in the Prisma shape both resolve through the User model.
 */
export interface StoredSession {
  id: string;
  subjectType: 'customer' | 'admin';
  subjectId: string;
  familyId: string;
  refreshTokenHash: string;
  replacedById: string | null;
  revokedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface OrderStatusEventRecord {
  id: string;
  orderId: string;
  status: OrderStatus;
  note: string | null;
  actorId: string | null;
  createdAt: string;
}

/**
 * A courier webhook delivery as recorded (Phase 6, chunk 2),
 * mirroring the CourierWebhookEvent model. Deliveries are keyed
 * by courier plus provider event id so a redelivery is
 * recognised as a duplicate and never applied twice.
 */
export interface CourierWebhookRecord {
  id: string;
  courier: Courier;
  providerEventId: string;
  shipmentId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface StockRecord {
  productId: string;
  onHand: number;
  reserved: number;
}

export interface ReservationLine {
  variantId: string;
  quantity: number;
}

/**
 * A stored visitor event (Phase 5). marketingUsable is the consent
 * flag from the architecture: when the visitor has denied the
 * marketing scope, the event is still stored as an operational
 * record but every marketing use must exclude it. It lives on the
 * stored record, not the public VisitorEvent type, because it is
 * derived server-side from the visitor's consent records.
 */
export interface StoredVisitorEvent extends VisitorEvent {
  marketingUsable: boolean;
}

/** A recorded opt-out (Phase 5), mirroring the SuppressionRecord
 * model: contact for the lead (and its phone, when known) is
 * suppressed across leads and, later, cart recovery. */
export interface SuppressionRecord {
  id: string;
  leadId: string | null;
  customerId: string | null;
  phone: string | null;
  reason: string;
  createdAt: string;
}

/**
 * The in-memory data store behind every repository in this phase.
 *
 * This exists because Prisma engine binaries cannot be downloaded in
 * the current environment, so no generated Prisma client and no live
 * PostgreSQL are available. Repositories read and write these maps
 * through their interfaces; when the Prisma implementation lands,
 * only the repository classes change. Nothing here pretends to be a
 * database connection: state is per-process and resets on restart.
 */
@Injectable()
export class InMemoryDatabase {
  readonly categories = new Map<string, Category>();
  readonly products = new Map<string, Product>();
  readonly customers = new Map<string, StoredCustomer>();
  /** Staff accounts (Phase 4), keyed by admin user id. Seeded
   * only from environment variables; empty when unseeded. */
  readonly adminUsers = new Map<string, StoredAdminUser>();
  /** Refresh-token sessions (Phase 4), keyed by session id. */
  readonly sessions = new Map<string, StoredSession>();
  /** Audit trail (Phase 4), append-only, in write order. */
  readonly auditLogs: AuditLogEntry[] = [];
  readonly carts = new Map<string, Cart>();
  readonly orders = new Map<string, Order>();
  readonly orderEvents: OrderStatusEventRecord[] = [];
  readonly payments = new Map<string, Payment>();
  /** Payment audit trail; every payment state change appends one
   * event here through the payments repository. */
  readonly paymentEvents: PaymentEvent[] = [];
  readonly refunds = new Map<string, Refund>();
  /** Webhook deliveries keyed by `${gateway}:${providerEventId}`
   * so a redelivery is recognised as a duplicate. */
  readonly webhookEvents = new Map<string, WebhookEvent>();
  /** Stock per variant id. Single source of truth for stock levels;
   * catalog reads overlay variant stock from here. */
  readonly stock = new Map<string, StockRecord>();
  /** Reserved lines per order id, released or finalized with the
   * order's status flow. */
  readonly reservations = new Map<string, ReservationLine[]>();
  /** Visitor sessions (Phase 5), keyed by session id. Sessions
   * carry only the random first-party ids; identity fields stay
   * null until an authenticated or consented link. */
  readonly visitorSessions = new Map<string, VisitorSession>();
  /** Visitor events (Phase 5), append-only, in write order. */
  readonly visitorEvents: StoredVisitorEvent[] = [];
  /** Consent decisions (Phase 5), append-only; the latest record
   * per (visitorId, scope) is the effective one. */
  readonly consentRecords: ConsentRecord[] = [];
  /** Visitor to customer links (Phase 5), append-only. */
  readonly identityLinks: IdentityLink[] = [];
  /** Leads (Phase 5), keyed by lead id. */
  readonly leads = new Map<string, Lead>();
  /** Contact attempts per lead (Phase 5), append-only. */
  readonly contactAttempts: LeadContactAttempt[] = [];
  /** Follow-up tasks (Phase 5), keyed by task id. */
  readonly followUpTasks = new Map<string, FollowUpTask>();
  /** CRM notes (Phase 5), append-only, in write order. */
  readonly customerNotes: CustomerNote[] = [];
  /** Opt-out suppressions (Phase 5), append-only. */
  readonly suppressions: SuppressionRecord[] = [];
  /** Abandoned carts (Phase 6), keyed by abandoned cart id. */
  readonly abandonedCarts = new Map<string, AbandonedCart>();
  /** Recovery attempts (Phase 6), keyed by attempt id. */
  readonly recoveryAttempts = new Map<string, RecoveryAttempt>();
  /** Communication log (Phase 6), append-only, in write order.
   * Every send, refusal and staff-logged call lands here. */
  readonly communicationLogs: CommunicationLog[] = [];
  /** Stored recovery settings (Phase 6). Null until the recovery
   * repository seeds them from the environment defaults on first
   * read; staff edits replace the record. */
  recoverySettings: RecoverySettings | null = null;
  /** Shipments (Phase 6, chunk 2), keyed by shipment id. */
  readonly shipments = new Map<string, Shipment>();
  /** Shipment status history (Phase 6, chunk 2), append-only,
   * in write order. */
  readonly shipmentEvents: ShipmentStatusEvent[] = [];
  /** Courier webhook deliveries (Phase 6, chunk 2), keyed by
   * `${courier}:${providerEventId}` so a redelivery is
   * recognised as a duplicate. */
  readonly courierWebhookEvents = new Map<string, CourierWebhookRecord>();
  /** Storefront settings that the legacy site keeps in localStorage.
   * The free delivery offer switch mirrors the admin toggle on the
   * legacy Account page and defaults to off, as there. */
  readonly settings = {
    freeDeliveryOffer: false,
    /**
     * Receiving instructions for manual mobile banking, one entry
     * per method. These are store-configured texts: the store
     * replaces the placeholder with its real receiving number and
     * wording (in the database-backed settings, once those land).
     * The placeholder mirrors the live storefront, which shares
     * the number by SMS with the order confirmation; no real
     * number is stored in code.
     */
    manualInstructions: {
      bkash:
        'Store-configured placeholder: send money to the Dostelo bKash number shared by SMS with your order confirmation. Use the reference below (your order number).',
      nagad:
        'Store-configured placeholder: send money to the Dostelo Nagad number shared by SMS with your order confirmation. Use the reference below (your order number).',
      rocket:
        'Store-configured placeholder: send money to the Dostelo Rocket number shared by SMS with your order confirmation. Use the reference below (your order number).',
      upay:
        'Store-configured placeholder: send money to the Dostelo Upay number shared by SMS with your order confirmation. Use the reference below (your order number).',
    } as Record<'bkash' | 'nagad' | 'rocket' | 'upay', string>,
  };
}
