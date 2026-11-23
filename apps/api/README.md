# Backend API

NestJS + TypeScript REST API. Owns business rules, auth/RBAC,
database access, integrations, webhooks and background-job
producers. Frontends never connect to PostgreSQL directly.

## Status: Phase 6, chunk 1 (abandoned cart recovery, communications)

Implemented and verified over HTTP: catalog, customers, carts,
checkout (quote and place-order), orders with the status flow,
inventory with reservations, payments (COD, manual mobile
banking, gateway sessions) with webhooks and refunds, plus
Phase 4 chunk 1: customer and admin authentication with JWT
access tokens and rotating refresh-token sessions, admin
seeding from the environment, TOTP MFA for staff, server-side
RBAC on the staff-shaped mutations, an audit trail with a
guarded read, CORS allowlist, security headers, auth rate
limiting and one consistent error shape. Phase 4 chunk 2 added
the staff reads the admin portal needs, all permission-guarded:
the staff customer list and profile guard, the staff order list
and detail under /v1/admin/orders, and payments.read /
inventory.read on the reconciliation and stock reads. Phase 5
chunk 1 adds the visitor and buyer side: first-party visitor
event ingestion with consent records and identity linking,
staff Buyer Intelligence session reads with the transparent
lead score, the lead pipeline with assignment, follow-up tasks,
contact attempts and opt-out suppression, and the CRM customer
timeline with staff notes and tags. Phase 6 chunk 1 adds
abandoned cart recovery and the Communication Center: a job
queue seam (in-process runner by default, BullMQ over Redis
when REDIS_URL is set), cart
detection with a stored, staff-editable recovery sequence,
per-step sends through channel providers that are honest when
unconfigured, staff call logging, suppression and consent
enforcement at send time, recovery marking from checkout, and
the public recovery token read. Shipping is a later chunk;
its module stub is in place.

Run it:

```bash
pnpm --filter @dostelo/api build
API_PORT=4000 pnpm --filter @dostelo/api start   # GET /health
pnpm --filter @dostelo/api test                 # Vitest unit tests
```

## Module inventory

All modules follow the pattern from docs/BACKEND_AND_DATABASE.md:
controller (HTTP only), service (business rules), dto (re-exported
Zod schemas from @dostelo/validation), repositories (persistence
seam), policies where a module has flow rules.

- `src/modules/catalog`: GET /v1/catalog/products (optional
  `?category=` filter by slug or name), GET
  /v1/catalog/products/:idOrSlug, GET /v1/catalog/categories with
  product counts.
- `src/modules/customers`: POST /v1/customers/register (email or
  phone, name, password), GET /v1/customers/:id, and since
  chunk 2 the staff list GET /v1/customers (guard:
  customers.read; optional `search` across name, email and phone,
  plus `limit`). The profile read now requires a token: the
  customer themselves, or staff holding customers.read.
  Passwords are hashed with Node's built-in scrypt (see
  src/common/password.ts for why). Login lives in the auth
  module, which verifies against the stored hash.
- `src/modules/auth`: POST /v1/auth/register (customers register
  plus an immediate token pair), POST /v1/auth/login, POST
  /v1/auth/refresh, POST /v1/auth/logout, POST
  /v1/auth/admin/login, POST /v1/auth/admin/mfa/exchange, and
  the bearer-guarded POST /v1/auth/admin/mfa/enroll, enable and
  disable. Access tokens are short-lived JWTs (HS256 on Node
  crypto, see src/common/auth/jwt.ts for the choice); refresh
  tokens are opaque, stored only as SHA-256 hashes in Session
  records, rotate on every use, and reuse of a rotated token
  revokes the whole session family. Admin accounts are seeded
  only from ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD (optional
  ADMIN_SEED_ROLE, default super-admin); with no seed, admin
  login answers 503 with a clear not-configured message, and no
  default credentials exist in code. MFA is TOTP (RFC 6238 on
  Node crypto): enrolment returns the otpauth URL, enabling
  needs a valid code, and login then returns an mfaRequired
  challenge instead of tokens. Password logins and the MFA
  exchange are rate limited (10 attempts per minute per IP plus
  identifier, in-memory; see src/common/rate-limit.ts).
