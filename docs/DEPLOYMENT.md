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
generates the Prisma client from the real schema
(`packages/database/prisma/schema.prisma`) before the build
and again after pruning, prunes dev dependencies, and runs
as the non-root `node` user with a health check against
`GET /health`. `packages/database` is copied into the runtime
image, and the `prisma` CLI is a production dependency of
`@dostelo/database`, because the container start command runs
`prisma db push --skip-generate` from that package before
starting the server (see Schema apply, below).

For a production-like local stack (API plus PostgreSQL 16 and
Redis 7 with named volumes):

```bash
docker compose up --build
```

The API receives `DATABASE_URL` and `REDIS_URL` pointing at
the compose services. With `DATABASE_URL` set, the API binds
its Prisma repositories against PostgreSQL; with `REDIS_URL`
set, the job queue runs on BullMQ. With either unset, the
in-memory and in-process fallbacks bind instead, which is how
the test suite's default mode runs (see
`docs/PRISMA_MIGRATION.md`).

### Schema apply

There are no migration files in `packages/database` yet, so
the schema is applied with `prisma db push`. The image's start
command does this on every container start, before the server
listens:

```bash
cd /app/packages/database && ./node_modules/.bin/prisma db push --skip-generate
cd /app/apps/api && exec node dist/main.js
```

On a fresh, empty database this creates all 54 tables. On an
existing database it syncs the schema forward and stops with
an error rather than dropping data when a change would lose
data. When real migrations are introduced later, this step
becomes `prisma migrate deploy` and this section gets updated
with it.

### Railway route

The API's chosen host is Railway, which runs the same Docker
image:

- One Railway project holding three services: the API (from
  this repo), a PostgreSQL service and a Redis service.
- API service settings: Root Directory stays at the
  repository root (the Dockerfile builds from the root
  context), Dockerfile Path is `apps/api/Dockerfile`. The
  image sets `NODE_ENV=production` and `API_PORT=4000`
  itself.
- Port: the API listens on `API_PORT`, which the image fixes
  at 4000; it does not read Railway's injected `PORT`. When
  generating the public domain for the API service, set its
  target port to 4000.
- Required environment on the API service:
  `DATABASE_URL` (reference the PostgreSQL service's
  variable), `REDIS_URL` (reference the Redis service's
  variable), `AUTH_SECRET` (at least 16 characters; boot
  refuses without it), `STOREFRONT_URL` and `ADMIN_URL` (the
  exact Vercel origins of the two apps, for the production
  CORS allowlist), `ADMIN_SEED_EMAIL` and
  `ADMIN_SEED_PASSWORD` (the first staff account), and
  `API_URL` (the public Railway URL, for payment callbacks).
  `ADMIN_SEED_ROLE` is optional and defaults to super-admin.
- Seed behaviour: on startup the API creates the seed admin
  only if no account with `ADMIN_SEED_EMAIL` exists yet; an
  existing account is left untouched, so changing the seed
  password later does not change the stored one (use the
  admin portal for password changes). With the seed variables
  absent, no admin exists and admin login answers that it is
  not configured. The product catalogue is seeded the same
  way on first boot, only while the Product table is empty.
- After the first deploy, set `NEXT_PUBLIC_API_URL` on both
  Vercel projects to the Railway API URL and redeploy them,
  or the apps keep pointing at `http://localhost:4000`.

This route was proven locally without Docker on 2026-11-24 by
replaying the image's exact sequence against a fresh, empty
PostgreSQL database: generate the client from the schema,
`prisma db push` (54 tables created), boot with
`NODE_ENV=production` and the variables above, then
`GET /health` answered ok, the seeded admin signed in through
`POST /v1/auth/admin/login` and received an access and
refresh token pair with the super-admin role, and
`GET /v1/catalog/products` answered with the seeded catalogue
of 22 products.

### Plain Node route

```bash
pnpm install --frozen-lockfile
pnpm --filter @dostelo/api... build
# Only when DATABASE_URL points at a real database: apply the
# schema first, the same step the Docker start command runs.
pnpm --filter @dostelo/database exec prisma db push --skip-generate
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
- API: restart the previous image tag or build. With
  `DATABASE_URL` set, the data lives in PostgreSQL and
  survives restarts and rollbacks; keep in mind the start
  command applies the schema of the image being started, so
  rolling back across a schema change needs the care
  described in `docs/PRISMA_MIGRATION.md`. In the in-memory
  fallback mode (no `DATABASE_URL`), state still resets on
  every restart.
