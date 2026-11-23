import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP (RFC 6238) over HOTP (RFC 4226) with HMAC-SHA1, the
 * authenticator-app standard, implemented on Node crypto. Secrets
 * are base32 (RFC 4648), the encoding authenticator apps expect
 * in otpauth URLs.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid base32 character: ${char}`);
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** A fresh 160-bit secret, base32-encoded for authenticator apps. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

const STEP_SECONDS = 30;
const DIGITS = 6;

export function totpAt(secretBase32: string, atMs: number): string {
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const key = base32Decode(secretBase32);
  const digest = createHmac('sha1', key).update(counterBuffer).digest();
  const offset = (digest[digest.length - 1] as number) & 0x0f;
  const binary =
    (((digest[offset] as number) & 0x7f) << 24) |
    (((digest[offset + 1] as number) & 0xff) << 16) |
    (((digest[offset + 2] as number) & 0xff) << 8) |
    ((digest[offset + 3] as number) & 0xff);
  const code = binary % 10 ** DIGITS;
  return code.toString().padStart(DIGITS, '0');
}

export function totpNow(secretBase32: string): string {
  return totpAt(secretBase32, Date.now());
}

/**
 * Verifies a code with a one-step window either side, to absorb
 * clock drift and typing time. Comparison is constant-time.
 */
export function verifyTotp(secretBase32: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const now = Date.now();
  for (const offsetMs of [-STEP_SECONDS * 1000, 0, STEP_SECONDS * 1000]) {
    const expected = totpAt(secretBase32, now + offsetMs);
    const a = Buffer.from(expected);
    const b = Buffer.from(code);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

/** The URL an authenticator app scans (as a QR code) at enrolment. */
export function buildOtpauthUrl(input: {
  secret: string;
  account: string;
  issuer?: string;
}): string {
  const issuer = input.issuer ?? 'Dostelo Admin';
  const label = encodeURIComponent(`${issuer}:${input.account}`);
  const params = new URLSearchParams({
    secret: input.secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
