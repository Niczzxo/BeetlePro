import { afterEach, describe, expect, it } from 'vitest';
import { createTestContext } from '../../testing/test-context';

/**
 * Integrations service tests: the board mirrors the providers'
 * own config checks. With no credentials in the environment the
 * gateways and channels report not-configured with the missing
 * variable names; setting the variables flips the entry, which
 * proves the board reads live configuration rather than a
 * stored claim.
 */
const KEYS = [
  'SSLCOMMERZ_STORE_ID',
  'SSLCOMMERZ_STORE_PASSWORD',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
] as const;

const saved: Record<string, string | undefined> = {};

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('IntegrationsService', () => {
  it('reports every provider with honest configuration state', async () => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    const ctx = createTestContext();
    const items = ctx.integrations.status();
    expect(items.map((item) => item.key)).toEqual([
      'cod',
      'manual-mobile-banking',
      'sslcommerz',
      'bkash-gateway',
      'whatsapp',
      'email',
      'sms',
      'pathao',
      'steadfast',
      'redx',
    ]);
    const sslcommerz = items.find((item) => item.key === 'sslcommerz')!;
    expect(sslcommerz.configured).toBe(false);
    expect(sslcommerz.missing).toEqual([
      'SSLCOMMERZ_STORE_ID',
      'SSLCOMMERZ_STORE_PASSWORD',
    ]);
    const whatsapp = items.find((item) => item.key === 'whatsapp')!;
    expect(whatsapp.configured).toBe(false);
    expect(whatsapp.missing).toEqual([
      'WHATSAPP_ACCESS_TOKEN',
      'WHATSAPP_PHONE_NUMBER_ID',
    ]);
    expect(items.find((item) => item.key === 'cod')!.configured).toBe(true);
    // No entry ever carries a secret value.
    expect(JSON.stringify(items)).not.toContain('process.env');
  });

  it('flips to configured when the variables are present', async () => {
    for (const key of KEYS) saved[key] = process.env[key];
    process.env.SSLCOMMERZ_STORE_ID = 'store-id';
    process.env.SSLCOMMERZ_STORE_PASSWORD = 'store-password';
    const ctx = createTestContext();
    const sslcommerz = ctx.integrations
      .status()
      .find((item) => item.key === 'sslcommerz')!;
    expect(sslcommerz.configured).toBe(true);
    expect(sslcommerz.missing).toEqual([]);
  });
});
