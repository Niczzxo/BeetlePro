import type { DeliveryZone } from '@dostelo/types';

/**
 * Server-side delivery zone detection.
 *
 * A faithful port of the storefront's detectZone() in
 * apps/storefront/src/features/checkout/detectZone.ts, which itself
 * ports the legacy checkout. The two regular expressions below are
 * byte-identical to the storefront source: Dhaka sub city (Gazipur,
 * Tongi, Narayanganj, Savar, Ashulia, Keraniganj, Dhamrai, Demra,
 * English plus the listed Bangla spellings) is checked FIRST because
 * those addresses often also say Dhaka; a Dhaka match means Dhaka
 * city; any other non-empty address means outside Dhaka; an empty
 * address means the zone is still pending (null).
 *
 * The storefront zone names map to the domain DeliveryZone as:
 * dhaka -> dhaka-city, subcity -> dhaka-sub-city, outside ->
 * outside-dhaka. Fees come from DELIVERY_ZONE_FEE_MINOR in
 * @dostelo/types (7000 / 10000 / 15000 minor units).
 */
const SUBCITY_RE =
  /gazipur|tongi|narayanganj|savar|ashulia|keraniganj|dhamrai|demra|গাজীপুর|নারায়ণগঞ্জ|সাভার|কেরানীগঞ্জ/i;
const DHAKA_RE = /dhaka|ঢাকা/i;

/** district is the district field, addr is the full address text. */
export function detectZone(
  district: string,
  addr: string,
): DeliveryZone | null {
  const text = district + ' ' + addr;
  if (SUBCITY_RE.test(text)) return 'dhaka-sub-city';
  if (DHAKA_RE.test(text)) return 'dhaka-city';
  if (district.trim() || addr.trim()) return 'outside-dhaka';
  return null;
}
