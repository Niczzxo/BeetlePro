# Full Repository Structure

```text
Dostelo/
├── apps/
│   ├── storefront/                     # Public buyer-facing website
│   │   ├── public/
│   │   │   ├── legacy/
│   │   │   │   ├── index.html          # Original source preserved
│   │   │   │   └── assets/             # Original product/hero images
│   │   │   ├── robots.txt
│   │   │   └── sitemap.xml
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (marketing)/        # Home, about, journal, contact
│   │   │   │   ├── shop/
│   │   │   │   ├── category/[slug]/
│   │   │   │   ├── product/[slug]/
│   │   │   │   ├── collections/[slug]/
│   │   │   │   ├── cart/
│   │   │   │   ├── checkout/
│   │   │   │   ├── account/
│   │   │   │   ├── orders/
│   │   │   │   ├── policies/
│   │   │   │   ├── layout.tsx
│   │   │   │   └── globals.css
│   │   │   ├── components/
│   │   │   │   ├── shell/              # Header, footer, nav
│   │   │   │   ├── product/            # Product card/gallery/variant
│   │   │   │   ├── cart/
│   │   │   │   ├── search/
│   │   │   │   ├── motion/             # Existing animation components
│   │   │   │   └── common/
│   │   │   ├── features/
│   │   │   │   ├── catalog/
│   │   │   │   ├── wishlist/
│   │   │   │   ├── cart/
│   │   │   │   ├── checkout/
│   │   │   │   ├── account/
│   │   │   │   ├── journal/
│   │   │   │   └── theme/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   └── styles/
│   │   ├── package.json
│   │   └── next.config.ts
│   │
│   ├── admin/                           # Staff-only portal
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (auth)/login/
│   │   │   │   ├── (dashboard)/
│   │   │   │   │   ├── dashboard/
│   │   │   │   │   ├── buyer-intelligence/
│   │   │   │   │   ├── crm/
│   │   │   │   │   ├── leads/
│   │   │   │   │   ├── cart-recovery/
│   │   │   │   │   ├── communication/
│   │   │   │   │   ├── orders/
│   │   │   │   │   ├── products/
│   │   │   │   │   ├── categories/
│   │   │   │   │   ├── inventory/
│   │   │   │   │   ├── payments/
│   │   │   │   │   ├── shipping/
│   │   │   │   │   ├── returns/
│   │   │   │   │   ├── marketing/
│   │   │   │   │   ├── coupons/
│   │   │   │   │   ├── reviews/
│   │   │   │   │   ├── reports/
│   │   │   │   │   ├── staff/
│   │   │   │   │   ├── roles/
│   │   │   │   │   ├── integrations/
│   │   │   │   │   └── settings/
│   │   │   ├── components/
│   │   │   ├── modules/
│   │   │   ├── hooks/
│   │   │   └── lib/
│   │   ├── package.json
│   │   └── next.config.ts
│   │
│   └── api/                             # NestJS backend
│       ├── src/
│       │   ├── main.ts
│       │   ├── app.module.ts
│       │   ├── common/
│       │   │   ├── guards/
│       │   │   ├── decorators/
│       │   │   ├── filters/
│       │   │   ├── interceptors/
│       │   │   └── audit/
│       │   ├── modules/
│       │   │   ├── auth/
│       │   │   ├── users/
│       │   │   ├── customers/
│       │   │   ├── visitors/
│       │   │   ├── catalog/
│       │   │   ├── carts/
│       │   │   ├── buyer-intelligence/
│       │   │   ├── crm/
│       │   │   ├── leads/
│       │   │   ├── cart-recovery/
│       │   │   ├── orders/
│       │   │   ├── payments/
│       │   │   ├── inventory/
│       │   │   ├── shipping/
│       │   │   ├── communication/
│       │   │   ├── returns/
│       │   │   ├── marketing/
│       │   │   ├── reports/
│       │   │   └── webhooks/
│       │   └── workers/
│       ├── test/
│       └── package.json
│
├── packages/
│   ├── database/                        # Prisma schema/client/migrations
│   ├── types/                           # Shared TypeScript domain types
│   ├── validation/                      # Shared Zod schemas
│   ├── ui/                              # Reusable React UI components
│   ├── design-tokens/                   # Shared CSS variables/tokens
│   ├── api-client/                      # Typed API client
│   ├── config/                          # Shared TS/ESLint config
│   └── utils/                           # Shared utilities
│
├── infrastructure/
│   ├── docker/
│   ├── deployment/
│   └── ci/
│
├── docs/
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .env.example
└── README.md
```

## Domain boundary

- Storefront and Admin are separate Next.js applications.
- Both call the same NestJS API.
- Only the API accesses PostgreSQL directly.
- Shared packages contain types, validation, UI primitives and design tokens, not privileged business operations.
- Background jobs run in a worker process using the same API domain services and database package.
