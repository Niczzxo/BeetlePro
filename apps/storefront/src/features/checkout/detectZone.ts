/* Delivery zone detection, a faithful port of the legacy
   detectZone() and the zone fee table inside totals().

   The zone is read automatically from the checkout address
   fields as the customer types, in three zones: Dhaka sub city
   (100 taka) is checked FIRST, because addresses there often
   also say Dhaka. Gazipur, Tongi, Narayanganj, Savar, Ashulia,
   Keraniganj, Dhamrai and Demra (English, plus the Bangla
   spellings the legacy lists) mean Dhaka sub city; a Dhaka
   match (English or Bangla) in the district or the address text
   means Dhaka city (70 taka); any other address means Outside
   Dhaka (150 taka); no address yet means the zone is still
   pending (null).

   The legacy reads the two form fields straight from the DOM
   (district first: its text is city + ' ' + address); here the
   same two strings arrive as arguments, the district first. */

export type DeliveryZone = 'dhaka' | 'subcity' | 'outside';

const SUBCITY_RE =
  /gazipur|tongi|narayanganj|savar|ashulia|keraniganj|dhamrai|demra|গাজীপুর|নারায়ণগঞ্জ|সাভার|কেরানীগঞ্জ/i;
const DHAKA_RE = /dhaka|ঢাকা/i;

/** The legacy detectZone(): city is the district field, addr is
    the full address field. */
export function detectZone(city: string, addr: string): DeliveryZone | null {
  const text = city + ' ' + addr;
  if (SUBCITY_RE.test(text)) return 'subcity';
  if (DHAKA_RE.test(text)) return 'dhaka';
  if (city.trim() || addr.trim()) return 'outside';
  return null;
}

/** Zone delivery fees in whole taka, from the legacy totals(). */
export const ZONE_FEE: Record<DeliveryZone, number> = {
  dhaka: 70,
  subcity: 100,
  outside: 150,
};

/** Zone display names, from the legacy renderCheckout(). */
export const ZONE_NAME: Record<DeliveryZone, string> = {
  dhaka: 'Dhaka city',
  subcity: 'Dhaka sub city',
  outside: 'Outside Dhaka',
};
