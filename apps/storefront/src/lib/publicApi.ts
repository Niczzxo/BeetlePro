/* Public API access for the customer facing features added in
   the full stack rebuild: product reviews, support intake,
   returns and exchanges, loyalty, and checkout payment methods.

   Contracts follow the shared packages: entity shapes come from
   @dostelo/types (ProductReview, SupportTicket, ReturnRequest,
   LoyaltyBalance, PaymentGateway) and the create payloads match
   @dostelo/validation (CreateReview, CreateReturn,
   CreateSupportTicket). Every call is defensive: a network
   failure, a 404 (endpoint not live yet) or a 429 is returned as
   a typed result, never thrown, so each surface can show its
   honest loading, empty, unavailable and rate limited states
   instead of breaking the page. Nothing here invents data: when
   the API does not answer, the UI says so. */

import type {
  LoyaltyAccountView,
  LoyaltyRedemption,
  LoyaltyReward,
  PaymentGateway,
  ProductReview,
  ReturnRequest,
  ReturnStatus,
  SupportTicket,
} from '@dostelo/types';

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Customer access token, when the API session has issued one.
    The legacy in-memory sign-in issues no token, so this is null
    in that flow and authenticated calls answer 401, which the UI
    renders as its honest sign-in state. */
export function customerToken(): string | null {
  try {
    return window.localStorage.getItem('dostelo-customer-token');
  } catch {
    return null;
  }
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      /** http status, or 0 for a network failure. */
      status: number;
      /** Machine readable kind the UI branches on. */
      kind: 'network' | 'unauthorized' | 'not-found' | 'rate-limited' | 'rejected' | 'server';
      message: string;
    };

async function call<T>(
  path: string,
  init?: RequestInit & { auth?: boolean },
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (init?.auth) {
    const token = customerToken();
    if (token) headers.Authorization = 'Bearer ' + token;
  }
  try {
    const res = await fetch(API_BASE + path, { ...init, headers, cache: 'no-store' });
    if (res.ok) {
      return { ok: true, data: (await res.json()) as T };
    }
    let message = 'The request was not accepted.';
    try {
      const body = (await res.json()) as { message?: string };
      if (body && typeof body.message === 'string') message = body.message;
    } catch {
      /* keep the generic message */
    }
    const kind =
      res.status === 401 || res.status === 403
        ? 'unauthorized'
        : res.status === 404
          ? 'not-found'
          : res.status === 429
            ? 'rate-limited'
            : res.status >= 500
              ? 'server'
              : 'rejected';
    return { ok: false, status: res.status, kind, message };
  } catch {
    return {
      ok: false,
      status: 0,
      kind: 'network',
      message: 'The store service could not be reached.',
    };
  }
}

/* Reviews */

export interface ReviewSummary {
  average: number;
  count: number;
  distribution: Record<string, number>;
}

export interface ProductReviewsView {
  items: ProductReview[];
  summary: ReviewSummary;
}

export function getProductReviews(
  productId: string,
): Promise<ApiResult<ProductReviewsView>> {
  return call<ProductReviewsView>(
    '/v1/catalog/products/' + encodeURIComponent(productId) + '/reviews',
  );
}

export interface SubmitReviewInput {
  productId: string;
  rating: number;
  title?: string;
  body: string;
  orderNumber?: string;
}

export function submitReview(
  input: SubmitReviewInput,
): Promise<ApiResult<ProductReview>> {
  return call<ProductReview>('/v1/reviews', {
    method: 'POST',
    auth: true,
    body: JSON.stringify(input),
  });
}

/** A signed review request link, as sent after delivery. The
    token itself carries the signature; the API answers with the
    product and order the link was issued for. */
export interface ReviewRequestView {
  productId: string;
  productName: string;
  orderNumber: string;
  customerName: string;
  expiresAt: string;
}

export function getReviewRequest(
  token: string,
): Promise<ApiResult<ReviewRequestView>> {
  return call<ReviewRequestView>(
    '/v1/reviews/request/' + encodeURIComponent(token),
  );
}

export function submitReviewRequest(
  token: string,
  input: { rating: number; title?: string; body: string },
): Promise<ApiResult<ProductReview>> {
  return call<ProductReview>(
    '/v1/reviews/request/' + encodeURIComponent(token),
    { method: 'POST', body: JSON.stringify(input) },
  );
}

/* Uploads (product images are served by the same system; the
   public side only uploads support and return evidence). */

export interface UploadedFile {
  url: string;
  name: string;
}

