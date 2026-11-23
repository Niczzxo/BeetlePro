# Prisma Migration: Swapping the In-Memory Repositories

Status: DONE (2026-11-24). The swap this document planned has
been implemented and verified. The API now runs on real
PostgreSQL through Prisma when DATABASE_URL is set, and on
BullMQ through Redis when REDIS_URL is set; with either unset,
the previous in-memory binding remains the default, so the
existing test suite's default mode is unchanged. This document
is kept as the record of what was done, including the places
where reality differed from the plan.

## What the swap looks like now

- Every repository interface (16, under
  `apps/api/src/modules/*/repositories/` plus the store
  settings seam in `apps/api/src/store/`) has two
  implementations in the same folder: `in-memory-*.repository.ts`
  and `prisma-*.repository.ts`.
- Repository methods are async and accept an optional trailing
  transaction client (`Tx`, from
  `apps/api/src/prisma/prisma.service.ts`). The in-memory
  classes ignore it; the Prisma classes run through it when a
  transactional flow hands one down.
- `apps/api/src/prisma/` holds PrismaService (lazy PrismaClient
  wrapper), PrismaModule (global; also provides OrderEventBus,
  the transaction runner and the Prisma settings repository),
  transaction-runner.ts (TransactionRunner with
  PrismaTransactionRunner and NoopTransactionRunner) and
  prisma.helpers.ts (enum, money and date mappers: domain
  kebab-case unions convert to schema SCREAMING_SNAKE and back).
- Selection is by environment, per module:
  `useClass: process.env.DATABASE_URL ? PrismaXRepository :
  InMemoryXRepository`, and AppModule imports PrismaModule
  instead of StoreModule under the same condition. JobsModule
  binds BullMqJobQueue when REDIS_URL is set and
  InProcessJobQueue otherwise.
- Seeding: `src/seed/seed-catalogue.ts` builds the catalogue as
  domain objects once; SeedService loads it into the in-memory
  store and PrismaSeedService inserts it through Prisma when
  the Product table is empty. Both bindings start from exactly
  the same catalogue (22 products, 8 categories).

## Schema gaps: the two planned, and three more found

The plan named two gaps; both were closed as specified:

1. **Stock reservations.** `StockReservation` model added
   (orderId as a plain indexed string with no relation, to
   avoid relation write-ordering hazards; variantId related to
   ProductVariant; quantity; state enum ACTIVE, RELEASED,
   FINALIZED). `ProductVariant.stock` is on-hand; reserved is
   the sum of ACTIVE reservation quantities; availability is
   on-hand minus active reservations.
2. **Store settings.** `StoreSettings` singleton model (row id
   "store": freeDeliveryOffer, manualInstructions JSON) behind
   the SettingsRepository seam in `apps/api/src/store/`.
   CheckoutService and ManualMobileBankingProvider, the two
   former direct InMemoryDatabase readers, were rewired to it.

Implementation surfaced three more gaps the plan did not name,
each closed with the smallest change that carries the domain
data:

3. **Lead contact attempts had no model.** The domain type
   LeadContactAttempt existed since Phase 5 with no schema
   counterpart. Added a `LeadContactAttempt` model mirroring
   the type (channel and result as plain strings, following
   the FollowUpTask.status precedent).
4. **Session.replacedById had no column.** AuthService.refresh
   tells a rotated token's reuse apart from a plain revocation
   by this marker; without it, family revocation on reuse
   silently did not happen in Prisma mode (caught by the
   integration suite). Added `Session.replacedById String?`.
5. **Recovery settings scalars had no home.** The sequence
   steps live in RecoverySequenceStep as designed, but
   abandonedAfterMinutes and tokenTtlDays had nowhere to
   persist. Added one JSON column, `StoreSettings.
   recoverySettings`, for the pair.

Two schema errors were also fixed at the first ever
`prisma validate` run: missing opposite relation fields
(`Product.cartItems`, `Customer.visitorSessions`). The schema
now validates clean, and `prisma db push` reports the local
database in sync at 45 tables.

## Repository to model mapping (as implemented)

| Repository interface | Prisma models |
|---|---|
| CatalogRepository | Category, Product, ProductVariant, ProductMedia |
| InventoryRepository | ProductVariant (stock), StockReservation |
| CustomersRepository | User, Customer, CustomerAddress |
| AdminsRepository | User, AdminUser, Role, AdminUserRole |
| SessionsRepository | Session (owner resolved through User) |
| CartsRepository | Cart, CartItem |
| OrdersRepository | Order, OrderItem, OrderAddress, OrderStatusEvent |
| PaymentsRepository | Payment, PaymentEvent, Refund, WebhookEvent |
| AuditRepository | AuditLog |
| VisitorsRepository | VisitorSession, VisitorEvent, ConsentRecord, IdentityLink |
| LeadsRepository | Lead, LeadContactAttempt, FollowUpTask, SuppressionRecord |
| CrmRepository | CustomerNote |
| CommunicationsRepository | CommunicationLog |
| CartRecoveryRepository | AbandonedCart, RecoveryAttempt, RecoverySequenceStep, StoreSettings (settings scalars) |
| ShippingRepository | Shipment, ShipmentEvent, CourierWebhookEvent |
| SettingsRepository | StoreSettings |

Mapping notes worth knowing:

