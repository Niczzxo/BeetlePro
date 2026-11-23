import type { VisitorEventType } from '@dostelo/types';

/**
 * Lead scoring for Buyer Intelligence (Phase 5).
 *
 * The score is a transparent business signal, computed only from
 * first-party behavioural facts the storefront recorded. Every
 * point below comes from one of the five documented signals; the
 * total is capped at 100. The score says how strong the buying
 * intent looks. It never says who the visitor is: identity comes
 * only from IdentityLink records, and an anonymous session keeps
 * the 'anonymous' status at any score.
 *
 * Formula:
 * - Recency of last activity: within 24 hours +25, within 7 days
 *   +15, within 30 days +5, older +0.
 * - Product views: +4 per product-view event, up to +20.
 * - Repeat sessions: +5 for each session of the same visitor
 *   beyond the first, up to +10.
 * - Cart value (highest cartValueMinor seen in the visitor's
 *   events): at or above 2000 taka +25, at or above 1000 taka
 *   +18, at or above 500 taka +10, any positive value +5. The
 *   five signals can sum to 105, so the cap is a real cap.
 * - Checkout progress: a checkout-step event +10, a checkout-start
 *   event +15; both together give the full +25.
 */

export interface SessionFacts {
  /** ISO timestamp of the session's most recent event. */
  lastActivityAt: string;
  /** Event counts for this session, by type. */
  eventCounts: Partial<Record<VisitorEventType, number>>;
  /** Highest cart value seen, in integer minor units (paisa). */
  maxCartValueMinor: number;
  /** How many sessions this visitor has in total (at least 1). */
  visitorSessionCount: number;
}

export interface LeadScoreBreakdown {
  recency: number;
  productViews: number;
  repeatSessions: number;
  cartValue: number;
  checkoutProgress: number;
}

export interface LeadScore {
  score: number;
  breakdown: LeadScoreBreakdown;
  band: 'hot' | 'warm' | 'cold';
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Cart value band thresholds, in minor units (paisa). */
export const CART_VALUE_BANDS_MINOR = {
  high: 200_000,
  medium: 100_000,
  low: 50_000,
} as const;

export function scoreRecency(lastActivityAt: string, now: Date): number {
  const age = now.getTime() - new Date(lastActivityAt).getTime();
  if (age <= DAY_MS) return 25;
  if (age <= 7 * DAY_MS) return 15;
  if (age <= 30 * DAY_MS) return 5;
  return 0;
}

export function scoreProductViews(count: number): number {
  return Math.min(count * 4, 20);
}

export function scoreRepeatSessions(visitorSessionCount: number): number {
  return Math.min(Math.max(visitorSessionCount - 1, 0) * 5, 10);
}

export function scoreCartValue(maxCartValueMinor: number): number {
  if (maxCartValueMinor >= CART_VALUE_BANDS_MINOR.high) return 25;
  if (maxCartValueMinor >= CART_VALUE_BANDS_MINOR.medium) return 18;
  if (maxCartValueMinor >= CART_VALUE_BANDS_MINOR.low) return 10;
  if (maxCartValueMinor > 0) return 5;
  return 0;
}

export function scoreCheckoutProgress(
  eventCounts: Partial<Record<VisitorEventType, number>>,
): number {
  let points = 0;
  if ((eventCounts['checkout-start'] ?? 0) > 0) points += 15;
  if ((eventCounts['checkout-step'] ?? 0) > 0) points += 10;
  return points;
}

/** Score band labels from the master structure's lead
 * classification: Hot, Warm and Cold Leads. */
export function scoreBand(score: number): 'hot' | 'warm' | 'cold' {
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}

export function computeLeadScore(
  facts: SessionFacts,
  now: Date = new Date(),
): LeadScore {
  const breakdown: LeadScoreBreakdown = {
    recency: scoreRecency(facts.lastActivityAt, now),
    productViews: scoreProductViews(facts.eventCounts['product-view'] ?? 0),
    repeatSessions: scoreRepeatSessions(facts.visitorSessionCount),
    cartValue: scoreCartValue(facts.maxCartValueMinor),
    checkoutProgress: scoreCheckoutProgress(facts.eventCounts),
  };
  const total =
    breakdown.recency +
    breakdown.productViews +
    breakdown.repeatSessions +
    breakdown.cartValue +
    breakdown.checkoutProgress;
  const score = Math.min(total, 100);
  return { score, breakdown, band: scoreBand(score) };
}
