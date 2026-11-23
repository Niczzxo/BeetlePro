import type {
  AbandonedCart,
  AbandonedCartStatus,
  AdminLoginResult,
  AuditLogEntry,
  AuthTokens,
  CartView,
  Category,
  CheckoutQuote,
  CommunicationChannel,
  CommunicationLog,
  CommunicationLogStatus,
  ConsentRecord,
  Courier,
  Customer,
  CustomerNote,
  FollowUpTask,
  IdentityStatus,
  Lead,
  LeadContactAttempt,
  LeadStatus,
  Order,
  OrderStatus,
  Payment,
  PaymentEvent,
  Product,
  RecoveryAttempt,
  RecoveryCartView,
  RecoverySettings,
  Refund,
  Shipment,
  ShipmentDetail,
  ShipmentStatus,
  VisitorEventType,
} from '@dostelo/types';
import type {
  AdminLogin,
  CartCreate,
  CartLineCreate,
  CartLineUpdate,
  CheckoutRequest,
  ConsentRecordInput,
  ContactAttemptCreate,
  CreateShipment,
  CustomerLogin,
  CustomerNoteCreate,
  CustomerRegistration,
  CustomerTagInput,
  FollowUpTaskCreate,
  InventoryAdjust,
  LeadAssign,
  LeadCreate,
  LeadStatusChange,
  ManualCallLog,
  MfaExchange,
  OrderStatusTransition,
  PaymentVerify,
  RecoverySettingsUpdate,
  RefundConfirm,
  RefundRequest,
  TotpCode,
  VisitorEventIngest,
  VisitorLinkInput,
} from '@dostelo/validation';

/** Category as returned by GET /v1/catalog/categories. */
export interface CategorySummary extends Category {
  productCount: number;
}

/** Stock level as returned by the inventory endpoints. */
export interface StockView {
  variantId: string;
  productId: string;
  onHand: number;
  reserved: number;
  available: number;
}

/** One recorded order status change, as returned inside the
 * staff order detail. Mirrors the API's OrderStatusEventRecord. */
export interface OrderStatusEventView {
  id: string;
  orderId: string;
  status: OrderStatus;
  note: string | null;
  actorId: string | null;
  createdAt: string;
}

/** Staff order detail from GET /v1/admin/orders/:orderNumber:
 * the order, its status history, and the legal next states from
 * the API's flow policy. */
export interface OrderDetailView {
  order: Order;
  events: OrderStatusEventView[];
  allowedTransitions: OrderStatus[];
}

/** Payment detail from GET /v1/payments/:paymentId. */
export interface PaymentDetailView {
  payment: Payment;
  events: PaymentEvent[];
  refunds: Refund[];
}

export interface PaymentSummaryGroup {
  key: string;
  count: number;
  totalMinor: number;
}

/** Reconciliation summary from GET /v1/payments/summary. */
export interface PaymentSummary {
  count: number;
  totalMinor: number;
  byGateway: PaymentSummaryGroup[];
  byStatus: PaymentSummaryGroup[];
}

/** One session row from GET /v1/admin/buyer-intelligence/sessions. */
export interface BuyerSessionSummary {
  sessionId: string;
  visitorId: string;
  identityStatus: IdentityStatus;
  customerId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  eventCount: number;
  eventCounts: Partial<Record<VisitorEventType, number>>;
  productViews: number;
  cartValueMinor: number;
  leadScore: number;
  leadBand: 'hot' | 'warm' | 'cold';
  marketingUsable: boolean;
}

/** Session detail: the summary plus the score breakdown and the
 * full event timeline. */
export interface BuyerSessionDetail extends BuyerSessionSummary {
  scoreBreakdown: {
    recency: number;
    productViews: number;
    repeatSessions: number;
    cartValue: number;
    checkoutProgress: number;
  };
  events: Array<{
    id: string;
    type: VisitorEventType;
    path: string | null;
    payload: Record<string, unknown> | null;
    occurredAt: string;
  }>;
}

