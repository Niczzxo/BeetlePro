# Handover: Dostelo Monorepo

State of the project at the end of Phase 7 (production
readiness). All seven phases of the architecture pack roadmap
are implemented and verified locally. What remains is a list
of owner decisions and credentials, not missing code; that
list is at the end.

## What was built, phase by phase

- **Phase 1, foundation.** pnpm + Turborepo monorepo: Next.js
  storefront and admin skeletons, NestJS API skeleton, shared
  packages (types, design tokens extracted exactly from the
  legacy CSS, validation, api-client, database). The legacy
  single-file storefront is preserved untouched at
  `apps/storefront/public/legacy/` (10,743,999 bytes) as the
  design source of truth.
- **Phase 2, storefront migration.** The full legacy store
  migrated to Next.js feature by feature: home, shop, product
  pages with both zoom layers, search, bag drawer, the
  paper-plane fly-to-bag animation, wishlist, checkout and
  account with the exact business rules (three delivery
  zones, COD fee, first-order free delivery per account,
  account required to order), journal, policies, contact,
  collections, about, modals, per-view SEO, and the WebGL
  ink-bleed theme transition with byte-identical shaders.
- **Phase 3, core backend.** Catalog, customers, carts,
  checkout with server-side totals, orders with a legal
  status flow, inventory reservations; then payments: COD
  lifecycle, manual mobile banking with staff verification,
  SSLCommerz and bKash gateway adapters that answer
  not-configured honestly without credentials, signed
  idempotent webhooks, refunds, reconciliation reads.
- **Phase 4, auth and admin portal.** JWT access tokens with
  rotating refresh tokens and family revocation, scrypt
  passwords, admin seeded only from the environment, TOTP
  MFA, RBAC guards driven by the roles matrix, append-only
  audit log, rate limiting, CORS allowlist. The admin portal
  is wired to the API end to end: login with MFA step,
  permission-aware 25-module sidebar, live Dashboard,
  Products with inventory adjustment, Orders with legal
  transitions, Payments with verify and refund, CRM, and
  Security and Access with the matrix, audit viewer and MFA
  management.
- **Phase 5, buyer intelligence and CRM.** First-party
  visitor events with consent records, identity linking only
  through login or checkout (anonymous visitors stay
  anonymous, always), a transparent documented lead score,
  lead pipeline with assignment, follow-up tasks and contact
  attempts, opt-out suppression that refuses further contact,
  CRM timelines with notes and tags, admin pages for all of
  it, and a storefront event tracker with a consent notice.
- **Phase 6, cart recovery and integrations.** Abandoned cart
  detection and a staff-editable recovery sequence over a
  job-queue seam, communications providers (WhatsApp, email,
  SMS, manual call logging) that record not-configured
  honestly until real accounts exist, a public recovery link
  that restores a cart without exposing contact details, and
  courier integrations for Pathao, Steadfast and RedX with
  canonical status mapping and signed webhooks, plus the
  admin pages and the storefront recovery page.
- **Phase 7, production readiness.** The intermittent leads
  test failure root-caused and fixed (see below), a full
  security review (route guard inventory pinned by an
  automated test over all 76 routes, body size limits with
  shaped parser errors, rate limits on the public ingestion
  and recovery endpoints, production boot that refuses a
  missing AUTH_SECRET), deployment artifacts (API Dockerfile,
  docker-compose stack, consolidated `.env.example`, GitHub
  Actions CI), and the Prisma migration plan in
  `docs/PRISMA_MIGRATION.md`.

## Verification state

- `pnpm typecheck`: 7 of 7 workspace tasks pass.
- `pnpm build`: 6 of 6 tasks pass.
- API test suite: 202 tests in 24 files, all passing, proven
  with three consecutive full runs at 100 percent.
- Production-mode boot verified directly: without
  `AUTH_SECRET` the API exits with a clear refusal; with test
  environment it serves health with HSTS, rejects non-allowlist
  CORS origins, logs the seeded admin in, registers a
  customer and places a COD order.
- The Phase 7 flake fix: lead conversion on order placement
  compared millisecond timestamps to decide which leads
  existed before an order; a lead and an order created in
  the same millisecond tied, and the lead was wrongly kept
  open. Checkout now snapshots the open lead ids before
  linking, and conversion uses that snapshot. Three
  consecutive 100 percent suite runs followed (the suite had
  failed 4 of 6 runs before the fix).

## Running everything locally

Requirements: Node 22 and pnpm 12.21.0 (via corepack or the
packageManager field).

```bash
pnpm install
pnpm build
pnpm --filter @dostelo/api start        # API on 4000, after build
pnpm --filter @dostelo/storefront start # storefront on 3000
pnpm --filter @dostelo/admin start      # admin on 3001
```

- API health: `GET http://localhost:4000/health`.
- First admin: set `ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD`
  in the API environment before starting it. There are no
  default credentials.
- The Next apps read the API URL from `NEXT_PUBLIC_API_URL`
  (default `http://localhost:4000`), inlined at build time.
- Tests: `pnpm --filter @dostelo/api test`. One suite boots
  the compiled API, so run `pnpm build` first (CI does).
- CI: `.github/workflows/ci.yml` runs install, typecheck,
  build and the API tests on push and pull request, once the
  repository is pushed to GitHub. It has never run yet.

## Known limitations of the current build

- **Persistence is in-memory.** Every repository has an
  in-memory implementation; data resets when the API
  restarts, and scheduled recovery jobs are per-process.
  The Prisma schema (42 models) is kept in sync and the
  swap plan is `docs/PRISMA_MIGRATION.md`, but Prisma
  engines could not be downloaded in the build environment
  (the engine CDN was unreachable), so the schema has never
  been executed by Prisma itself.
- **No real money or messages move.** Payment gateways,
  WhatsApp, email, SMS and couriers are complete adapters
  behind configuration; without the owner's merchant and
  provider credentials they record not-configured and never
  fake a success.
- **Docker artifacts are untested.** The Dockerfile and
  compose stack were written and reviewed but never built
  or run in the build environment (no Docker there).
- **Pages were not click-tested in a browser.** The cloud
  browser could not reach the local builds; admin and
  storefront behavior is verified at HTTP level and by
  driving the exact api-client methods the pages use.

## What remains before real production (owner decisions)

1. **Hosting**: where PostgreSQL, Redis, the API and the two
   Next apps will run (Vercel plus a container host is the
   documented shape in `docs/DEPLOYMENT.md`).
2. **Domain**: the pack targets dostelo.com, which the owner
   does not currently own; the live store is still the
   GitHub Pages single-file build.
3. **Prisma swap**: execute `docs/PRISMA_MIGRATION.md` on a
   machine with engine access, then the BullMQ swap behind
   the job-queue seam.
4. **Merchant credentials**: SSLCommerz store account,
   bKash gateway account (or keep manual mobile banking and
   set the receiving numbers in store settings).
5. **Provider accounts**: WhatsApp Business, a transactional
   email provider, an SMS gateway.
6. **Courier accounts**: Pathao, Steadfast and RedX merchant
   accounts, and confirming each courier's production
   webhook format against the integration shape used here.
7. **Admin seed credentials** for the real deployment,
   chosen by the owner and set only in the host environment.
8. **Visual regression pass**: the migrated storefront
   still owes the side-by-side screenshot comparison
   against the live site (desktop, tablet, mobile, plus
   mid-animation frames). The legacy implementation must
   not be retired anywhere until that pass is done.
9. **GitHub delivery**: this monorepo has not been pushed.
   Which repository it lands in, and how the live store's
   repository relates to it, is the owner's call.
