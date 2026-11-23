import { money, type Money } from '@dostelo/types';

/**
 * Shared mapping helpers between the @dostelo/types domain
 * shapes and the Prisma schema shapes. The conventions are the
 * ones the schema was built with (docs/PRISMA_MIGRATION.md):
 *
 * - Domain string unions are kebab-case ('ready-to-ship'); the
 *   schema enums are SCREAMING_SNAKE ('READY_TO_SHIP'). The two
 *   converters below are exact inverses for every enum in the
 *   schema.
 * - Money is { amountMinor, currency } in the domain and a pair
 *   of *Minor Int plus currency columns in the schema.
 * - Timestamps are ISO strings in the domain and DateTime in
 *   the schema.
 */

export function toEnum<T extends string>(value: string): T {
  return value.toUpperCase().replace(/-/g, '_') as T;
}

export function fromEnum<T extends string>(value: string): T {
  return value.toLowerCase().replace(/_/g, '-') as T;
}

export function toMoney(amountMinor: number, currency: string): Money {
  return money(amountMinor, currency as Money['currency']);
}

export function iso(date: Date): string {
  return date.toISOString();
}

export function date(isoString: string): Date {
  return new Date(isoString);
}
