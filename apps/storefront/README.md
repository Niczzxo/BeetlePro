# Public Storefront
Next.js App Router + React + TypeScript. Public buyer-facing site. The original website is preserved under `public/legacy/`; use it as the exact visual/behavior reference during migration. Do not remove until visual parity tests pass.

## Visitor tracking (Phase 5, architecture addition)

The legacy site has no tracking. The tracker in
`src/features/tracking/` is an addition from the full-stack
architecture (Buyer Intelligence), built so it cannot disturb
the legacy design: it renders nothing except the one-time
consent notice, adds no CSS file and no new colours, and never
changes cart, checkout or navigation behaviour.

- Ids: a random visitor id persisted in localStorage under
  `dostelo-visitor-id`, and a random per-tab session id in
  sessionStorage under `dostelo-session-id`. Random first-party
  values only: no IP address, device fingerprint or user agent
  is read or sent, and identity is never derived from them.
- Events, sent to the API through `@dostelo/api-client` (base
  URL from `NEXT_PUBLIC_API_URL`, defaulting to
  `http://localhost:4000` like the admin portal): page-view on
  route change, product-view on product pages, search when the
  shop opens with a query (the header search submits to
  /shop?q=...), add-to-cart when a bag line's quantity grows
  (observed from the cart provider, whose behaviour is
  unchanged), and checkout-start when the checkout page opens.
  Payloads carry only product ids, the search query, cart value
  in minor units and cart size. Every send is fire-and-forget
  with failures swallowed: the store never breaks because the
  API is down.
- Consent notice: a small dismissible bar styled only with the
  existing design tokens and legacy CSS variables, shown once
  until answered, with Accept and Decline for marketing use of
  the activity. The choice is stored locally under
  `dostelo-consent` and posted to `/v1/visitors/consent`.
  Operational events continue regardless of the answer,
  matching the API's semantics: a visitor who declines is
  flagged `marketingUsable: false`, so lead contact, campaigns
  and recovery exclude them while the activity remains visible
  as operational data.
- `getVisitorId()` is exported from the tracking feature so a
  later checkout integration can pass the visitor id to
  place-order and link the session through the consented
  checkout flow. The checkout flow itself is unchanged in this
  chunk.

## Recovery link page (Phase 6, architecture addition)

The legacy site has no recovery links. The `/recover/[token]`
route (`src/app/recover/[token]/` plus
`src/components/recover/RecoverView.tsx`) is the public target
of the abandoned-cart recovery messages from the full-stack
architecture:

- The unguessable token is the credential. The page reads
  `GET /v1/recovery/:token` through `@dostelo/api-client` (same
  base URL rule as the tracker) and shows the saved items at
  current catalogue prices. The API's view carries no contact
  details, and this page never asks for any.
- On the visitor's action, each line is added into the local
  bag through the existing `CartProvider.add()` (the API
  variant name "Colour / Size", or a bare size, is matched back
  onto the product's own variants), the bag drawer opens, and
  the visitor can review the bag or go straight to checkout.
  Lines whose product has left the catalogue are reported, not
  silently dropped.
- Recovered, closed, cancelled and expired tokens, and tokens
  that match nothing, get an honest message page in the store's
  own design language: legacy page-head and button classes and
  existing CSS variables only, no new colours and no new
  stylesheet. The route is `noindex`, since the link is
  personal.

