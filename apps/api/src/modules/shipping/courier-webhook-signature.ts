import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Courier webhook signature verification, in this codebase's
 * integration shape (the same scheme the bKash payment webhook
 * uses): the courier signs the raw request body with HMAC-SHA256
 * keyed by the configured webhook secret and sends the hex
 * digest in the x-courier-signature header.
 *
 * A webhook is only ever trusted after its signature checks out.
 * When no secret is configured the caller rejects the delivery
 * outright (see ShippingService): an unsigned or unverifiable
 * callback must never move a shipment or an order.
 */
export function verifyCourierWebhookSignature(
  rawBody: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  const left = Buffer.from(expected);
  const right = Buffer.from(signature.toLowerCase());
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
