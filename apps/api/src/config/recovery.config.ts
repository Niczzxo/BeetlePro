/**
 * Cart recovery worker configuration, read from environment
 * variables at call time, following the payments config pattern.
 *
 * - CART_ABANDONED_AFTER_MINUTES: inactivity threshold for
 *   detection (default 60). This seeds the stored recovery
 *   settings on first use; staff can edit the stored value
 *   afterwards through the settings endpoint.
 * - CART_RECOVERY_SCAN_MINUTES: how often the in-process worker
 *   re-runs detection and re-arms itself (default 15).
 * - CART_RECOVERY_TOKEN_TTL_DAYS: recovery token lifetime seed
 *   (default 30).
 * - STOREFRONT_URL: public storefront origin used to build the
 *   recovery link placed in messages.
 */
export interface RecoveryConfig {
  abandonedAfterMinutes: number;
  scanIntervalMinutes: number;
  tokenTtlDays: number;
  storefrontUrl: string;
}

function positiveInt(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function recoveryConfig(
  env: NodeJS.ProcessEnv = process.env,
): RecoveryConfig {
  return {
    abandonedAfterMinutes: positiveInt(
      env.CART_ABANDONED_AFTER_MINUTES,
      60,
    ),
    scanIntervalMinutes: positiveInt(
      env.CART_RECOVERY_SCAN_MINUTES,
      15,
    ),
    tokenTtlDays: positiveInt(env.CART_RECOVERY_TOKEN_TTL_DAYS, 30),
    storefrontUrl: (
      env.STOREFRONT_URL || 'http://localhost:3000'
    ).replace(/\/+$/, ''),
  };
}
