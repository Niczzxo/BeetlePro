# Dostelo Monorepo

The target production home of Dostelo: a TypeScript monorepo (pnpm
workspaces plus Turborepo) holding the public storefront, the admin
portal and the backend API, with shared packages for types, design
tokens, database schema, validation, UI, API client, config and utils.

- `apps/storefront`: Next.js App Router + React + TypeScript. Public
  buyer-facing website, deployment target www.dostelo.com.
- `apps/admin`: Next.js App Router + React + TypeScript. Staff-only
  admin portal, deployment target admin.dostelo.com.
- `apps/api`: NestJS + TypeScript. The only app that talks to
  PostgreSQL directly, deployment target api.dostelo.com.
- `packages/types`: shared TypeScript domain types (Product, Customer,
  Cart, Order, Payment, admin roles, permissions, audit entries,
  visitor events). Money is integer minor units plus a currency code.
- `packages/design-tokens`: the exact CSS custom properties of the
  Dostelo theme, extracted from the preserved legacy storefront.
- `packages/database`: Prisma schema for PostgreSQL (identity, catalog,
  cart, orders, payments, audit log).
- `packages/validation`, `packages/ui`, `packages/api-client`,
  `packages/config`, `packages/utils`: shared package homes, filled in
  as the phases need them.

Full architecture documents live in `docs/`. Read `docs/README.md`
first, then `docs/STACK_AND_LANGUAGES.md` and
`docs/DESIGN_PRESERVATION_MIGRATION.md` before changing anything
visual.

## Roadmap

From `docs/DEVELOPMENT_ROADMAP.md`:

- Phase 1: Repository foundation. pnpm monorepo, three app skeletons,
  shared TypeScript config, environment validation, CI checks.
- Phase 2: Public visual migration. Freeze the visual baseline, extract
  exact design tokens, migrate the storefront feature by feature with
  regression checks.
- Phase 3: Core backend. PostgreSQL, Prisma and migrations; catalog,
  customer, cart, checkout, order and inventory APIs; authentication;
  payment provider integration and webhooks.
- Phase 4: Admin portal. Login and MFA, RBAC and audit logs, dashboard,
  product, category and inventory management, orders, payments,
  shipping and returns.
- Phase 5: Buyer Intelligence and CRM. Consent-aware event collection,
  visitor sessions and identity links, transparent lead scoring, CRM
  timeline and follow-up tasks.
- Phase 6: Cart recovery and integrations. Abandoned cart worker,
  frequency caps and suppression, WhatsApp and email, call tasks,
  courier and notification integrations.
- Phase 7: Production readiness. Security review, load and failure
  testing, backup and restore test, monitoring, staged deployment and
  rollback plan.

## Current status: all 7 phases complete

The full roadmap is implemented and verified locally. The
storefront is migrated with design parity against the
preserved legacy build; the API covers catalog, carts,
checkout, orders, inventory, payments with honest
not-configured gateways, auth with MFA and RBAC, buyer
intelligence, leads and CRM, cart recovery, communications
and couriers; the admin portal is wired to the API across
its functional modules. `docs/HANDOVER.md` is the complete
state summary: what was built per phase, how to run
everything, and what remains.

Verification at handover: workspace typecheck 7 of 7, build
6 of 6, API test suite 202 tests passing across three
consecutive full runs, and a production-mode boot check
(health, HSTS, tightened CORS, seeded admin login, a placed
COD order; boot without AUTH_SECRET refuses, by design).

Honest limitations, stated once here and in the handover:

- Persistence is in-memory repositories; state resets on API
  restart. The Prisma schema (42 models) is kept in sync and
  the swap plan is `docs/PRISMA_MIGRATION.md`, but Prisma
  engines were unreachable from the build environment, so
  the schema has never been executed by Prisma itself.
- Payment gateways, WhatsApp, email, SMS and couriers are
  complete adapters that answer not-configured until the
  owner's merchant and provider credentials exist. Nothing
  fakes a success.
- The Docker image and compose stack are written and
  reviewed but were never run in the build environment.
- The visual regression pass against the live site is still
  owed; the legacy storefront below stays the design source
  of truth until it passes.

## Relationship to the systems that are live today

This monorepo is the future home, not a replacement that is already
running. The live public store stays live and working until the
migration parity phases complete, and the earlier admin stand-in
is kept for reference:

- The live public store is the single-file site on GitHub Pages
  (repo Niczzxo/Dostelo, https://niczzxo.github.io/Dostelo/). Its
  source is preserved in this repo under
  `apps/storefront/public/legacy/` and remains the visual reference
  until every route and interaction passes parity checks in Phase 2.
- The working admin panel was a separate Vite + TypeScript
  application at `~/workspace/dostelo-admin` (repo
  Niczzxo/Dostelo-Admin), built from the admin master structure
  with a Phase 1 feature set. As of Phase 4 chunk 2 it is
  superseded by `apps/admin` in this repo, which is wired to the
  real API; the Vite panel stays untouched for reference.

Do not delete the legacy storefront source or assets until visual
regression passes, per the migration contract in
`docs/DESIGN_PRESERVATION_MIGRATION.md`.

## Running things

Requirements: Node.js 20 or later and pnpm.

```bash
pnpm install
pnpm build        # build every workspace that has a build script
pnpm typecheck    # strict TypeScript check across workspaces
pnpm dev          # run dev servers in parallel
```

Per app:

```bash
pnpm --filter @dostelo/storefront dev   # http://localhost:3000
pnpm --filter @dostelo/admin dev        # http://localhost:3001
pnpm --filter @dostelo/api start        # after pnpm --filter @dostelo/api build
pnpm --filter @dostelo/database validate
```

The API health endpoint answers at `GET /health` with status ok once
the API is running.