- `src/modules/audit`: the append-only audit trail and its
  staff read, GET /v1/admin/audit-log (guard: audit.read;
  filters actorId, actorType, action, from, to, limit). Recorded
  actions: customer and admin login success and failure, MFA
  enrol, enable, disable and challenge outcomes, admin seed
  creation, order status transitions, payment verify and refund
  actions, and inventory adjustments, each with the acting
  principal from the token.
- RBAC (Phase 4): guards and the RequirePermission decorator
  live in src/common/auth. The role to permission matrix is
  ROLE_PERMISSIONS in @dostelo/types, derived from the admin
  master structure. Guarded routes: POST
  /v1/inventory/:variantId/adjust (inventory.adjust), POST
  /v1/orders/:orderNumber/status (orders.edit), POST
  /v1/payments/:paymentId/verify (payments.verify), POST
  /v1/payments/:paymentId/refunds and its confirm
  (payments.refund), GET /v1/admin/audit-log (audit.read).
  GET /v1/orders?customerId= requires a token: the customer
  themselves, or staff holding orders.read. Chunk 2 added the
  staff reads: GET /v1/customers and the profile guard
  (customers.read), GET /v1/admin/orders and
  /v1/admin/orders/:orderNumber (orders.read; the detail carries
  the status event history and the legal next states), GET
  /v1/payments, /v1/payments/summary and /v1/payments/:paymentId
  (payments.read), and GET /v1/inventory plus
  /v1/inventory/:variantId (inventory.read).
- `src/modules/carts`: POST /v1/carts, GET /v1/carts/:id (computed
  line totals and subtotal), POST /v1/carts/:id/lines, PATCH and
  DELETE /v1/carts/:id/lines/:lineId. Lines validate against
  available inventory.
- `src/modules/checkout`: POST /v1/checkout/quote and POST
  /v1/checkout/place-order. Totals are computed server-side only:
  zone detection ported from the storefront (regexes byte-identical,
  see src/modules/checkout/detect-zone.ts), zone fees 70/100/150
  taka in minor units, COD plus 10 taka, first-order free delivery
  per customer, and the admin free delivery offer switch (settings,
  default off). Placement validates stock, reserves it through
  inventory, creates the order as BP- plus 6 digits in pending
  status, records a payment attempt and counts the order against
  the customer.
- `src/modules/orders`: GET /v1/orders/:orderNumber, GET
  /v1/orders?customerId=, POST /v1/orders/:orderNumber/status,
  and the staff reads GET /v1/admin/orders (optional `status`
  filter) and GET /v1/admin/orders/:orderNumber (chunk 2). The
  flow policy (src/modules/orders/policies/status-flow.ts) enforces
  forward fulfilment steps, cancellation only before shipped,
  delivered to returned as the only exit from delivered, and
  terminal cancelled/returned. Every accepted move records an
  OrderStatusEvent; cancellation releases the stock reservation and
  delivery settles it.
- `src/modules/inventory`: GET /v1/inventory (optional
  `?productId=`) and GET /v1/inventory/:variantId (both behind
  inventory.read since chunk 2), POST
  /v1/inventory/:variantId/adjust (staff only since Phase 4:
  the inventory.adjust permission).
- `src/modules/payments`: payment attempts and their lifecycle,
  owned end to end by PaymentsService (checkout creates its
  attempt through it). COD parks in pending-collection and
  follows the order status flow to collected, voided or
  refunded; bkash, nagad, rocket and upay run as manual mobile
  banking (awaiting-customer, customer confirm, staff verify);
  sslcommerz and card run through the SSLCommerz adapter and
  bkash through its tokenized adapter when
  PAYMENTS_BKASH_MODE=gateway. Unconfigured gateways refuse
  initiation with 503 and are never recorded as paid. Refunds
  (manual confirm flow, or routed through the gateway adapter)
  and reconciliation reads (list with filters, summary; behind
  payments.read since chunk 2) are included. Full detail:
  src/modules/payments/README.md.
- `src/modules/visitors`: POST /v1/visitor-events (public:
  first-party events carrying only the client-generated random
  visitorId and sessionId; the Zod schema in @dostelo/validation
  is strict and rejects any personal-data field), POST
  /v1/visitors/consent (records a ConsentRecord per scope;
  events from a visitor who denied the marketing scope are
  stored as operational records flagged marketingUsable: false),
  and POST /v1/visitors/link (customer token required; the
  customer id comes from the token, never the body). Checkout
  placement links a guest visitorId as a Guest Checkout
  identity. Identity is never derived from IP or fingerprint;
  see the privacy contract in visitors.service.ts.
