# Dostelo: Full-Stack Monorepo Architecture

This repository blueprint defines the target production architecture for Dostelo.

## Core decision

Use **TypeScript as the primary programming language across all three applications**:

- Public storefront: Next.js + React + TypeScript
- Admin portal: Next.js + React + TypeScript
- Backend API: NestJS + TypeScript
- Database: PostgreSQL
- ORM: Prisma
- Cache and background jobs: Redis + BullMQ
- Styling: Tailwind CSS plus the existing Dostelo CSS/design tokens
- Shared UI and design system: React + TypeScript packages

HTML is used for page structure, CSS for styling and animations, and SQL is used only where database-specific queries/migrations require it. No separate Python/PHP/Java backend is required for this architecture.

## Important design-preservation requirement

The uploaded `Dostelo-main/index.html` is retained at:

`apps/storefront/public/legacy/index.html`

Its original `assets/` directory is retained beside it. This is the source of truth for the existing public storefront theme and effects during migration.

The supplied HTML sets `data-theme="light"` by default and restores a saved `dostelo-theme` choice from localStorage. It defines theme variables including `--bg`, `--panel`, `--surface`, `--surface2`, `--ink`, `--body`, `--muted`, `--line`, `--dark`, `--dark2`, `--on-dark`, `--on-dark-mut`, `--chip`, `--shadow`, and radius tokens. It includes animation keyframes such as `sway`, `fadeRise`, `dropIn`, `slideIn`, `lineUp`, `viewIn`, `nw-search-in`, and `hotPulse`. The original source also contains ink-bleed, fly-to-bag, reveal, carousel, zoom, and theme behavior.

**Do not redesign or approximate these effects.** Extract the exact original CSS, HTML structure, timing values, easing curves, JavaScript behavior, images, and responsive breakpoints. Rebuild each feature in React only after visual and functional comparison against the original.

The scaffold does not claim the entire storefront has already been migrated. The legacy source is preserved; the migration plan is documented.

## Domains

- `www.dostelo.com`: public storefront (`apps/storefront`)
- `admin.dostelo.com`: staff-only admin portal (`apps/admin`)
- `api.dostelo.com`: backend API (`apps/api`)

These are deployment targets. Configure DNS, TLS, CORS, cookies, and environment variables before production.

## Read next

1. `docs/STACK_AND_LANGUAGES.md`
2. `docs/REPOSITORY_STRUCTURE.md`
3. `docs/PUBLIC_STOREFRONT.md`
4. `docs/ADMIN_PORTAL.md`
5. `docs/BACKEND_AND_DATABASE.md`
6. `docs/DESIGN_PRESERVATION_MIGRATION.md`
7. `docs/SECURITY_AND_DEPLOYMENT.md`
8. `docs/DEPLOYMENT.md` (build and run mechanics per app)
9. `docs/PRISMA_MIGRATION.md` (the in-memory to Prisma swap plan)
10. `docs/HANDOVER.md` (project state and what remains)
