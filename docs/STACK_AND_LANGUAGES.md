# Stack and Languages: Exact Technology Choices

## 1. Technology matrix

| Layer | Technology | Language | Used by |
|---|---|---|---|
| Public frontend | Next.js App Router + React | TypeScript, TSX | Storefront |
| Admin frontend | Next.js App Router + React | TypeScript, TSX | Admin |
| Backend API | NestJS | TypeScript | Public + Admin |
| Styling | CSS Modules / existing CSS + Tailwind CSS | CSS | Public + Admin |
| UI components | Shared React package | TSX + CSS | Both apps |
| Design tokens | CSS custom properties + TypeScript constants | CSS + TypeScript | Both apps |
| Validation | Zod | TypeScript | API + frontends |
| Database | PostgreSQL | SQL | Backend |
| ORM | Prisma | Prisma schema + TypeScript | Backend |
| Cache / queues | Redis + BullMQ | TypeScript | Backend workers |
| Authentication | Auth.js or a managed OIDC provider | TypeScript configuration | Admin + customer accounts |
| API contract | REST + OpenAPI | TypeScript definitions | All apps |
| Testing | Vitest + Playwright | TypeScript | All apps |
| Package manager | pnpm workspaces | YAML + JSON | Monorepo |
| Deployment | Vercel for Next.js apps; managed Node/container host for API/worker | Config | All apps |

## 2. Where each language is used

### TypeScript
Use for all frontend components, hooks, state, API clients, backend modules, services, DTOs, validation, jobs, and shared packages.

### TSX
Use for React components and Next.js pages/layouts in both the public and admin apps.

### CSS
Use for all visual styling. The existing public CSS must be ported without changing its values, selectors, breakpoints, transition durations, animation keyframes, or easing curves unless an intentional change is approved.

### SQL
PostgreSQL is the database. Prisma migrations generate/manage most schema changes. Use SQL for reviewed migrations, indexes, constraints, reporting queries, and database-specific features.

### JSON / YAML
Use for package manifests, workspace config, lint/test config, OpenAPI output, CI, and deployment config. These are configuration formats, not application languages.

## 3. Why one primary language?

Using TypeScript in storefront, admin, API and shared packages lets the project share types and validation rules. It reduces duplicate definitions for Product, Customer, Cart, Order, Payment, Inventory and Buyer events.

## 4. Avoid unnecessary language sprawl

Do not introduce PHP, Python, Java, or a second frontend framework for the core platform. Add another language only if a future specialist service has a clear measured need.
