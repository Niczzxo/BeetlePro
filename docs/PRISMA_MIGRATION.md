# Prisma Migration: Swapping the In-Memory Repositories

The API was built so this swap is a wiring change, not a
rewrite. Every domain service depends on an abstract repository
class; the in-memory classes are one implementation of those
interfaces, and Prisma classes will be another. This document
is the exact plan for the day a PostgreSQL host and Prisma
engine downloads are available.

## Where things stand

- 15 repository interfaces under
  `apps/api/src/modules/*/repositories/` (about 125 methods),
  each with an in-memory implementation reading and writing
  the shared `InMemoryDatabase` from `StoreModule`.
- The Prisma schema at `packages/database/prisma/schema.prisma`
  has been extended every phase alongside the domain types:
  42 models covering catalog, carts, orders, payments,
  refunds, webhooks, identity and sessions, audit, visitors
  and consent, leads and CRM, cart recovery, communications
  and shipments.
- Two in-memory shapes have no schema counterpart yet and
  must be settled first (next section).
- Nothing Prisma-generated has ever run in the environment
  the code was written in: the Prisma engine download host
  was unreachable there, so `prisma validate` and
  `prisma generate` have never executed against this schema.
  The schema is consistent by construction (it mirrors the
  TypeScript domain types field by field), but step 1 below
  exists because the first real run may still surface small
  schema fixes.

## Schema gaps to close first

1. **Stock reservations.** The in-memory inventory tracks
   per-variant onHand and reserved counts plus per-order
   reservation lines (reserved at placement, released on
   cancellation, settled on delivery). The schema has only
   `ProductVariant.stock`. Add a `StockReservation` model
   (orderId, variantId, quantity, state, timestamps) and treat
   `ProductVariant.stock` as on-hand; availability stays
   on-hand minus active reservations, exactly as the
   in-memory implementation computes it.
2. **Store settings.** The free-delivery offer switch and the
   manual mobile-banking receiving instructions live only on
   the in-memory store (`db.settings`), read directly by
   `CheckoutService` and `ManualMobileBankingProvider`, the
   two remaining direct `InMemoryDatabase` touchpoints outside
   repositories and seeding. Give them a `StoreSettings`
   model behind a small settings repository (or an explicit
   decision to source them from configuration), and rewire
   those two readers to it as part of the swap.

## Repository to model mapping

| Repository interface | Prisma models |
|---|---|
| CatalogRepository | Category, Product, ProductVariant, ProductMedia |
| InventoryRepository | ProductVariant (stock), StockReservation (to add) |
| CustomersRepository | Customer, CustomerAddress |
| AdminsRepository | AdminUser, Role, Permission, AdminUserRole, RolePermission |
| SessionsRepository | Session |
| CartsRepository | Cart, CartItem |
| OrdersRepository | Order, OrderItem, OrderAddress, OrderStatusEvent |
| PaymentsRepository | Payment, PaymentEvent, Refund, WebhookEvent |
| AuditRepository | AuditLog |
| VisitorsRepository | VisitorSession, VisitorEvent, ConsentRecord, IdentityLink |
| LeadsRepository | Lead, LeadScore, LeadAssignment, FollowUpTask, SuppressionRecord |
| CrmRepository | CustomerNote, CustomerTag (plus reads over orders and visitors) |
| CommunicationsRepository | CommunicationLog |
| CartRecoveryRepository | AbandonedCart, RecoveryAttempt, RecoverySequenceStep |
| ShippingRepository | Shipment, ShipmentEvent, CourierWebhookEvent |

Enum values in the schema mirror the `@dostelo/types` unions;
money stays integer minor units plus a currency string, and
timestamps stay UTC, matching the domain types.

## Commands, in order

Run from the repository root on a machine that can reach the
Prisma engine CDN, with `DATABASE_URL` set (see
`.env.example`):

```bash
pnpm install --frozen-lockfile
pnpm --filter @dostelo/database validate     # first ever validation; fix what it reports
pnpm --filter @dostelo/database generate     # generates @prisma/client
pnpm --filter @dostelo/database exec prisma migrate dev --name init
```

Then wire seeding: add a `prisma.seed` entry to
`packages/database/package.json` pointing at a seed script
that inserts the same catalogue `SeedService` loads today
(the data already exists as generated seed data in
`apps/api/src/seed/catalog.seed.ts`), plus the store
settings defaults. Run it with
`pnpm --filter @dostelo/database exec prisma db seed`.

## Binding the Prisma implementations

Each Nest module registers its repository as
`{ provide: XRepository, useClass: InMemoryXRepository }`.
The swap, per module:

1. Write `PrismaXRepository extends XRepository` in the same
   `repositories/` folder, implementing the same methods over
   an injected `PrismaService` (a thin `OnModuleInit` wrapper
   around `PrismaClient`, provided by a new global
   `PrismaModule` that replaces `StoreModule`'s role).
2. Change the module's `useClass` to the Prisma class. No
   service, controller or test-context signature changes:
   they all program against the abstract class.
3. Retire `StoreModule` and `InMemoryDatabase` only after
   every module has swapped and the suite is green (below).
   `SeedService` is replaced by the Prisma seed script.

## Transaction boundaries

The in-memory store is single-threaded, so multi-repository
operations are atomic by construction today. Under Prisma
they are not, and these flows must run inside
`prisma.$transaction` (interactive transactions, so the
service logic stays as written):

- **Order placement** (`CheckoutService.placeOrder`): order,
  items and status event, stock reservations, payment
  attempt, customer order counter, lead conversion and cart
  recovery marking commit or roll back together.
- **Order status transitions** (`OrdersService.transition`):
  status, status event, reservation release or settlement,
  and the COD payment sync that follows from it.
- **Payment verify and refunds** (`PaymentsService`): payment
  status, payment events, refund records and the order's
  mirrored payment status.
- **Webhook application** (payments and couriers): the
  idempotency record and the state change it authorizes are
  one unit, so a crash cannot record a delivery without
  applying it, or apply it twice.

The practical pattern: a transaction-scoped client handed
down from the service entry point. Repository methods gain an
optional transaction client parameter defaulting to the root
client; only the four flows above pass one. Keep the
in-memory implementations signature-compatible (they ignore
the parameter) so both bindings satisfy the same interfaces.

## Test strategy

The service suites are the contract, and they were written
against interfaces, not against the in-memory classes:

1. Add `createPrismaTestContext()` beside
   `apps/api/src/testing/test-context.ts`, wiring the same
   service graph over Prisma repositories against a scratch
   database (the docker-compose PostgreSQL), migrated fresh
   and truncated between tests.
2. Parameterize the existing spec files over the context
   factory and run the identical assertions against both
   bindings. Any behavioral difference is a bug in the new
   binding, not a test to edit.
3. Gate the Prisma runs behind `DOSTELO_TEST_DATABASE_URL`
   so the default suite stays hermetic and fast; run the
   Prisma variant in CI with a PostgreSQL service container
   once the repository is on GitHub.
4. The HTTP security suite and the route guard inventory do
   not touch repositories and need no changes.

## The BullMQ half of the swap

Separate from Prisma but usually done in the same pass:
`apps/api/src/modules/jobs` defines the `JobQueue` interface
the cart-recovery worker already uses. A BullMQ
implementation over `REDIS_URL` replaces the in-process
class in `jobs.module.ts`; no recovery code changes. Do it
after Prisma, so scheduled recovery steps survive restarts
on top of data that also survives restarts.
