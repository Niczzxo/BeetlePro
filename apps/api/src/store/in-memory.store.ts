import { Injectable } from '@nestjs/common';
import { DEFAULT_MANUAL_INSTRUCTIONS } from './settings.repository';
import type {
  AbandonedCart,
  AdminRole,
  AuditLogEntry,
  Campaign,
  Cart,
  Category,
  CommunicationLog,
  MessageTemplate,
  ConsentRecord,
  Courier,
  Customer,
  CustomerNote,
  DataExportRecord,
  FollowUpTask,
  IdentityLink,
  Lead,
  LeadContactAttempt,
  LegalDocument,
  LoyaltyTransaction,
  Order,
  OrderStatus,
  Payment,
  PaymentEvent,
  Product,
  ProductReview,
  RecoveryAttempt,
  RecoverySettings,
  Refund,
  AutomationExecution,
  ReturnEvent,
  ReturnRequest,
  Shipment,
  ShipmentStatusEvent,
  SupportTicket,
  SupportTicketMessage,
  VisitorEvent,
  VisitorSession,
  WebhookEvent,
} from '@dostelo/types';
import {
  DEFAULT_POINTS_RULES,
  DEFAULT_SLA_TARGETS,
} from '@dostelo/types';

/** A notification read mark (Notifications build), mirroring the
 * NotificationRead model: staff notification keys a staff member
 * has marked read. */
export interface NotificationReadRecord {
  adminUserId: string;
  notificationKey: string;
  readAt: string;
  /** Hidden for this staff member only (their delete action). */
  hidden?: boolean;
}

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
/** A staff invitation (Staff redesign): the raw token is shown
 * once to the inviting admin and never stored; only its SHA-256
 * hash is kept, with an expiry and a single-use mark. */
export interface StoredBackupRecord {
  id: string;
  createdById: string | null;
  byteSize: number;
  checksum: string;
  collections: string[];
  snapshot: string;
  createdAt: string;
}

export interface StoredStaffInvitation {
  id: string;
  adminUserId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

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

/** One append-only stock movement, written by the inventory
 * repository at the moment a stock change actually happens: a
 * staff adjustment, an order reservation, a release on
 * cancellation, or a finalize on delivery. Balances are the
 * record's values right after the change. The ledger starts
 * when this ships: earlier changes were never recorded anywhere
 * and are not backfilled. */
export interface StockMovement {
  id: string;
  variantId: string;
  productId: string;
  type: 'adjustment' | 'reserve' | 'release' | 'finalize';
  deltaOnHand: number;
  deltaReserved: number;
  onHandAfter: number;
  reservedAfter: number;
  /** Order id for reserve, release and finalize movements;
   * null for staff adjustments (the acting staff member and the
   * reason are on the audit entry written alongside). */
  reference: string | null;
  createdAt: string;
}

export interface StockMovementFilter {
  variantId?: string;
  productId?: string;
  from?: string;
  to?: string;
  limit?: number;
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
  /** Staff invitations by id (Staff redesign). */
  readonly staffInvitations = new Map<string, StoredStaffInvitation>();
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
  /** Append-only stock movement ledger (Inventory redesign),
   * written by the inventory repository on every stock change.
   * Starts empty: movements before this existed were never
   * recorded and are not backfilled. */
  readonly stockMovements: StockMovement[] = [];
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
  /** Staff-edited message templates, keyed by template key. A
   * stored template overrides the code-versioned built-in with
   * the same key; deleting it restores the built-in. */
  readonly messageTemplates = new Map<
    string,
    MessageTemplate & { updatedAt: string }
  >();
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
   * legacy Account page and defaults to off, as there. The record
   * also carries the store profile, the delivery fee table and
   * the loyalty rules (Website Management and Loyalty builds);
   * the defaults are DEFAULT_STORE_SETTINGS in
   * settings.repository.ts. */
  readonly settings = {
    freeDeliveryOffer: false,
    /**
     * Receiving instructions for manual mobile banking, one entry
     * per method. The defaults live with the settings repository
     * (DEFAULT_MANUAL_INSTRUCTIONS in settings.repository.ts) so
     * the in-memory store and the database seed share one text.
     */
    manualInstructions: { ...DEFAULT_MANUAL_INSTRUCTIONS },
    storeName: 'Dostelo',
    contactEmail: 'hello@dostelo.example',
    contactPhone: '',
    deliveryFees: {
      dhakaCityMinor: 7000,
      dhakaSubCityMinor: 10000,
      outsideDhakaMinor: 15000,
      codFeeMinor: 1000,
    },
    loyaltyRules: { takaPerPoint: 100, pointValueMinor: 100 },
    returnWindowDays: 30,
    automationLeadEvaluationEnabled: true,
    allowCod: true,
    storeLive: true,
    slaTargets: structuredClone(DEFAULT_SLA_TARGETS),
    loyaltyPointRules: DEFAULT_POINTS_RULES.map((rule) => ({ ...rule })),
  };
  /** Return and exchange requests (Returns build), keyed by id. */
  readonly returnRequests = new Map<string, ReturnRequest>();
  /** Return workflow events (Returns redesign), append-only, in
   * write order: one per recorded transition or staff action. */
  readonly returnEvents: ReturnEvent[] = [];
  /** Automation execution log (Automation redesign), append-only,
   * in write order. Written by the flows themselves as they run;
   * starts empty and is never backfilled. */
  readonly automationExecutions: AutomationExecution[] = [];
  /** Support tickets (Support build), keyed by ticket id. */
  readonly supportTickets = new Map<string, SupportTicket>();
  /** Support ticket messages, append-only, in write order. */
  readonly supportTicketMessages: SupportTicketMessage[] = [];
  /** Product reviews (Reviews build), keyed by review id. */
  readonly productReviews = new Map<string, ProductReview>();
  /** Marketing campaigns (Marketing build), keyed by campaign id. */
  readonly campaigns = new Map<string, Campaign>();
  /** Loyalty point adjustments (Loyalty build), append-only.
   * Earned points are derived from delivered orders, never
   * stored; only staff adjustments live here. */
  readonly loyaltyTransactions: LoyaltyTransaction[] = [];
  /** Legal documents (Legal build), keyed by document slug. Only
   * documents staff have saved exist here; the service serves
   * the label defaults for the rest. */
  readonly legalDocuments = new Map<string, LegalDocument>();
  readonly legalVersions: import('@dostelo/types').LegalDocumentVersion[] =
    [];
  /** Notification read marks (Notifications build), append-only:
   * one entry per (admin user, notification key) marked read. */
  readonly notificationReads: NotificationReadRecord[] = [];
  /** Per-admin notification preferences (Notifications
   * redesign), keyed by admin user id. */
  readonly notificationPreferences = new Map<
    string,
    import('@dostelo/types').NotificationPreference
  >();
  /** Data export records (Backup build), keyed by export id. The
   * record keeps counts only; the export document itself is
   * returned to the requester and never stored. */
  readonly dataExports = new Map<string, DataExportRecord>();
  readonly storedBackups = new Map<string, StoredBackupRecord>();
}
