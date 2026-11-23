import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const RATE_LIMIT_KEY = 'dostelo:rate-limit';

export interface RateLimitOptions {
  /** Attempts allowed inside the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/** Marks a route for rate limiting by client IP plus the
 * identifier the request carries (login identifier, email,
 * challenge id, visitor id, or a route token parameter). */
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);

/**
 * Fixed-window in-memory rate limiter. Deliberately simple: one
 * process, counts per key, windows anchored at first hit. It is
 * abuse friction for the auth endpoints, not a distributed
 * control; a Redis-backed limiter replaces it when the API runs
 * on more than one instance.
 *
 * Documented limits:
 * - Customer and admin password login: 10 attempts per minute
 *   per IP plus identifier (auth controller, Phase 4).
 * - MFA code exchange: 10 attempts per minute per IP plus
 *   challenge id (auth controller, Phase 4).
 * - Visitor event ingestion: 300 per minute per IP plus visitor
 *   id; consent records: 60 per minute per IP plus visitor id
 *   (visitors controller, Phase 7).
 * - Recovery token reads: 120 per minute per IP plus token
 *   (recovery controller, Phase 7).
 */
@Injectable()
export class RateLimiter {
  private readonly buckets = new Map<
    string,
    { count: number; windowStart: number }
  >();

  /** Records one attempt. Returns true when it is within the
   * limit, false when the caller should answer 429. */
  hit(key: string, options: RateLimitOptions): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStart >= options.windowMs) {
      this.buckets.set(key, { count: 1, windowStart: now });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= options.limit;
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiter,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;
    const request = context.switchToHttp().getRequest<{
      ip?: string;
      body?: Record<string, unknown>;
      params?: Record<string, string>;
    }>();
    const body = request.body ?? {};
    const identifier =
      (typeof body['identifier'] === 'string' && body['identifier']) ||
      (typeof body['email'] === 'string' && body['email']) ||
      (typeof body['challengeId'] === 'string' && body['challengeId']) ||
      (typeof body['visitorId'] === 'string' && body['visitorId']) ||
      (typeof request.params?.['token'] === 'string' &&
        request.params['token']) ||
      'anonymous';
    const key = `${request.ip ?? 'unknown-ip'}:${identifier}`;
    if (!this.limiter.hit(key, options)) {
      throw new HttpException(
        'Too many attempts. Please wait a minute and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
