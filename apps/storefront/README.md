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


## Tailwind CSS configuration

Tailwind CSS v3.4.19 is installed in this app (devDependencies:
`tailwindcss`, `postcss`, `autoprefixer`), wired through
`postcss.config.mjs` and configured in `tailwind.config.ts`. The
admin app uses the same version and the same approach, so the
monorepo has one shared Tailwind setup.

Why v3.4.19 and not v4:

- v3 exposes an explicit `content` list and
  `corePlugins.preflight`, which is the only way to guarantee
  that no global reset ever touches the ported legacy
  stylesheet. The v4 equivalent (importing only the utilities
  layer) relies on cascade layers, and its automatic content
  detection would scan the preserved legacy HTML under
  `public/legacy/` and generate utilities from it.
- v3's theme object maps directly onto the existing design
  tokens, and its PostCSS integration is the documented,
  stable pairing for this app's Next.js 15 setup.

Preflight decision: preflight is OFF, twice over.
`corePlugins: { preflight: false }` is set in
`tailwind.config.ts`, and `src/app/globals.css` imports only
`@tailwind utilities` (no base layer, no components layer),
placed AFTER the legacy stylesheet import. Tailwind therefore
emits no global reset of any kind, and utilities sit after
`legacy.css` in the cascade so they are available to new
components without disturbing the legacy design.

Theme mapping: every value in `tailwind.config.ts` resolves to
a CSS variable from `@dostelo/design-tokens` (`tokens.css`).
Colours map one to one (`bg`, `panel`, `surface`, `surface2`,
`ink`, `body`, `muted`, `line`, `dark`, `dark2`, `on-dark`,
`on-dark-mut`, `chip`), `borderRadius` maps `lg`, `md` and
`sm` to `--r-lg`, `--r-md` and `--r-sm`, `boxShadow.token`
maps to `--shadow`, and `fontFamily.sans` is the legacy body
font stack verbatim ("Instrument Sans", system-ui,
sans-serif). No colour, spacing, radius or font value is
hard-coded in the config.

Standing rule: `src/styles/legacy.css` is never edited to
accommodate Tailwind, and the preserved file at
`public/legacy/index.html` is never touched. Legacy-derived
components keep their legacy classes. So far only the two
architecture additions are styled with utilities: the tracking
consent notice in `src/features/tracking/Tracker.tsx` and the
recovery view in `src/components/recover/RecoverView.tsx`.
Their utility values reproduce the inline styles they carried
before, token for token. Two exactness notes:

- Font sizes that were set inline with no line-height change
  (for example the recovery headings at 24px) use arbitrary
  size utilities such as `text-[24px]`, because the named
  scale steps would also set a line-height and change the
  rendering.
- The consent buttons used to carry `font: inherit` inline.
  It is not repeated in utilities because the legacy
  stylesheet already sets `font: inherit` on every button
  element, so the computed value is unchanged.
