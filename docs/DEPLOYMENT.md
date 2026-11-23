# Deployment

How each part of the monorepo is built and run in production.
Targets (from `docs/SECURITY_AND_DEPLOYMENT.md`): storefront at
www.dostelo.com, admin at admin.dostelo.com, API at
api.dostelo.com. The full environment inventory is the root
`.env.example`; this document covers build and run mechanics.

Nothing in this document was exercised against a real host from
the environment the code was written in: the Docker image and
compose stack are validated by construction and by the local
Node route below (which is exactly how the API is verified in
tests), not by a live deployment. Treat first deployment as a
staging exercise.

## Shared rules

- Install from the repository root with the pinned toolchain:
  `pnpm install --frozen-lockfile` (pnpm 12.21.0 via
  packageManager, Node 22).
- `NEXT_PUBLIC_API_URL` is inlined into the Next.js bundles at
  build time. Set it before building either Next app; changing
  it afterwards requires a rebuild.
- Secrets come from the host environment, never from committed
  files. The API refuses to boot with `NODE_ENV=production`
  unless `AUTH_SECRET` is set to at least 16 characters.

## API (apps/api)

### Docker route

The image is defined in `apps/api/Dockerfile` and built from
the repository root, because the API depends on the
`@dostelo/types` and `@dostelo/validation` workspace packages:

```bash
docker build -f apps/api/Dockerfile -t dostelo-api .
docker run --env-file .env -p 4000:4000 dostelo-api
```

The image builds the API and its workspace dependencies,
prunes dev dependencies, and runs as the non-root `node` user
with a health check against `GET /health`.

For a production-like local stack (API plus PostgreSQL 16 and
Redis 7 with named volumes):

```bash
docker compose up --build
```

The API receives `DATABASE_URL` and `REDIS_URL` pointing at
the compose services. Today the API still runs on its
in-memory repositories, so those two services are provisioned
for the Prisma and BullMQ swap (see
`docs/PRISMA_MIGRATION.md`) and are not read yet.

### Plain Node route

```bash
pnpm install --frozen-lockfile
pnpm --filter @dostelo/api... build
NODE_ENV=production API_PORT=4000 node apps/api/dist/main.js
```

Required environment in production: `AUTH_SECRET` (boot fails
without it), `STOREFRONT_URL` and `ADMIN_URL` (the CORS
allowlist contains exactly these two origins in production),
plus whichever provider groups are being enabled (payments,
communications, couriers) and `ADMIN_SEED_*` for the first
staff account. `API_URL` should be the public API base so
payment callbacks point at the right host.

Put a TLS-terminating reverse proxy in front; the API sets
HSTS only in production and expects to sit behind HTTPS.

## Storefront (apps/storefront) and Admin (apps/admin)

Both are Next.js apps with the same mechanics; they differ
only in port (3000 storefront, 3001 admin) and audience.

### Node host route (verified locally)

```bash
pnpm install --frozen-lockfile
NEXT_PUBLIC_API_URL=https://api.dostelo.com pnpm build
pnpm --filter @dostelo/storefront start   # port 3000
pnpm --filter @dostelo/admin start        # port 3001
```

The root `pnpm build` runs Turborepo, which builds the shared
packages before the apps that consume them.

### Vercel route

One Vercel project per app:

- Root Directory: `apps/storefront` (respectively
  `apps/admin`).
- Framework Preset: Next.js.
- Build Command: `cd ../.. && pnpm exec turbo run build --filter=@dostelo/storefront...`
  (respectively `--filter=@dostelo/admin...`), so the shared
  workspace packages build before the app.
- Environment: `NEXT_PUBLIC_API_URL` set to the public API
  URL, in the Production environment (and Preview if previews
  should reach a staging API).
- Attach the custom domain (www.dostelo.com, respectively
  admin.dostelo.com) and confirm the API's `STOREFRONT_URL`
  and `ADMIN_URL` match the final origins exactly, or CORS
  will reject the browser calls.

The admin portal is staff-only in practice but has no network
level restriction by default; its login, MFA and RBAC are the
access control. If the hosting setup allows it, an additional
IP allowlist on admin.dostelo.com is a reasonable extra layer,
not a substitute for the built-in auth.

## After deploying

Smoke checks, in order:

1. `GET https://api.dostelo.com/health` answers 200.
2. The storefront loads and its tracker calls reach the API
   (no CORS errors in the browser console).
3. Admin login works with the seeded account, and MFA enrolment
   is offered under Security and Access.
4. Place a small COD order end to end and confirm it appears
   in the admin Orders module.
5. Confirm an unconfigured provider still answers honestly
   (for example a gateway payment initiation returns
   not-configured) until its real credentials are installed.

## Rollback

- Next apps: redeploy the previous Vercel deployment, or
  restart the previous Node build. The apps are stateless.
- API: restart the previous image tag or build. The API is
  stateless apart from its in-memory data, which does not
  survive a restart in any version; that changes only when
  the Prisma swap lands, after which rollbacks must also
  respect database migrations (see `docs/PRISMA_MIGRATION.md`).
