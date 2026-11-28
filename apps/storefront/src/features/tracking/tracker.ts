/**
 * Storefront visitor tracking core (Phase 5, architecture
 * addition: the legacy site has no tracking, and nothing here
 * changes any legacy layout, class or behaviour).
 *
 * Privacy rules, matching the API's visitor module:
 * - The visitor id is a random value generated on this device
 *   and kept in a first-party localStorage entry. The session id
 *   is a random per-tab value in sessionStorage. No IP address,
 *   no device fingerprint, no user agent is ever read or sent.
 * - Events carry only the closed payload fields the API schema
 *   accepts: product ids, the search query, cart value in minor
 *   units, cart size and a checkout step name. Never personal
 *   data.
 * - Every call is fire-and-forget with failures swallowed: the
 *   store must never break, or even slow down, because the API
 *   is unreachable.
 * - The marketing consent choice is stored locally and posted
 *   to the API. Events are operational data and are recorded
 *   regardless of the choice; the API flags events from a
 *   visitor who denied the marketing scope as not usable for
 *   marketing (lead contact, campaigns, recovery exclude them).
 */

/* Contract note (fresh rebuild): the rebuilt @dostelo/api-client
   no longer exports the createApiClient factory or a visitor
   event method, and @dostelo/types no longer exports
   VisitorEventType. The tracker therefore posts to the same
   /v1 visitor endpoints directly with fetch, fire-and-forget
   exactly as before, and the event type union is declared here
   from the event names this storefront actually sends. */
export type VisitorEventType =
  | 'page-view'
  | 'product-view'
  | 'search'
  | 'add-to-cart'
  | 'checkout-start';

export const VISITOR_ID_KEY = 'dostelo-visitor-id';
export const SESSION_ID_KEY = 'dostelo-session-id';
export const CONSENT_KEY = 'dostelo-consent';

/** Same default as the admin portal: NEXT_PUBLIC_API_URL when
 * set at build time, otherwise the API's local dev address. */
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function postVisitor(path: string, body: unknown): Promise<void> {
  const res = await fetch(API_BASE_URL + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  });
  if (!res.ok) throw new Error('visitor post failed: ' + res.status);
}

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through to the manual generator.
  }
  const random = Math.random().toString(36).slice(2, 12);
  return `id-${Date.now().toString(36)}-${random}`;
}

let fallbackVisitorId: string | null = null;
let fallbackSessionId: string | null = null;

/**
 * The current visitor id, generating and persisting one on
 * first use. Exported for the checkout integration: a later
 * chunk passes this id to place-order so the order can link
 * the visitor's session to the customer through the consented
 * checkout flow.
 */
export function getVisitorId(): string {
  try {
    const existing = window.localStorage.getItem(VISITOR_ID_KEY);
    if (existing && existing.length >= 8) return existing;
    const id = randomId();
    window.localStorage.setItem(VISITOR_ID_KEY, id);
    return id;
  } catch {
    if (!fallbackVisitorId) fallbackVisitorId = randomId();
    return fallbackVisitorId;
  }
}

/** The current per-tab session id (sessionStorage is scoped to
 * the tab, so a new tab starts a new session). */
export function getSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_ID_KEY);
    if (existing && existing.length >= 8) return existing;
    const id = randomId();
    window.sessionStorage.setItem(SESSION_ID_KEY, id);
    return id;
  } catch {
    if (!fallbackSessionId) fallbackSessionId = randomId();
    return fallbackSessionId;
  }
}

export type MarketingConsentChoice = 'granted' | 'denied';

/** The stored marketing consent choice, or null when the
 * visitor has not answered the consent notice yet. */
export function getMarketingConsent(): MarketingConsentChoice | null {
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { marketing?: unknown };
    return parsed.marketing === 'granted' || parsed.marketing === 'denied'
      ? parsed.marketing
      : null;
  } catch {
    return null;
  }
}

/** Stores the choice locally and posts it to the API consent
 * endpoint. The post is best-effort: the local choice stands
 * even when the API is unreachable. */
export function recordMarketingConsent(
  status: MarketingConsentChoice,
): void {
  try {
    window.localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ marketing: status, at: new Date().toISOString() }),
    );
  } catch {
    // Storage unavailable: the choice simply does not persist.
  }
  try {
    void postVisitor('/v1/visitors/consent', {
      visitorId: getVisitorId(),
      scope: 'marketing',
      status,
    }).catch(() => undefined);
  } catch {
    // Never break the store over a consent post.
  }
}

/** The closed event payload the API accepts. Amounts are
 * integer minor units (paisa): cart values arrive here already
 * converted from the store's whole-taka totals. */
export interface TrackEventPayload {
  productId?: string;
  query?: string;
  cartValueMinor?: number;
  cartItemCount?: number;
  step?: string;
}

/** Records one visitor event with the API. Fire-and-forget:
 * returns immediately, swallows every failure. */
export function trackEvent(
  type: VisitorEventType,
  payload?: TrackEventPayload,
  path?: string,
): void {
  try {
    void postVisitor('/v1/visitor-events', {
      visitorId: getVisitorId(),
      sessionId: getSessionId(),
      type,
      path: path ?? window.location.pathname,
      payload,
    }).catch(() => undefined);
  } catch {
    // Tracking must never break the store.
  }
}
