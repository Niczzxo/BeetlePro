import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * One error shape for the whole API:
 * { statusCode, error, message, path, timestamp }.
 * HttpException payloads keep their own message (and any extra
 * fields they carry, such as validation issues); anything
 * unexpected becomes a plain 500 without leaking internals.
 */
@Catch()
export class ConsistentErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let extra: Record<string, unknown> = {};
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
      } else if (payload && typeof payload === 'object') {
        const record = payload as Record<string, unknown>;
        message =
          (record['message'] as string | string[]) ?? exception.message;
        extra = { ...record };
        delete extra['message'];
        delete extra['statusCode'];
        delete extra['error'];
      }
    }
    response.status(status).json({
      statusCode: status,
      error: HttpStatus[status] ?? 'Error',
      message,
      ...extra,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Baseline security headers on every response. HSTS is only sent
 * outside development, since local work runs over plain HTTP.
 */
export function securityHeaders(
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  response.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  if (process.env.NODE_ENV === 'production') {
    response.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
  }
  next();
}

/**
 * The public GitHub Pages shop is a permanent public surface of
 * the store, so its origin is always on the allowlist: the static
 * file there reads the public catalogue from this API in the
 * browser. PUBLIC_SITE_URL can point the allowlist at a different
 * public site origin if the shop ever moves.
 */
export const GITHUB_PAGES_ORIGIN = 'https://niczzxo.github.io';

/**
 * CORS allowlist: STOREFRONT_URL and ADMIN_URL from the
 * environment, the public GitHub Pages shop origin, plus the
 * usual local development origins for those two apps and this
 * API's own docs tooling. Origins not on the list get no CORS
 * headers at all.
 */
export function corsAllowlist(): string[] {
  const origins = new Set<string>();
  for (const value of [
    process.env.STOREFRONT_URL,
    process.env.ADMIN_URL,
    process.env.PUBLIC_SITE_URL,
  ]) {
    if (value) {
      try {
        origins.add(new URL(value).origin);
      } catch {
        origins.add(value);
      }
    }
  }
  origins.add(GITHUB_PAGES_ORIGIN);
  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:3000');
    origins.add('http://localhost:3001');
    origins.add('http://127.0.0.1:3000');
    origins.add('http://127.0.0.1:3001');
  }
  return [...origins];
}