export async function uploadFile(file: File): Promise<ApiResult<UploadedFile>> {
  const form = new FormData();
  form.append('file', file);
  try {
    const token = customerToken();
    const res = await fetch(API_BASE + '/v1/uploads', {
      method: 'POST',
      body: form,
      headers: token ? { Authorization: 'Bearer ' + token } : undefined,
    });
    if (res.ok) return { ok: true, data: (await res.json()) as UploadedFile };
    return {
      ok: false,
      status: res.status,
      kind:
        res.status === 429
          ? 'rate-limited'
          : res.status === 404
            ? 'not-found'
            : 'rejected',
      message:
        res.status === 404
          ? 'Photo upload is not available on the store service yet.'
          : 'The photo could not be uploaded.',
    };
  } catch {
    return {
      ok: false,
      status: 0,
      kind: 'network',
      message: 'The store service could not be reached.',
    };
  }
}

/* Support intake */

export interface SupportIntakeInput {
  name: string;
  phone: string;
  email?: string;
  subject: string;
  message: string;
  orderNumber?: string;
  attachmentUrl?: string;
}

export function submitSupportTicket(
  input: SupportIntakeInput,
): Promise<ApiResult<SupportTicket>> {
  return call<SupportTicket>('/v1/support/tickets', {
    method: 'POST',
    body: JSON.stringify({ ...input, channel: 'website' }),
  });
}

/* Customer orders, returns and loyalty (signed in) */

export interface CustomerOrderLine {
  id: string;
  productId: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPriceMinor: number;
}

export interface CustomerOrder {
  orderNumber: string;
  status: string;
  totalMinor: number;
  createdAt: string;
  items: CustomerOrderLine[];
  /** Replacement order created by an approved exchange, when the
      API links one to this order. */
  replacementOrderNumber?: string | null;
}

export function getMyOrders(): Promise<ApiResult<{ items: CustomerOrder[] }>> {
  return call<{ items: CustomerOrder[] }>('/v1/customers/me/orders', {
    auth: true,
  });
}

export interface CreateReturnInput {
  orderNumber: string;
  kind: 'refund' | 'exchange';
  reason?: string;
  note?: string;
  resolutionType?: 'refund' | 'exchange' | 'replacement';
  condition?: string;
  evidenceUrl?: string;
  items: { orderItemId: string; quantity: number }[];
}

export function createReturn(
  input: CreateReturnInput,
): Promise<ApiResult<ReturnRequest>> {
  return call<ReturnRequest>('/v1/returns', {
    method: 'POST',
    auth: true,
    body: JSON.stringify(input),
  });
}

export function getMyReturns(): Promise<
  ApiResult<{ items: ReturnRequest[] }>
> {
  return call<{ items: ReturnRequest[] }>('/v1/returns/mine', { auth: true });
}

export const RETURN_STATUS_LABELS_PUBLIC: Partial<Record<ReturnStatus, string>> = {
  requested: 'Requested',
  'under-review': 'Under review',
  approved: 'Approved',
  rejected: 'Rejected',
  'awaiting-pickup': 'Awaiting pickup',
  'in-transit': 'In transit',
  received: 'Received',
  inspection: 'Inspection',
  'refund-pending': 'Refund pending',
  refunded: 'Refunded',
  'exchange-processing': 'Exchange in progress',
  completed: 'Completed',
};

export interface LoyaltyView {
  account: LoyaltyAccountView;
  /** Redemption rewards the API offers. Empty when redemption
      is not configured. */
  rewards: LoyaltyReward[];
}

export function getMyLoyalty(): Promise<ApiResult<LoyaltyView>> {
  return call<LoyaltyView>('/v1/loyalty/me', { auth: true });
}

export function redeemReward(
  rewardId: string,
): Promise<ApiResult<LoyaltyRedemption>> {
  return call<LoyaltyRedemption>('/v1/loyalty/me/redeem', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ rewardId }),
  });
}

/* Checkout payment methods */

export interface PaymentMethodView {
  gateway: PaymentGateway;
  label: string;
  channel: 'cod' | 'manual' | 'gateway';
  /** False when the gateway is not configured on the API: the
      method renders but selecting it shows the honest
      unavailable state instead of failing at submit. */
  configured: boolean;
  /** Store receiving instructions for manual methods, exactly as
      the API returns them. Null when none are configured. */
  instructions: string | null;
  /** Courier and delivery note for the method, when the API
      provides one. */
  deliveryNote: string | null;
}

export function getPaymentMethods(): Promise<
  ApiResult<{ items: PaymentMethodView[] }>
> {
  return call<{ items: PaymentMethodView[] }>('/v1/checkout/payment-methods');
}
