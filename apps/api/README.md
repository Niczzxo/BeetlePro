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
queue seam (in-process runner standing in for BullMQ), cart
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
- `src/modules/jobs`: the JobQueue seam. The architecture
  targets Redis plus BullMQ, neither available here, so the
  bound implementation is an in-process runner driven by
  timers with BullMQ-like semantics (delayed enqueue,
  caller-chosen job ids, cancellation, failing processors
  logged and isolated). Services depend only on the abstract
  JobQueue; the BullMQ implementation later replaces the
  provider binding in jobs.module.ts and nothing else.
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

Money is integer minor units (paisa) plus currency BDT everywhere,
per @dostelo/types. The API namespace is /v1/... per docs/API.md.

## Data layer: in-memory repositories, and how Prisma slots in

Prisma engine binaries cannot be downloaded in the current build
environment (binaries.prisma.sh is unreachable), so `prisma
generate` and `prisma validate` cannot run here and there is no
live PostgreSQL. This chunk therefore does not fake a database:

- Every module's persistence goes through a TypeScript repository
  interface in `repositories/*.repository.ts`, written against the
  @dostelo/types domain types.
- The provided implementations (`in-memory-*.repository.ts`) read
  and write an `InMemoryDatabase` (src/store/in-memory.store.ts)
  seeded at startup with the real catalogue: all 22 products with
  real prices and stock, generated from
  apps/storefront/src/data/products.ts by
  scripts/generate-seed.mjs into src/seed/catalog.seed.ts.
- State is per-process and resets on restart. That is a stated
  limitation of this chunk, not a hidden one.

When Prisma engines are available, the Prisma implementation slots
in without touching controllers or services:

1. Run `pnpm --filter @dostelo/database generate` (and `validate`)
   to produce the client from packages/database/prisma/
   schema.prisma.
2. Add a PrismaModule that provides a PrismaService (a
   PrismaClient wrapper) and exports it.
3. For each module, write a `PrismaXRepository` class implementing
   the same abstract repository (CatalogRepository,
   CustomersRepository, CartsRepository, OrdersRepository,
   InventoryRepository, PaymentsRepository, SessionsRepository,
   AdminsRepository, AuditRepository, VisitorsRepository,
   LeadsRepository, CrmRepository, CartRecoveryRepository,
   CommunicationsRepository), mapping domain types to the schema models:
   Product/ProductVariant/ProductMedia/Category for catalog, User
   plus Customer for customers, Cart/CartItem for carts,
   Order/OrderItem/OrderAddress/OrderStatusEvent for
   orders and checkout, Payment/PaymentEvent/Refund/WebhookEvent
   for payments and webhooks, ProductVariant.stock plus StockReservation
   rows for inventory, Session (token hash plus family fields)
   and User plus AdminUser/Role/Permission for auth, and
   AuditLog for the audit trail. Phase 5 adds VisitorSession,
   VisitorEvent, ConsentRecord and IdentityLink for visitors,
   Lead, LeadScore, LeadAssignment, FollowUpTask and
   SuppressionRecord for leads, and CustomerNote plus
   CustomerTag for CRM; the schema carries all of them. Phase 6
   adds AbandonedCart, RecoveryAttempt, CommunicationLog and
   RecoverySequenceStep for recovery and communications; the
   JobQueue seam has no schema (BullMQ keeps its own Redis
   state when it lands).
4. Swap the provider binding in each module file from the in-memory
   class to the Prisma class (one line per module), and replace
   StoreModule with the PrismaModule in app.module.ts.
5. Wrap order placement and status transitions in Prisma
   transactions, as docs/BACKEND_AND_DATABASE.md requires; the
   in-memory implementations mark the exact mutation points.
6. Re-run the Vitest suites against the Prisma repositories (the
   service tests construct the graph manually, so they can bind
   either implementation) and retire the seed script in favour of
   a database seed using the same generated catalogue data.

## Known gaps after this chunk

- Persistence is still in-memory for everything, including the
  Phase 4 additions: sessions, admin users and audit entries
  reset on restart, and MFA enrolment does not survive a restart
  either. The Phase 5 additions (visitor sessions and events,
  consent records, identity links, leads, contact attempts,
  follow-up tasks, CRM notes and suppressions) are in-memory
  too. The Phase 6 additions (abandoned carts, recovery
  attempts and settings, and the communication log) are
  in-memory as well. The repository interfaces are the seam; the Prisma
  schema already carries the Session family fields and the
  AdminUser MFA fields this chunk uses.
- The storefront tracker that emits visitor events is Phase 5
  chunk 2: the API endpoints and the typed client methods are
  ready, but no storefront code sends events yet. Cart recovery
  (Phase 6 chunk 1) consumes the same visitor, lead and
  suppression data; its worker is the in-process JobQueue
  runner, not BullMQ, because Redis is unavailable in this
  environment. Jobs are per-process: a restart loses scheduled
  recovery steps (detected recoveries are re-schedulable by a
  scan, but the in-memory attempts themselves reset with the
  store). The storefront page that consumes the recovery link
  (/recover/<token>) is a later chunk; the API read is ready.
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
