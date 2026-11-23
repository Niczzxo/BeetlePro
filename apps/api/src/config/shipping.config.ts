/**
 * Courier configuration, read from environment variables at
 * call time (never cached at import, never committed), following
 * the payments and communications config pattern.
 *
 * There are no courier merchant credentials in this repository
 * and none may be invented. A courier whose variables are absent
 * is simply not configured: its adapter records shipments as
 * not-configured with the missing variables named, never invents
 * a tracking id, and its webhook deliveries are rejected.
 * Variable names are documented in
 * src/modules/shipping/README.md and the root .env.example.
 */

/** Reads the named variables into a record of value-or-null,
 * so each courier config lists its variable names once and the
 * missing list is derived, never hand-maintained. */
function readNamed(
  env: NodeJS.ProcessEnv,
  names: readonly string[],
): Record<string, string | null> {
  const values: Record<string, string | null> = {};
  for (const name of names) {
    values[name] = env[name] || null;
  }
  return values;
}

function missingNames(
  values: Record<string, string | null>,
): string[] {
  return Object.keys(values).filter((name) => !values[name]);
}

export interface PathaoConfig {
  clientId: string | null;
  clientSecret: string | null;
  username: string | null;
  password: string | null;
  /** The merchant store id parcels are booked under. */
  storeId: string | null;
  apiBaseUrl: string;
  /** Secret used to verify webhook signatures (HMAC-SHA256 of
   * the raw body, this codebase's integration shape). */
  webhookSecret: string | null;
  configured: boolean;
  /** The environment variables still missing, for the honest
   * not-configured record. */
  missing: string[];
}

const PATHAO_ENV_NAMES = [
  'PATHAO_CLIENT_ID',
  'PATHAO_CLIENT_SECRET',
  'PATHAO_USERNAME',
  'PATHAO_PASSWORD',
  'PATHAO_STORE_ID',
] as const;

export function pathaoConfig(
  env: NodeJS.ProcessEnv = process.env,
): PathaoConfig {
  const values = readNamed(env, PATHAO_ENV_NAMES);
  const missing = missingNames(values);
  return {
    clientId: values['PATHAO_CLIENT_ID'] ?? null,
    clientSecret: values['PATHAO_CLIENT_SECRET'] ?? null,
    username: values['PATHAO_USERNAME'] ?? null,
    password: values['PATHAO_PASSWORD'] ?? null,
    storeId: values['PATHAO_STORE_ID'] ?? null,
    apiBaseUrl:
      env.PATHAO_API_BASE_URL || 'https://api-hermes.pathao.com',
    webhookSecret: env.PATHAO_WEBHOOK_SECRET || null,
    configured: missing.length === 0,
    missing,
  };
}

export interface SteadfastConfig {
  apiKey: string | null;
  secretKey: string | null;
  apiBaseUrl: string;
  webhookSecret: string | null;
  configured: boolean;
  missing: string[];
}

const STEADFAST_ENV_NAMES = [
  'STEADFAST_API_KEY',
  'STEADFAST_SECRET_KEY',
] as const;

export function steadfastConfig(
  env: NodeJS.ProcessEnv = process.env,
): SteadfastConfig {
  const values = readNamed(env, STEADFAST_ENV_NAMES);
  const missing = missingNames(values);
  return {
    apiKey: values['STEADFAST_API_KEY'] ?? null,
    secretKey: values['STEADFAST_SECRET_KEY'] ?? null,
    apiBaseUrl:
      env.STEADFAST_API_BASE_URL ||
      'https://portal.steadfast.com.bd/api/v1',
    webhookSecret: env.STEADFAST_WEBHOOK_SECRET || null,
    configured: missing.length === 0,
    missing,
  };
}

export interface RedxConfig {
  accessToken: string | null;
  apiBaseUrl: string;
  webhookSecret: string | null;
  configured: boolean;
  missing: string[];
}

export function redxConfig(
  env: NodeJS.ProcessEnv = process.env,
): RedxConfig {
  const accessToken = env.REDX_ACCESS_TOKEN || null;
  return {
    accessToken,
    apiBaseUrl: env.REDX_API_BASE_URL || 'https://openapi.redx.com.bd/v1',
    webhookSecret: env.REDX_WEBHOOK_SECRET || null,
    configured: Boolean(accessToken),
    missing: accessToken ? [] : ['REDX_ACCESS_TOKEN'],
  };
}