/** Lead detail from GET /v1/leads/:id. */
export interface LeadDetailView {
  lead: Lead;
  attempts: LeadContactAttempt[];
  followUpTasks: FollowUpTask[];
}

/** Customer timeline from GET /v1/crm/customers/:id/timeline. */
export interface CustomerTimelineView {
  customer: Customer;
  orders: Order[];
  visitor: {
    sessionCount: number;
    identityStatuses: IdentityStatus[];
    eventCount: number;
    eventCounts: Partial<Record<VisitorEventType, number>>;
    lastActivityAt: string | null;
    bestLeadScore: number;
  };
  notes: CustomerNote[];
  tags: string[];
}

/** Abandoned cart detail from GET /v1/cart-recovery/:id: the
 * recovery, its step attempts, and the communication log entries
 * the steps and staff produced for it. */
export interface AbandonedCartDetailView {
  recovery: AbandonedCart;
  attempts: RecoveryAttempt[];
  communications: CommunicationLog[];
}

/** Shipment detail from GET /v1/shipping/:id: the shipment
 * plus its recorded status history. */
export type ShipmentDetailView = ShipmentDetail;

/** Answer of POST /v1/shipping/:id/refresh: the detail plus
 * whether the courier's answer changed anything, and why not
 * when it did not. */
export interface ShipmentRefreshView extends ShipmentDetail {
  refreshed: boolean;
  refreshNote: string | null;
}

