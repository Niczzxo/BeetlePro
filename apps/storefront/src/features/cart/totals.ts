/* The legacy totals(), as a pure function.

   sub is the bag subtotal in whole taka; disc is always 0 (the
   legacy keeps the field, no discount ever applies). Delivery
   is free when the bag is non-empty and either the admin
   free-delivery switch is on or the signed-in account is on its
   first order. The zone fee applies only when there are items,
   a zone is known and delivery is not free. Cash on Delivery
   adds a flat 10 taka whenever there are items, even when
   delivery itself is free. del is zone fee plus COD fee, and
   total is sub minus disc plus both fees. */

import { ZONE_FEE, type DeliveryZone } from '../checkout/detectZone';

export interface TotalsLine {
  price: number;
  qty: number;
}

export interface Totals {
  sub: number;
  disc: number;
  zone: DeliveryZone | null;
  free: boolean;
  freeAdmin: boolean;
  freeFirst: boolean;
  zoneFee: number;
  codFee: number;
  del: number;
  total: number;
}

export function computeTotals(
  lines: TotalsLine[],
  opts: {
    zone: DeliveryZone | null;
    freeAdmin: boolean;
    freeFirst: boolean;
    payMethod: string;
  },
): Totals {
  const sub = lines.reduce((s, x) => s + x.price * x.qty, 0);
  const disc = 0;
  const zone = opts.zone;
  const freeAdmin = opts.freeAdmin;
  const freeFirst = opts.freeFirst;
  const free = lines.length > 0 && (freeAdmin || freeFirst);
  const zoneFee = lines.length && zone && !free ? ZONE_FEE[zone] : 0;
  const codFee = opts.payMethod === 'Cash on Delivery' && lines.length ? 10 : 0;
  return {
    sub,
    disc,
    zone,
    free,
    freeAdmin,
    freeFirst,
    zoneFee,
    codFee,
    del: zoneFee + codFee,
    total: sub - disc + zoneFee + codFee,
  };
}
