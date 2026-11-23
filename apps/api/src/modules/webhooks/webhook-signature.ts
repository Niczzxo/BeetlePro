import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Gateway webhook signature verification.
 *
 * A webhook is only ever trusted after its signature checks out
 * against the configured secret. When no secret is configured the
 * caller rejects the delivery outright (see WebhooksService):
 * an unsigned or unverifiable callback must never move money
 * state.
 */

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * SSLCommerz IPN verification, the scheme the gateway documents:
 * verify_key lists the payload fields that were signed, in order.
 * The expected verify_sign is md5 of the concatenation of those
 * fields' values followed by md5 of the store password.
 */
export function verifySslcommerzSignature(
  payload: Record<string, unknown>,
  storePassword: string,
): boolean {
  const verifyKey =
    typeof payload.verify_key === 'string' ? payload.verify_key : '';
  const verifySign =
    typeof payload.verify_sign === 'string' ? payload.verify_sign : '';
  if (!verifyKey || !verifySign) return false;
  const passwordHash = createHash('md5')
    .update(storePassword)
    .digest('hex');
  const signed = verifyKey
    .split(',')
    .map((field) => String(payload[field.trim()] ?? ''))
    .join('');
  const expected = createHash('md5')
    .update(signed + passwordHash)
    .digest('hex');
  return safeEqual(expected, verifySign.toLowerCase());
}

/** bKash webhook verification in this codebase's integration
 * shape: hex HMAC-SHA256 of the raw request body with the
 * configured webhook secret, sent in the x-bkash-signature
 * header. */
export function verifyBkashSignature(
  rawBody: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqual(expected, signature.toLowerCase());
}
