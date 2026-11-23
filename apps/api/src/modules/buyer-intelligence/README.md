# Buyer Intelligence

Phase 5, chunk 1. Staff reads over the visitor data the
storefront tracker records, plus the lead score.

## Endpoints

- `GET /v1/admin/buyer-intelligence/sessions` (guard:
  `buyers.read`): every tracked session with its recorded
  identity status, event counts, last activity, latest cart
  value, lead score and band. Filters: `?status=` (one of
  anonymous, known-customer, guest-checkout, unverified-contact)
  and `?minScore=`.
- `GET /v1/admin/buyer-intelligence/sessions/:sessionId` (guard:
  `buyers.read`): the full event timeline for one session, with
  the score breakdown.

## Lead scoring formula

Transparent and fixed in `lead-score.ts`. Total capped at 100.

- Recency of last activity: within 24 hours +25, within 7 days
  +15, within 30 days +5.
- Product views: +4 per product-view event, up to +20.
- Repeat sessions: +5 per session of the same visitor beyond the
  first, up to +10.
- Cart value (highest `cartValueMinor` seen): at or above 2000
  taka +25, at or above 1000 taka +18, at or above 500 taka +10,
  any positive value +5.
- Checkout progress: checkout-start +15, checkout-step +10.

Bands: hot at 70 or more, warm at 40 or more, cold below 40.

## Privacy rules in force

- Identity status is whatever the linking flows recorded. The
  score is a buying-intent signal only: a high score never turns
  an anonymous session into a known buyer, in the data or in
  these responses.
- Session summaries carry no contact details. Contact happens
  through the leads module, where the contact basis is recorded
  and opt-outs are enforced.
- Sessions whose visitor denied the marketing consent scope are
  flagged `marketingUsable: false`; their events remain visible
  as operational data and are excluded from marketing uses.
