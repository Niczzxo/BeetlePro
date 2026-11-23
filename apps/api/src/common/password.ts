import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

/**
 * Password hashing with Node's built-in scrypt.
 *
 * Why scrypt from node:crypto instead of bcrypt or argon2: it is a
 * memory-hard KDF suitable for password storage, it ships with Node
 * itself (zero extra dependencies, no native build step), and it
 * keeps the API runnable in environments where package downloads are
 * restricted. The stored format is self-describing so the algorithm
 * can be upgraded later:
 *
 *   scrypt:<salt hex>:<derived key hex>
 */
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1] as string, 'hex');
  const expected = Buffer.from(parts[2] as string, 'hex');
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return (
    derived.length === expected.length &&
    timingSafeEqual(derived, expected)
  );
}
