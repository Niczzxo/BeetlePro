# Security and Deployment

## Deployment targets

| App | Host | Root/build target | Domain |
|---|---|---|---|
| Storefront | Vercel | `apps/storefront` | `www.dostelo.com` |
| Admin | Vercel | `apps/admin` | `admin.dostelo.com` |
| API | Container/Node host | `apps/api` | `api.dostelo.com` |
| Worker | Container/worker host | API worker entry | Internal |
| PostgreSQL | Managed PostgreSQL | Shared DB | Private network |
| Redis | Managed Redis | Queue/cache | Private network |

Use pnpm workspace-aware build settings and install from the repository root. Configure each app's build command and output according to its package scripts. Do not deploy the NestJS API as a static site.

## Security gates before production

- Customer and admin authentication.
- Server-side RBAC for every admin API operation.
- MFA for privileged admin accounts.
- Secure, HTTP-only, SameSite cookies; CSRF protections where applicable.
- Strict CORS allowlist for known domains.
- Rate limiting and abuse protection.
- Input validation and output encoding.
- Payment webhook signature verification and idempotency.
- Audit logs for sensitive staff actions.
- Secret management through host environment variables.
- Database backups and restore drills.
- Error monitoring and alerting.
- Privacy notice, consent records, opt-out and data retention policy.
- Do not covertly fingerprint anonymous visitors.
- Do not expose private buyer details to staff without a business need and role permission.

## Environment variables

Keep `.env` files out of Git. Use `.env.example` with variable names only. Never prefix private API keys with `NEXT_PUBLIC_`.

Expected groups:
- `DATABASE_URL`
- `REDIS_URL`
- `AUTH_SECRET` / provider configuration
- `STOREFRONT_URL`
- `ADMIN_URL`
- `API_URL`
- `WHATSAPP_*`
- `EMAIL_*`
- `PAYMENT_*`
- `COURIER_*`

Only public, non-sensitive configuration may use a `NEXT_PUBLIC_` prefix.
