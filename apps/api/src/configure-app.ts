import { HttpStatus, type INestApplication } from '@nestjs/common';
import {
  json,
  urlencoded,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import {
  ConsistentErrorFilter,
  corsAllowlist,
  securityHeaders,
} from './common/security';

/**
 * Application wiring shared by the real bootstrap (main.ts) and
 * the HTTP security tests, so what the tests exercise is exactly
 * what production runs: CORS, baseline headers, body parsing
 * with an explicit size limit, parser error shaping, and the
 * consistent error filter.
 *
 * Body parsing is registered here instead of through Nest's
 * built-in parser (main.ts creates the app with bodyParser:
 * false) for two reasons: the size limit is explicit and owned
 * by this file, and parser failures (malformed JSON, oversized
 * payloads) happen in Express middleware, before Nest's
 * exception filters can see them. The error handler below
 * answers those in the same shape as ConsistentErrorFilter, so
 * a parser stack trace or body snippet can never leak to a
 * client.
 */

/** JSON and form bodies are capped at 100 KB. The largest
 * legitimate body in this API is a checkout or event payload,
 * two orders of magnitude smaller. */
export const BODY_LIMIT = '100kb';

type RequestWithRawBody = Request & { rawBody?: Buffer };

/** Webhook signature checks (payments, couriers) verify the
 * exact request bytes, so the parsers keep them on the request,
 * the same contract Nest's rawBody mode provided. */
function captureRawBody(
  request: RequestWithRawBody,
  _response: Response,
  buffer: Buffer,
): void {
  if (buffer && buffer.length > 0) {
    request.rawBody = buffer;
  }
}

/**
 * Startup environment validation. Production must run with a
 * real signing secret: without one the auth layer falls back to
 * an ephemeral per-process secret (fine for local development,
 * where it is announced with a warning), which would silently
 * invalidate every token on restart and differ between
 * instances. Fail fast instead, before the server listens.
 */
export function validateEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== 'production') return;
  const secret = env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'AUTH_SECRET must be set to at least 16 characters when NODE_ENV=production. ' +
        'Refusing to boot with the ephemeral development fallback.',
    );
  }
}

/** Answers body-parser failures in the consistent API error
 * shape. The parser's own message is never forwarded: for a
 * malformed JSON body it can quote the submitted payload. */
export function bodyParserErrorHandler(
  error: unknown,
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (response.headersSent) {
    next(error);
    return;
  }
  const type = (error as { type?: unknown } | null)?.type;
  let status: number = HttpStatus.BAD_REQUEST;
  let message = 'Malformed request body';
  if (type === 'entity.too.large') {
    status = HttpStatus.PAYLOAD_TOO_LARGE;
    message = 'Request body is too large';
  } else if (
    type === 'charset.unsupported' ||
    type === 'encoding.unsupported'
  ) {
    status = HttpStatus.UNSUPPORTED_MEDIA_TYPE;
    message = 'Unsupported request encoding';
  }
  response.status(status).json({
    statusCode: status,
    error: HttpStatus[status] ?? 'Error',
    message,
    path: request.url,
    timestamp: new Date().toISOString(),
  });
}

export function configureApp(app: INestApplication): void {
  validateEnvironment();
  app.enableCors({
    origin: corsAllowlist(),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  // Headers first so even a parser rejection carries them, then
  // the parsers, then the handler that shapes parser errors.
  app.use(securityHeaders);
  app.use(json({ limit: BODY_LIMIT, verify: captureRawBody }));
  app.use(
    urlencoded({
      extended: true,
      limit: BODY_LIMIT,
      verify: captureRawBody,
    }),
  );
  app.use(bodyParserErrorHandler);
  app.useGlobalFilters(new ConsistentErrorFilter());
}
