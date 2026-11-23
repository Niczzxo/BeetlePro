# Dostelo API image.
#
# Build from the REPOSITORY ROOT (the API depends on the
# @dostelo/types and @dostelo/validation workspace packages):
#
#   docker build -f apps/api/Dockerfile -t dostelo-api .
#
# docker-compose.yml at the root already does this.
#
# The image is not exercised in the development environment
# this was written in (no Docker there); it follows the pnpm
# monorepo pattern of building in one stage, pruning dev
# dependencies, and copying the workspace tree so the relative
# symlinks between the root store and the packages survive.
#
# At container start the API applies the Prisma schema to the
# database with `prisma db push` (there are no migration files
# in packages/database yet) and only then starts the server.
# That is why packages/database is copied into the runtime
# image and why the prisma CLI is a production dependency of
# @dostelo/database: `pnpm prune --prod` must not remove the
# tool the startup step runs.

FROM node:22-alpine AS build
WORKDIR /build
RUN corepack enable && corepack prepare pnpm@12.21.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile
# Generate the Prisma client from the real schema
# (packages/database/prisma/schema.prisma) before building, so
# the API compiles against the generated types instead of any
# stub the @prisma/client install step may have produced.
RUN pnpm --filter @dostelo/database generate
# Builds the API plus the workspace packages it depends on.
RUN pnpm --filter @dostelo/api... build
# Drop dev dependencies (TypeScript, vitest, Next.js tooling of
# the sibling apps) from the installed tree before copying.
RUN pnpm prune --prod
# Generate once more in the pruned tree, so the client that
# ships is guaranteed to be the one generated from the real
# schema, whatever the prune left behind.
RUN pnpm --filter @dostelo/database generate

FROM node:22-alpine AS runtime
# openssl is here for the Prisma engines, which link against it
# once the Prisma repositories replace the in-memory ones.
RUN apk add --no-cache openssl
ENV NODE_ENV=production
ENV API_PORT=4000
WORKDIR /app
COPY --from=build --chown=node:node /build/package.json ./package.json
COPY --from=build --chown=node:node /build/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build --chown=node:node /build/node_modules ./node_modules
COPY --from=build --chown=node:node /build/apps/api ./apps/api
COPY --from=build --chown=node:node /build/packages/database ./packages/database
COPY --from=build --chown=node:node /build/packages/types ./packages/types
COPY --from=build --chown=node:node /build/packages/validation ./packages/validation
USER node
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.API_PORT || 4000) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
# Apply the schema to DATABASE_URL first (idempotent on an
# existing database, creates every table on a fresh one; it
# stops with an error rather than dropping data), then start.
CMD ["sh", "-c", "cd /app/packages/database && ./node_modules/.bin/prisma db push --skip-generate && cd /app/apps/api && exec node dist/main.js"]