export interface ApiClientOptions {
  /** API origin, for example https://api.dostelo.com. No trailing slash. */
  baseUrl: string;
  /** Fetch implementation override, for tests or non-browser runtimes. */
  fetchFn?: typeof fetch;
  /**
   * Access token source for authenticated requests: a token
   * string, or a function returning the current token (or null).
   * When it yields a token, requests carry an Authorization
   * Bearer header. Token storage and refresh are the caller's
   * job; pair this with the auth methods below.
   */
  accessToken?: string | (() => string | null);
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`Dostelo API request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Typed client for the Dostelo API (/v1 namespace). Request payloads
 * use the shared Zod-inferred types from @dostelo/validation and
 * responses use the domain types from @dostelo/types, so a contract
 * change fails typecheck on both sides.
 */
export function createApiClient(options: ApiClientOptions) {
  const fetchFn = options.fetchFn ?? fetch;
  const base = options.baseUrl.replace(/\/+$/, '');

  function currentAccessToken(): string | null {
    if (!options.accessToken) return null;
    return typeof options.accessToken === 'function'
      ? options.accessToken()
      : options.accessToken;
  }

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (body) headers['content-type'] = 'application/json';
    const token = currentAccessToken();
    if (token) headers['authorization'] = `Bearer ${token}`;
    const response = await fetchFn(`${base}${path}`, {
      method,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const parsed: unknown = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new ApiError(response.status, parsed);
    }
    return parsed as T;
  }

  return {
    // Auth (Phase 4). Login and MFA routes are rate limited on
    // the server; refresh rotates the refresh token, so always
    // store the pair returned by refreshTokens.
    registerAndLogin(
      dto: CustomerRegistration,
    ): Promise<{ customer: Customer; tokens: AuthTokens }> {
      return request('POST', '/v1/auth/register', dto);
    },
    loginCustomer(dto: CustomerLogin): Promise<AuthTokens> {
      return request('POST', '/v1/auth/login', dto);
    },
    refreshTokens(refreshToken: string): Promise<AuthTokens> {
      return request('POST', '/v1/auth/refresh', { refreshToken });
    },
    logout(refreshToken: string): Promise<{ revoked: boolean }> {
      return request('POST', '/v1/auth/logout', { refreshToken });
    },
    loginAdmin(dto: AdminLogin): Promise<AdminLoginResult> {
      return request('POST', '/v1/auth/admin/login', dto);
    },
    exchangeAdminMfa(dto: MfaExchange): Promise<AuthTokens> {
      return request('POST', '/v1/auth/admin/mfa/exchange', dto);
    },
    enrollAdminMfa(): Promise<{ secret: string; otpauthUrl: string }> {
      return request('POST', '/v1/auth/admin/mfa/enroll');
    },
    enableAdminMfa(dto: TotpCode): Promise<{ mfaEnabled: true }> {
      return request('POST', '/v1/auth/admin/mfa/enable', dto);
    },
    disableAdminMfa(dto: TotpCode): Promise<{ mfaEnabled: false }> {
      return request('POST', '/v1/auth/admin/mfa/disable', dto);
    },
    listAuditLog(query?: {
      actorId?: string;
      actorType?: string;
      action?: string;
      from?: string;
      to?: string;
      limit?: number;
    }): Promise<{ items: AuditLogEntry[] }> {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query ?? {})) {
        if (value !== undefined) params.set(key, String(value));
      }
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request('GET', `/v1/admin/audit-log${suffix}`);
    },

    // Catalog
    listProducts(category?: string): Promise<{ items: Product[]; total: number }> {
      const query = category
        ? `?category=${encodeURIComponent(category)}`
        : '';
      return request('GET', `/v1/catalog/products${query}`);
    },
    getProduct(key: string): Promise<Product> {
      return request('GET', `/v1/catalog/products/${encodeURIComponent(key)}`);
    },
    listCategories(): Promise<{ items: CategorySummary[] }> {
      return request('GET', '/v1/catalog/categories');
    },

    // Customers
    registerCustomer(dto: CustomerRegistration): Promise<Customer> {
      return request('POST', '/v1/customers/register', dto);
    },
    getCustomer(id: string): Promise<Customer> {
      return request('GET', `/v1/customers/${encodeURIComponent(id)}`);
    },
    /** Staff customer list (admin token with customers.read).
     * Optional case-insensitive search across name, email and
     * phone. */
    listCustomers(query?: {
      search?: string;
      limit?: number;
    }): Promise<{ items: Customer[] }> {
      const params = new URLSearchParams();
      if (query?.search) params.set('search', query.search);
      if (query?.limit !== undefined) params.set('limit', String(query.limit));
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request('GET', `/v1/customers${suffix}`);
    },
    listCustomerOrders(customerId: string): Promise<{ items: Order[] }> {
      return request(
        'GET',
        `/v1/orders?customerId=${encodeURIComponent(customerId)}`,
      );
    },

    // Carts
    createCart(dto: CartCreate = {}): Promise<CartView> {
      return request('POST', '/v1/carts', dto);
    },
    getCart(id: string): Promise<CartView> {
      return request('GET', `/v1/carts/${encodeURIComponent(id)}`);
    },
    addCartLine(cartId: string, dto: CartLineCreate): Promise<CartView> {
      return request(
        'POST',
        `/v1/carts/${encodeURIComponent(cartId)}/lines`,
        dto,
      );
    },
    updateCartLine(
      cartId: string,
      lineId: string,
      dto: CartLineUpdate,
    ): Promise<CartView> {
      return request(
        'PATCH',
        `/v1/carts/${encodeURIComponent(cartId)}/lines/${encodeURIComponent(lineId)}`,
        dto,
      );
    },
    removeCartLine(cartId: string, lineId: string): Promise<CartView> {
      return request(
        'DELETE',
        `/v1/carts/${encodeURIComponent(cartId)}/lines/${encodeURIComponent(lineId)}`,
      );
    },

    // Checkout and orders
    quoteCheckout(dto: CheckoutRequest): Promise<CheckoutQuote> {
      return request('POST', '/v1/checkout/quote', dto);
    },
    placeOrder(dto: CheckoutRequest): Promise<Order> {
      return request('POST', '/v1/checkout/place-order', dto);
    },
    getOrder(orderNumber: string): Promise<Order> {
      return request(
        'GET',
        `/v1/orders/${encodeURIComponent(orderNumber)}`,
      );
    },
    transitionOrderStatus(
      orderNumber: string,
      dto: OrderStatusTransition,
    ): Promise<Order> {
      return request(
        'POST',
        `/v1/orders/${encodeURIComponent(orderNumber)}/status`,
        dto,
      );
    },

    // Staff order reads (admin token with orders.read)
    listStaffOrders(status?: OrderStatus): Promise<{ items: Order[] }> {
      const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
      return request('GET', `/v1/admin/orders${suffix}`);
    },
    getStaffOrder(orderNumber: string): Promise<OrderDetailView> {
      return request(
        'GET',
        `/v1/admin/orders/${encodeURIComponent(orderNumber)}`,
      );
    },

    // Payments: staff reconciliation reads and actions. The list,
    // summary and detail reads require payments.read; verify
    // requires payments.verify; refunds require payments.refund.
    listPayments(filter?: {
      gateway?: string;
      status?: string;
      orderId?: string;
    }): Promise<{ items: Payment[] }> {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filter ?? {})) {
        if (value !== undefined) params.set(key, String(value));
      }
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request('GET', `/v1/payments${suffix}`);
    },
    getPaymentsSummary(): Promise<PaymentSummary> {
      return request('GET', '/v1/payments/summary');
    },
    getPayment(paymentId: string): Promise<PaymentDetailView> {
      return request('GET', `/v1/payments/${encodeURIComponent(paymentId)}`);
    },
    verifyPayment(paymentId: string, dto: PaymentVerify): Promise<Payment> {
      return request(
        'POST',
        `/v1/payments/${encodeURIComponent(paymentId)}/verify`,
        dto,
      );
    },
    requestRefund(paymentId: string, dto: RefundRequest): Promise<Refund> {
      return request(
        'POST',
        `/v1/payments/${encodeURIComponent(paymentId)}/refunds`,
        dto,
      );
    },
    confirmRefund(
      paymentId: string,
      refundId: string,
      dto: RefundConfirm,
    ): Promise<Refund> {
      return request(
        'POST',
        `/v1/payments/${encodeURIComponent(paymentId)}/refunds/${encodeURIComponent(refundId)}/confirm`,
        dto,
      );
    },

    // Inventory (staff-facing; reads require inventory.read and
    // adjust requires an admin token with inventory.adjust)
    listInventory(productId?: string): Promise<{ items: StockView[] }> {
      const suffix = productId
        ? `?productId=${encodeURIComponent(productId)}`
        : '';
      return request('GET', `/v1/inventory${suffix}`);
    },
    getStock(variantId: string): Promise<StockView> {
      return request(
        'GET',
        `/v1/inventory/${encodeURIComponent(variantId)}`,
      );
    },
    adjustStock(variantId: string, dto: InventoryAdjust): Promise<StockView> {
      return request(
        'POST',
        `/v1/inventory/${encodeURIComponent(variantId)}/adjust`,
        dto,
      );
    },

    // Visitor tracking (Phase 5). Public calls for the storefront
    // tracker: events and consent carry only the random
    // first-party ids. linkVisitor needs a customer access token.
    recordVisitorEvent(
      dto: VisitorEventIngest,
    ): Promise<{ id: string; sessionId: string; marketingUsable: boolean }> {
      return request('POST', '/v1/visitor-events', dto);
    },
    recordVisitorConsent(dto: ConsentRecordInput): Promise<ConsentRecord> {
      return request('POST', '/v1/visitors/consent', dto);
    },
    linkVisitor(
      dto: VisitorLinkInput,
    ): Promise<{ visitorId: string; customerId: string; basis: string }> {
      return request('POST', '/v1/visitors/link', dto);
    },

    // Buyer Intelligence (staff; admin token with buyers.read)
    listBuyerSessions(filter?: {
      status?: IdentityStatus;
      minScore?: number;
    }): Promise<{ items: BuyerSessionSummary[] }> {
      const params = new URLSearchParams();
      if (filter?.status) params.set('status', filter.status);
      if (filter?.minScore !== undefined) {
        params.set('minScore', String(filter.minScore));
      }
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request('GET', `/v1/admin/buyer-intelligence/sessions${suffix}`);
    },
    getBuyerSession(sessionId: string): Promise<BuyerSessionDetail> {
      return request(
        'GET',
        `/v1/admin/buyer-intelligence/sessions/${encodeURIComponent(sessionId)}`,
      );
    },

    // Leads (staff; reads need leads.read, assignment needs
    // leads.assign, status and tasks need leads.edit, attempts
    // need leads.contact)
    listLeads(filter?: {
      status?: LeadStatus;
      assigneeId?: string;
    }): Promise<{ items: Lead[] }> {
      const params = new URLSearchParams();
      if (filter?.status) params.set('status', filter.status);
      if (filter?.assigneeId) params.set('assigneeId', filter.assigneeId);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request('GET', `/v1/leads${suffix}`);
    },
    getLead(id: string): Promise<LeadDetailView> {
      return request('GET', `/v1/leads/${encodeURIComponent(id)}`);
    },
    createLead(dto: LeadCreate): Promise<Lead> {
      return request('POST', '/v1/leads', dto);
    },
    assignLead(id: string, dto: LeadAssign): Promise<Lead> {
      return request('POST', `/v1/leads/${encodeURIComponent(id)}/assign`, dto);
    },
    changeLeadStatus(id: string, dto: LeadStatusChange): Promise<Lead> {
      return request('POST', `/v1/leads/${encodeURIComponent(id)}/status`, dto);
    },
    createFollowUpTask(
      leadId: string,
      dto: FollowUpTaskCreate,
    ): Promise<FollowUpTask> {
      return request(
        'POST',
        `/v1/leads/${encodeURIComponent(leadId)}/follow-ups`,
        dto,
      );
    },
    listFollowUpTasks(
      leadId: string,
    ): Promise<{ items: FollowUpTask[] }> {
      return request(
        'GET',
        `/v1/leads/${encodeURIComponent(leadId)}/follow-ups`,
      );
    },
    completeFollowUpTask(
      leadId: string,
      taskId: string,
    ): Promise<FollowUpTask> {
      return request(
        'POST',
        `/v1/leads/${encodeURIComponent(leadId)}/follow-ups/${encodeURIComponent(taskId)}/complete`,
      );
    },
    recordContactAttempt(
      leadId: string,
      dto: ContactAttemptCreate,
    ): Promise<LeadContactAttempt> {
      return request(
        'POST',
        `/v1/leads/${encodeURIComponent(leadId)}/contact-attempts`,
        dto,
      );
    },
    listContactAttempts(
      leadId: string,
    ): Promise<{ items: LeadContactAttempt[] }> {
      return request(
        'GET',
        `/v1/leads/${encodeURIComponent(leadId)}/contact-attempts`,
      );
    },
    optOutLead(id: string): Promise<Lead> {
      return request('POST', `/v1/leads/${encodeURIComponent(id)}/opt-out`);
    },

    // CRM (staff; timeline needs customers.read, notes and tags
    // need customers.edit)
    getCustomerTimeline(id: string): Promise<CustomerTimelineView> {
      return request(
        'GET',
        `/v1/crm/customers/${encodeURIComponent(id)}/timeline`,
      );
    },
    addCustomerNote(
      id: string,
      dto: CustomerNoteCreate,
    ): Promise<CustomerNote> {
      return request(
        'POST',
        `/v1/crm/customers/${encodeURIComponent(id)}/notes`,
        dto,
      );
    },
    addCustomerTag(
      id: string,
      dto: CustomerTagInput,
    ): Promise<{ tags: string[] }> {
      return request(
        'POST',
        `/v1/crm/customers/${encodeURIComponent(id)}/tags`,
        dto,
      );
    },
    removeCustomerTag(
      id: string,
      tag: string,
    ): Promise<{ tags: string[] }> {
      return request(
        'DELETE',
        `/v1/crm/customers/${encodeURIComponent(id)}/tags/${encodeURIComponent(tag)}`,
      );
    },

    // Cart recovery (staff; reads need recovery.read, actions
    // need recovery.edit). Sends are never faked: an attempt's
    // outcome mirrors the communication log, including
    // not-configured providers and refusals.
    listAbandonedCarts(
      status?: AbandonedCartStatus,
    ): Promise<{ items: AbandonedCart[] }> {
      const suffix = status
        ? `?status=${encodeURIComponent(status)}`
        : '';
      return request('GET', `/v1/cart-recovery${suffix}`);
    },
    getAbandonedCart(id: string): Promise<AbandonedCartDetailView> {
      return request(
        'GET',
        `/v1/cart-recovery/${encodeURIComponent(id)}`,
      );
    },
    runRecoveryScan(): Promise<{ detected: number; closed: number }> {
      return request('POST', '/v1/cart-recovery/scan');
    },
    getRecoverySettings(): Promise<RecoverySettings> {
      return request('GET', '/v1/cart-recovery/settings');
    },
    updateRecoverySettings(
      dto: RecoverySettingsUpdate,
    ): Promise<RecoverySettings> {
      return request('PUT', '/v1/cart-recovery/settings', dto);
    },
    cancelRecovery(id: string): Promise<AbandonedCart> {
      return request(
        'POST',
        `/v1/cart-recovery/${encodeURIComponent(id)}/cancel`,
      );
    },
    runRecoveryStep(id: string): Promise<AbandonedCartDetailView> {
      return request(
        'POST',
        `/v1/cart-recovery/${encodeURIComponent(id)}/run-step`,
      );
    },

    // Communication Center (staff; the log needs
    // communications.read, logging a call needs recovery.edit)
    listCommunicationLog(filter?: {
      channel?: CommunicationChannel;
      status?: CommunicationLogStatus;
      customerId?: string;
      leadId?: string;
      abandonedCartId?: string;
    }): Promise<{ items: CommunicationLog[] }> {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filter ?? {})) {
        if (value !== undefined) params.set(key, String(value));
      }
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request('GET', `/v1/communications/log${suffix}`);
    },
    logManualCall(dto: ManualCallLog): Promise<CommunicationLog> {
      return request('POST', '/v1/communications/calls', dto);
    },

    // Public recovery link target: the unguessable token is the
    // credential, and the view never carries contact details.
    getRecoveryCart(token: string): Promise<RecoveryCartView> {
      return request(
        'GET',
        `/v1/recovery/${encodeURIComponent(token)}`,
      );
    },

    // Shipping and Courier (staff; reads need shipping.read,
    // booking and refresh need shipping.edit). Booking is never
    // faked: with no courier credentials the shipment comes
    // back in the not-configured status with no tracking id.
    createShipment(dto: CreateShipment): Promise<Shipment> {
      return request('POST', '/v1/shipping', dto);
    },
    listShipments(filter?: {
      courier?: Courier;
      status?: ShipmentStatus;
      orderNumber?: string;
    }): Promise<{ items: Shipment[] }> {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filter ?? {})) {
        if (value !== undefined) params.set(key, String(value));
      }
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request('GET', `/v1/shipping${suffix}`);
    },
    getShipment(id: string): Promise<ShipmentDetailView> {
      return request('GET', `/v1/shipping/${encodeURIComponent(id)}`);
    },
    refreshShipment(id: string): Promise<ShipmentRefreshView> {
      return request(
        'POST',
        `/v1/shipping/${encodeURIComponent(id)}/refresh`,
      );
    },
  };
}

export type DosteloApiClient = ReturnType<typeof createApiClient>;
