/**
 * Payment gateway configuration, read from environment variables
 * at call time (never cached at import, never committed).
 *
 * There are no merchant credentials in this repository and none
 * may be invented. A gateway whose variables are absent is simply
 * not configured: its adapter refuses initiation with a clear
 * "gateway not configured" error, and its webhooks are rejected.
 * Variable names are documented in
 * src/modules/payments/README.md and the root .env.example.
 */

export interface SslcommerzConfig {
  storeId: string | null;
  storePassword: string | null;
  /** Session, validation and refund API base URL. Defaults to the
   * sandbox or live host by mode; overridable so a test double can
   * stand at the network boundary in local verification. */
  apiBaseUrl: string;
  mode: 'sandbox' | 'live';
  configured: boolean;
}

export function sslcommerzConfig(
  env: NodeJS.ProcessEnv = process.env,
): SslcommerzConfig {
  const storeId = env.SSLCOMMERZ_STORE_ID || null;
  const storePassword = env.SSLCOMMERZ_STORE_PASSWORD || null;
  const mode = env.SSLCOMMERZ_MODE === 'live' ? 'live' : 'sandbox';
  const apiBaseUrl =
    env.SSLCOMMERZ_API_BASE_URL ||
    (mode === 'live'
      ? 'https://securepay.sslcommerz.com'
      : 'https://sandbox.sslcommerz.com');
  return {
    storeId,
    storePassword,
    apiBaseUrl,
    mode,
    configured: Boolean(storeId && storePassword),
  };
}

export interface BkashConfig {
  apiBaseUrl: string;
  appKey: string | null;
  appSecret: string | null;
  username: string | null;
  password: string | null;
  /** Secret used to verify webhook signatures (HMAC-SHA256). */
  webhookSecret: string | null;
  /** 'manual' (default): bKash runs as manual mobile banking, the
   * flow the live storefront uses today. 'gateway': the tokenized
   * checkout adapter handles bKash initiation. */
  mode: 'manual' | 'gateway';
  configured: boolean;
}

export function bkashConfig(
  env: NodeJS.ProcessEnv = process.env,
): BkashConfig {
  const appKey = env.BKASH_APP_KEY || null;
  const appSecret = env.BKASH_APP_SECRET || null;
  const username = env.BKASH_USERNAME || null;
  const password = env.BKASH_PASSWORD || null;
  return {
    apiBaseUrl:
      env.BKASH_API_BASE_URL || 'https://tokenized.payments.bkash.com',
    appKey,
    appSecret,
    username,
    password,
    webhookSecret: env.BKASH_WEBHOOK_SECRET || null,
    mode: env.PAYMENTS_BKASH_MODE === 'gateway' ? 'gateway' : 'manual',
    configured: Boolean(appKey && appSecret && username && password),
  };
}

/** Public base URL of this API, used to build gateway callback
 * URLs. Falls back to a localhost shape for local runs. */
export function apiPublicBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (env.API_URL) return env.API_URL.replace(/\/$/, '');
  const port = env.API_PORT || '4000';
  return `http://localhost:${port}`;
}
