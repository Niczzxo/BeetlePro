import { BadRequestException } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Validates a request body against a Zod schema from
 * @dostelo/validation. Controllers call this and pass the typed
 * result to services, so no unvalidated payload reaches business
 * logic. Throws a 400 with per-field issues on failure.
 */
export function parseBody<T>(schema: ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({
      message: 'Validation failed',
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return result.data;
}

/** Lowercase URL slug: "Dhaka Sub City" becomes "dhaka-sub-city". */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