- `src/modules/buyer-intelligence`: GET
  /v1/admin/buyer-intelligence/sessions and
  /v1/admin/buyer-intelligence/sessions/:sessionId (guard:
  buyers.read), with identity status exactly as recorded, event
  counts, cart value and the lead score. The scoring formula is
  documented in the module README and in lead-score.ts: recency,
  product views, repeat sessions, cart value bands and checkout
  progress, capped at 100. A score never changes an identity
  status. See src/modules/buyer-intelligence/README.md.
- `src/modules/leads`: the lead pipeline from the admin master
  structure (new, qualified, contacted, interested,
  follow-up-required, negotiation, converted, lost,
  do-not-contact). Automatic candidates are raised after event
  ingestion and linking when an identified visitor starts
  checkout without ordering, or scores at or above 70 with
  contact details on file; anonymous visitors never raise
  candidates. Staff endpoints: POST /v1/leads (leads.create),
  GET /v1/leads and /v1/leads/:id (leads.read), POST
  /v1/leads/:id/assign (leads.assign), POST /v1/leads/:id/status
  (leads.edit, transitions checked against
  policies/lead-flow.ts), follow-up tasks under
  /v1/leads/:id/follow-ups (leads.edit / leads.read), POST
  /v1/leads/:id/contact-attempts (leads.contact) and POST
  /v1/leads/:id/opt-out (leads.edit). Contact attempts require
  details for the channel and a recorded contact basis, refuse
  opted-out or suppressed leads, and an attempt recording an
  opt-out moves the lead to do-not-contact and writes a
  suppression record. Placement of an order converts the
  customer's open leads. Candidate evaluation is registered
  with the visitors service as a hook, keeping the module
  dependency one-way.
- `src/modules/crm`: GET /v1/crm/customers/:id/timeline
  (guard: customers.read) aggregating the customer's orders,
  linked visitor sessions and events (only data linked through
  an authenticated or consented flow), notes and tags; POST
  /v1/crm/customers/:id/notes, POST /v1/crm/customers/:id/tags
  and DELETE /v1/crm/customers/:id/tags/:tag (guard:
  customers.edit). Lead assignment, status changes, contact
  attempts, opt-outs, conversions, notes and tags all write to
  the Phase 4 audit trail.
- `src/modules/webhooks`: POST /v1/webhooks/:gateway for
  sslcommerz and bkash only. Deliveries are signature-verified
  (SSLCommerz IPN md5 scheme; bKash HMAC-SHA256 over the raw
  body), rejected outright when no webhook secret is
  configured, and idempotent by (gateway, provider event id):
  a redelivery applies nothing twice.
- `src/modules/jobs`: the JobQueue seam. Two implementations
  exist: an in-process runner driven by timers with BullMQ-like
  semantics (delayed enqueue, caller-chosen job ids,
  cancellation, failing processors logged and isolated), bound
  when REDIS_URL is unset, and a BullMQ implementation
  (bullmq-job-queue.ts, one queue named dostelo-jobs plus one
  worker dispatching by job name) bound when REDIS_URL is set.
  Services depend only on the abstract JobQueue; the selection
  happens in jobs.module.ts and nowhere else. BullMQ rejects
  ':' in caller-chosen job ids, so the BullMQ class stores ids
  with ':' replaced by '__' and translates back on cancel; the
  seam-facing id never changes.
- `src/modules/communications`: the Communication Center. One
  service sends (or honestly fails to send) every customer
  message and records every staff call in an append-only log.
  Checks run before any provider: no address
  (refused-no-contact), a Phase 5 suppression record
  (refused-suppressed), a denied marketing consent
  (refused-consent). Providers follow the payment pattern:
  whatsapp through the WhatsApp Business Cloud API, email and
  sms through generic transactional HTTPS APIs, all honest
  not-configured without credentials; the call channel has no
  telephony provider, so an automated call step creates an
  awaiting-staff call task and staff log real calls themselves
  (kind manual-call, status logged, an opted-out outcome
  writes a suppression). Templates render server-side and the
  rendered text is stored on the log entry. Full detail:
  src/modules/communications/README.md.
