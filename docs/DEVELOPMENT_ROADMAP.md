# Development Roadmap

## Phase 1: Repository foundation
- pnpm monorepo and workspace config
- Three app skeletons
- Shared TypeScript, lint, formatting and test config
- Environment validation
- CI checks

## Phase 2: Public visual migration
- Freeze original visual baseline
- Extract exact design tokens
- Migrate storefront feature-by-feature
- Preserve all existing animations and responsive behavior
- Complete visual/functional regression suite

## Phase 3: Core backend
- PostgreSQL, Prisma and migrations
- Catalog, customer, cart, checkout, order and inventory APIs
- Authentication and session handling
- Payment provider integration and webhook handling

## Phase 4: Admin portal
- Admin login and MFA
- RBAC and audit logs
- Dashboard
- Product/category/inventory management
- Orders, payments, shipping, returns

## Phase 5: Buyer Intelligence and CRM
- Consent-aware event collection
- Visitor session model and customer identity links
- Transparent lead scoring
- CRM timeline and assignments
- Follow-up tasks and contact preferences

## Phase 6: Cart recovery and integrations
- Abandoned cart worker
- Frequency caps and suppression
- WhatsApp/email integrations
- Call task management
- Courier and notification integrations

## Phase 7: Production readiness
- Security review
- Load and failure testing
- Backup/restore test
- Monitoring
- Staged deployment and rollback plan
