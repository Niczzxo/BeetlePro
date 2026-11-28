import { randomUUID, createHash } from 'node:crypto';
export function newId(prefix = ''): string { return prefix ? `${prefix}_${randomUUID()}` : randomUUID(); }
export function slugify(input: string): string { return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
export function sha256Hex(input: string): string { return createHash('sha256').update(input).digest('hex'); }
export function nowIso(): string { return new Date().toISOString(); }
export function addDays(iso: string, days: number): string { const d = new Date(iso); d.setUTCDate(d.getUTCDate() + days); return d.toISOString(); }
export function addHours(iso: string, hours: number): string { return new Date(new Date(iso).getTime() + hours * 3600_000).toISOString(); }
export function formatTaka(minor: number): string { return `BDT ${(minor / 100).toFixed(2)}`; }
export function clampInt(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, Math.trunc(value))); }
export function referralCodeFor(customerId: string): string { return 'DST-' + sha256Hex(customerId).slice(0, 8).toUpperCase(); }