- `src/modules/cart-recovery`: abandoned cart detection (items
  present, not converted, inactive beyond the stored threshold,
  and a contact path through a customer or a linked visitor
  session), a stored and staff-editable step sequence (default
  WhatsApp at 1 hour, email at 24 hours, staff call task at 72
  hours) executed one job per attempt over the JobQueue seam,
  recovery marking from checkout (order from the cart, or by
  the same customer covering the cart's lines) that cancels
  pending steps, staff endpoints for list, detail, settings,
  scan, cancel and run-step, and the public GET
  /v1/recovery/:token read (current catalog prices, no contact
  details, honest states for recovered, closed, cancelled and
  expired tokens). Full detail:
  src/modules/cart-recovery/README.md.
- `src/modules/returns`: return and exchange requests against
  delivered orders (GET and POST /v1/admin/returns plus approve,
  reject, refund and complete actions). Quantities are checked
  against what is left to return; approval restocks through the
  inventory service and moves the order to returned when a
  request covers it fully; the refund hand-off creates the
  refund in Payments (a collected COD payment on a fully
  returned order is already settled by the payments order sync,
  and the hand-off records that instead of double-refunding).
- `src/modules/support`: staff-created support tickets
  (/v1/admin/support-tickets) with a reply and internal-note
  log, assignment and status. The storefront has no ticket
  intake, so the opening message records the customer's words
  from phone, Messenger or in-person contact.
- `src/modules/reviews`: staff-entered product reviews and
  moderation (/v1/admin/reviews). A review is marked
  verified-purchase only when the named customer has a
  delivered order containing the product.
- `src/modules/marketing`: campaign records (/v1/admin/campaigns)
  with draft, scheduled and cancelled states. Every view carries
  the channel's live sending state from the communications
  config checks; nothing sends from here.
- `src/modules/loyalty`: points rules in store settings and
  per-customer balances derived from delivered orders
  (/v1/admin/loyalty). Only staff adjustments are stored
  (LoyaltyTransaction), each one audited, with a floor at zero.
- `src/modules/reports`: GET /v1/admin/reports/summary,
  read-only aggregation over orders, payments and recovery:
  sales by day, top products, delivery zone split, payment
  method split and recovery performance. No models of its own.
- `src/modules/website`: GET and PUT /v1/admin/store-settings
  over the StoreSettings seam (store profile, delivery fees,
  free-delivery offer, manual payment instructions, loyalty
  rules). Checkout charges the delivery fee table stored here.
- `src/modules/notifications`: the staff feed
  (/v1/admin/notifications), derived at read time from pending
  orders, low stock and in-recovery carts; only per-staff read
  marks are stored (NotificationRead).
- `src/modules/staff`: admin user management
  (/v1/admin/staff): list with live session counts, create with
  a temporary password, role changes, deactivate and activate,
  and forced logout by session revocation. Views never carry
  password hashes or MFA secrets.
- `src/modules/integrations`: GET /v1/admin/integrations, a
  read-only board computed from the same config checks the
  payment, shipping and communication services use. Missing
  environment variable names only, never values.
- `src/modules/legal`: the six legal documents
  (/v1/admin/legal) stored as settings documents. The
  storefront still serves its ported policy text; serving
  these documents to it is a stated pending step.
- `src/modules/backup`: POST /v1/admin/backups assembles one
  JSON export of the core stores (customer password hashes
  stripped) and records it (DataExport); GET lists past
  exports. No external storage is involved.
- `src/modules/automation`: GET /v1/admin/automation, a
  read-only inventory of the automations that actually run
  (cart recovery detection and sequence, lead evaluation,
  recovery marking, COD payment sync) with live settings read
  from the services that run them.

Money is integer minor units (paisa) plus currency BDT everywhere,
per @dostelo/types. The API namespace is /v1/... per docs/API.md.

## Data layer: two repository bindings, selected by environment

Every module's persistence goes through a TypeScript repository
interface in `repositories/*.repository.ts`, written against the
@dostelo/types domain types, and every interface now has two
implementations:

- The in-memory classes (`in-memory-*.repository.ts`) read and
  write an `InMemoryDatabase` (src/store/in-memory.store.ts),
  seeded at startup with the real catalogue. This is the
  default binding and the one the test suite drives: state is
  per-process and resets on restart.
- The Prisma classes (`prisma-*.repository.ts`, beside the
  in-memory ones in each module) run against PostgreSQL through
  the schema in packages/database/prisma/schema.prisma (54
  models). AppModule imports PrismaModule instead of
  StoreModule when DATABASE_URL is set, each module binds its
  Prisma repository class under the same condition, and
  PrismaSeedService seeds the same catalogue (built by the
  shared builder in src/seed/seed-catalogue.ts) when the
  Product table is empty. Data then survives restarts.

Repository methods are async and accept an optional transaction
client; the four transactional flows (order placement, order
status transitions, payment verify and refunds, webhook
application) thread one through, via the TransactionRunner seam
(PrismaTransactionRunner in the Prisma binding, a no-op in the
in-memory binding, whose store is single-threaded and already
atomic). The two former direct InMemoryDatabase readers outside
repositories, CheckoutService and ManualMobileBankingProvider,
now read through the SettingsRepository seam over the
StoreSettings singleton model.

Selection summary: DATABASE_URL set means Prisma repositories,
unset means in-memory. REDIS_URL set means the BullMQ job
queue, unset means the in-process queue. The two choices are
independent. docs/PRISMA_MIGRATION.md records the swap in full,
including the schema gaps found and closed while implementing
it: StockReservation and StoreSettings from the original plan,
plus three more the domain types already carried (a
LeadContactAttempt model, a Session.replacedById column and a
StoreSettings recovery settings column).

Tests: the default Vitest suite stays on the in-memory context
(202 tests). src/testing/prisma-test-context.ts builds the same
service graph over the Prisma repositories, and
src/testing/prisma-integration.spec.ts exercises the core flows
against a real database, gated behind DOSTELO_TEST_DATABASE_URL
(a disposable test database; the context truncates all tables
and reseeds per test). Specs that read the in-memory store
directly (ctx.db) are in-memory-only by design and are not
duplicated; the integration suite covers the equivalent flows
at the service level.

## Known gaps after this chunk

- Persistence resets on restart only in the default in-memory
  binding. With DATABASE_URL set, everything persists in
  PostgreSQL: catalogue, customers, sessions (including MFA
  state), orders, payments, audit entries, visitor and lead
  data, recovery records and the communication log. With
  REDIS_URL set, scheduled recovery steps also survive
  restarts in Redis; without it, jobs are per-process and a
  restart loses scheduled steps (detected recoveries are
  re-schedulable by a scan).
- The storefront tracker that emits visitor events is Phase 5
  chunk 2: the API endpoints and the typed client methods are
  ready, but no storefront code sends events yet. Cart recovery
  (Phase 6 chunk 1) consumes the same visitor, lead and
  suppression data. The storefront page that consumes the
  recovery link (/recover/<token>) is a later chunk; the API
  read is ready.
- No live messaging exists yet: there are no WhatsApp, email or
  SMS credentials for the store, so in any environment without
  them the communication providers honestly record
  not-configured and only staff-logged manual calls complete.
  The same is true of payment gateways: no merchant credentials
  for SSLCommerz or bKash, so the gateway adapters honestly
  refuse (503) and only COD and manual mobile banking complete.
  Shipping/courier is the remaining Phase 3 chunk.
- Guarded routes are the staff-shaped mutations, the audit
  read, and (since chunk 2) the staff-shaped reads: payment
  reconciliation, inventory, the staff customer list and
  profile, and the staff order list and detail. Phase 6 chunk 1
  guards the recovery and communication endpoints:
  GET /v1/cart-recovery, /v1/cart-recovery/:id and
  /v1/cart-recovery/settings (recovery.read), POST
  /v1/cart-recovery/scan, PUT /v1/cart-recovery/settings, POST
  /v1/cart-recovery/:id/cancel and /v1/cart-recovery/:id/run-step
  (recovery.edit), GET /v1/communications/log
  (communications.read) and POST /v1/communications/calls
  (recovery.edit: logging a call is a recovery and CRM action).
  The public GET /v1/recovery/:token is unguarded by design;
  the unguessable token is the credential and the view carries
  no personal data. Checkout and
  carts stay tokenless by design for now (guest checkout creates
  a passwordless customer); tying carts and checkout to customer
  tokens is a later chunk. The customer-shaped GET
  /v1/orders/:orderNumber lookup stays unguarded, as in Phase 3:
  order numbers are the lookup key a guest uses to follow an
  order, and the staff detail lives behind orders.read under
  /v1/admin/orders.
- Stock is seeded per product in the storefront data and applied
  to every variant of that product; per-variant stock management
  arrives with the admin portal (Phase 4).