- Customers and admins are split across User (identity and
  password hash) and their profile models. A registered
  customer gets a User row linked from Customer.userId, because
  refresh sessions hang off User; a guest customer stays
  unlinked, exactly as the domain record holds it. Admin roles
  are Role rows whose key is the AdminRole key itself.
- OrderItem carries no timestamp or position column, so line
  order is the database's return order; nothing in the domain
  depends on it (lines are keyed by variant).
- PaymentEvent.status is nullable in the schema, matching the
  domain type.

## Transaction boundaries (as implemented)

The four flows from the plan run inside interactive
transactions, threaded by the optional Tx parameter and the
TransactionRunner seam:

- **Order placement** (CheckoutService.placeOrder): the writes
  from order creation onward (order, status event, stock
  reservations, payment attempt, customer counters, lead
  conversion snapshot and marking, guest identity link, cart
  recovery marking, cart conversion) commit or roll back
  together. The open-lead snapshot is still taken before
  linking, preserving the Phase 7 conversion fix. Queue
  cancellations inside recovery marking are non-transactional
  side effects, accepted and documented in the service: a late
  step against a recovered record is a no-op, and the scan can
  reschedule.
- **Order status transitions** (OrdersService.transition):
  order save, status event and reservation release or finalize
  in one transaction; the event bus emit happens after commit.
- **Payment verify and refunds** (PaymentsService): status
  changes, events, refund records and the order's mirrored
  payment status; the provider network step in requestRefund
  stays outside the transaction, between the record write and
  the settle write.
- **Webhook application** (payments and couriers): the
  idempotency record and the authorized state change are one
  unit. Webhook recording also survives a concurrent
  redelivery: the unique constraint fires and the stored
  record is returned as the duplicate.

Audit appends deliberately stay outside transactions (the log
is append-only and records attempts as well as commits).

## The BullMQ half (as implemented)

`apps/api/src/modules/jobs/bullmq-job-queue.ts` implements the
JobQueue seam over one queue named dostelo-jobs and one
worker, dispatching by job name to the registered processors,
created lazily from REDIS_URL. The API passes its own ioredis
instances (BullMQ 6 loads its Redis client as an optional
peer, so apps/api depends on ioredis directly). Two mapping
notes: BullMQ rejects ':' in caller-chosen job ids, so ids are
stored with ':' replaced by '__' and translated back on
cancel (the seam's callers use ids such as
`recovery-step:<attemptId>`); and completed or failed jobs are
removed immediately, so cancelling a job that already ran
returns false, as the seam specifies. Cart recovery code did
not change.

## One regression the swap surfaced, fixed

Making the services async exposed 16 controller sites that
embedded a service call in a response object without awaiting
it (`return { items: this.service.list(...) }`), which
serialized a Promise as `{}`. Service-level tests cannot see
this; the live HTTP checks did. All 16 sites (catalog, orders,
admin orders, customers, inventory, leads, CRM, payments,
shipping, audit, buyer intelligence, communications, cart
recovery) now await. A directly returned promise was never a
problem: Nest flattens it.

## Test strategy (as executed)

- The default suite stays on the in-memory context:
  202 tests, unchanged, still 100 percent green. Specs that
  read `ctx.db` directly (for example, ageing a cart by
  mutating the store) are in-memory-only by design; they were
  not parameterized, because their assertions are about the
  store's own mechanics.
- `createPrismaTestContext()` in
  `apps/api/src/testing/prisma-test-context.ts` builds the
  same service graph over the Prisma repositories with the
  real transaction runner, against DOSTELO_TEST_DATABASE_URL
  (a disposable database; the context truncates all tables and
  reseeds per test).
- `apps/api/src/testing/prisma-integration.spec.ts` covers the
  equivalent core flows at the service level: seeding, customer
  registration, login and refresh rotation with family
  revocation, admin login through the User and Role rows,
  transactional COD placement with stock reservation,
  cancellation releasing the reservation, manual bKash
  verification, visitor consent behaviour, and cart recovery
  detection with a settings round trip. 8 tests, all passing;
  with DOSTELO_TEST_DATABASE_URL set the full run is 210
  passing, and without it the 8 skip cleanly.
- Live HTTP proof was run against the compiled API with
  DATABASE_URL and REDIS_URL set: register, order placement,
  aged-cart scan scheduling a recovery step through BullMQ
  (both delayed jobs visible in Redis, the recurring scan job
  consumed and re-armed by the worker), then two API restarts
  with the customer, order and recovery still served.

## Environment note: Prisma engines in this sandbox

Prisma's own engine download fails here (ECONNRESET from
binaries.prisma.sh through the proxy), although the host is
reachable: curl through the same proxy downloads both engines
with HTTP 200. The engines (commit
c2990dca591cba766e3b7ef5d9e8a84796e47ab7, debian-openssl-3.0.x)
are cached under ~/.cache/prisma-engines/, and Prisma commands
and the API process run with PRISMA_SCHEMA_ENGINE_BINARY and
PRISMA_QUERY_ENGINE_LIBRARY pointing at them. On a normal host
none of this is needed: `prisma generate` downloads its
engines itself. Local services for development: PostgreSQL 16
and Redis 7 via apt, a `dostelo` database and user, and a
`dostelo_test` database for the integration suite, with
connection strings only in the git-ignored root .env.
