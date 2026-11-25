'use client';

/* Bag state, a faithful port of the legacy bag (the script's
   `var bag = {}` plus addToBag(), bagList(), defaultSize() and
   pvars()). The legacy bag lives in memory only: the legacy file
   has no localStorage key for it (its only keys are dostelo-theme,
   dostelo-free-delivery and dostelo-orders-by-account), so this
   provider deliberately does not persist either - the bag empties
   on a full page reload, exactly as on the legacy site.

   Lines are keyed "productId~size~colour", as in the legacy, so
   the same piece in two sizes or two colours stays separate
   lines. Quantities cap at the product's stock, as the legacy
   commit does.

   addWithFly() follows the live site's current addToBag(): the
   commit, and with it the bag count and the confirmation toast,
   happen immediately at tap time. With a source photo and no
   reduced-motion preference, the paper plane then flies as
   decoration only (features/cart/flyToBag); its landing bumps
   the bag icon and releases that item's in-flight guard. While
   one add for an item key is in flight, duplicate taps for the
   same key are ignored. With a source photo under reduced
   motion the bag bumps as the commit lands; with no source
   photo the commit lands and the bag drawer opens. The commit's
   toast is the legacy wording: "<name> (<colour>, size <size>)
   added to your bag".

   The drawer open state and its totals live here too. totals is
   the legacy totals() itself (features/cart/totals.ts): the
   admin free-delivery switch is read from the same localStorage
   key the legacy reads (dostelo-free-delivery); the delivery
   zone comes from the shared checkout form state
   (features/checkout), which is what the legacy detectZone()
   reads from the checkout form fields, so the drawer quotes the
   zone fee once an address has been typed at checkout and reads
   "At checkout" before that, exactly as the legacy drawer does;
   and first-order free comes from the signed-in account
   (features/account), the legacy firstOrderFreeOn(). */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { byId, type StorefrontProduct } from '../../data/products';
import { useAccount } from '../account/AccountProvider';
import { useCheckout } from '../checkout/CheckoutProvider';
import { useToast } from '../toast/Toast';
import { bumpBag, flyToBag } from './flyToBag';
import { computeTotals, type Totals } from './totals';

/** The legacy pvars(): the product's colour variants as
    [name, swatch hex, photo] triples, with the legacy fallback to
    a single variant built from the first swatch and main photo. */
export function pvars(p: StorefrontProduct): [string, string, string][] {
  if (p.vars && p.vars.length) return p.vars;
  const first = p.sw && p.sw[0];
  return [[first ? first[0] : 'Default', first ? first[1] : '#CCCCCC', p.img]];
}

/** The legacy defaultSize(): the second size when there is more
    than one, otherwise the only size. */
export function defaultSize(p: StorefrontProduct): string {
  return p.sizes.length > 1 ? p.sizes[Math.min(1, p.sizes.length - 1)] : p.sizes[0];
}

export interface BagLine {
  key: string;
  product: StorefrontProduct;
  /** The colour variant's photo when the line has a colour, else
      the product's main photo (the legacy bagList() rule). */
  img: string;
  size: string;
  colour: string;
  qty: number;
}

/** The legacy totals() in full, computed by
    features/cart/totals.ts from the bag, the checkout zone, the
    admin switch, the account's first-order state and the chosen
    payment method. */
export type BagTotals = Totals;

interface CartContextValue {
  /** Raw legacy-shaped bag: "id~size~colour" -> quantity. */
  bag: Record<string, number>;
  lines: BagLine[];
  /** Total pieces, the number the header bag count shows. */
  count: number;
  /** Subtotal in whole taka (the legacy totals().sub). */
  subtotal: number;
  /** The legacy totals() in full. */
  totals: BagTotals;
  /** Re-read the admin free-delivery switch from localStorage.
      The legacy renderBag() re-reads it on every render; the
      account page's admin switch calls this after writing the
      key, so the drawer and checkout agree at once. */
  refreshFreeAdmin: () => void;
  /** The legacy addToBag() commit itself (no flight, no toast):
      size defaults to defaultSize(), colour to the first
      variant. Kept as the primitive addWithFly() commits with. */
  add: (id: string, qty: number, size?: string | null, colour?: string | null) => void;
  /** The live site's current addToBag(): commits at tap time
      with the confirmation toast, then flies the source photo
      to the bag as decoration when one is given; opens the
      drawer when no source photo is given. */
  addWithFly: (
    id: string,
    qty: number,
    size: string | null,
    colour: string | null,
    sourceEl: HTMLElement | null,
  ) => void;
  /** The legacy drawer stepper: adjust a line by delta, removing
      it when it reaches zero. */
  changeQty: (key: string, delta: number) => void;
  /** The legacy drawer Remove button. */
  removeLine: (key: string) => void;
  /** The legacy post-order reset (bag = {}). */
  clear: () => void;
  /** Whether the bag drawer is open (the legacy .on classes on
      #bagDrawer and #scrim). */
  bagOpen: boolean;
  /** The legacy openBag(). */
  openBag: () => void;
  /** The drawer part of the legacy closeAll(): the welcome and
      help modals join it when their step lands. */
  closeBag: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

/** The legacy bagList(): derive display lines from the raw bag,
    dropping lines whose product no longer exists. */
export function bagList(bag: Record<string, number>): BagLine[] {
  return Object.keys(bag)
    .map((key) => {
      const parts = key.split('~');
      const p = byId(parts[0]);
      let img = p ? p.img : '';
      if (p && parts[2]) {
        const vs = pvars(p);
        for (let i = 0; i < vs.length; i++) {
          if (vs[i][0] === parts[2]) {
            img = vs[i][2];
            break;
          }
        }
      }
      return {
        key,
        product: p as StorefrontProduct,
        img,
        size: parts[1] || '',
        colour: parts[2] || '',
        qty: bag[key],
      };
    })
    .filter((x) => !!x.product);
}

export default function CartProvider({ children }: { children: ReactNode }) {
  const [bag, setBag] = useState<Record<string, number>>({});
  const [bagOpen, setBagOpen] = useState(false);
  const [freeAdmin, setFreeAdmin] = useState(false);
  const addsInFlight = useRef<Set<string>>(new Set());
  const { toast } = useToast();
  const { firstOrderFree } = useAccount();
  const { zone, payMethod } = useCheckout();

  const refreshFreeAdmin = useCallback(() => {
    try {
      setFreeAdmin(localStorage.getItem('dostelo-free-delivery') === '1');
    } catch {
      setFreeAdmin(false);
    }
  }, []);

  /* The legacy renderBag() re-reads the admin free-delivery
     switch on every render; here it is re-read whenever the bag
     changes (and once on mount), which covers every moment the
     drawer can be seen. The account page's admin switch also
     calls refreshFreeAdmin() directly after writing the key. */
  useEffect(() => {
    refreshFreeAdmin();
  }, [bag, refreshFreeAdmin]);

  const add = useCallback(
    (id: string, qty: number, size?: string | null, colour?: string | null) => {
      const p = byId(id);
      if (!p || p.stock === 0) return;
      const col = colour || pvars(p)[0][0];
      const key = id + '~' + (size || defaultSize(p)) + '~' + col;
      setBag((prev) => ({
        ...prev,
        [key]: Math.min((prev[key] || 0) + qty, Math.max(1, p.stock)),
      }));
    },
    [],
  );

  const addWithFly = useCallback(
    (
      id: string,
      qty: number,
      size: string | null,
      colour: string | null,
      sourceEl: HTMLElement | null,
    ) => {
      const p = byId(id);
      if (!p || p.stock === 0) return;
      const col = colour || pvars(p)[0][0];
      const key = id + '~' + (size || defaultSize(p)) + '~' + col;
      /* One add per item at a time: while a tap's flight is still
         in the air, further taps on the same item are ignored.
         The count used to commit only when the plane landed
         (about 1.3 seconds later), so a visitor who tapped again
         thinking the first tap had failed added the same piece
         two or three times over. */
      if (addsInFlight.current.has(key)) return;
      const commit = () => {
        add(id, qty, size, colour);
        toast(p.name + ' (' + col + ', size ' + (size || defaultSize(p)) + ') added to your bag');
      };
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (sourceEl && !reduced) {
        /* The count and the toast answer the tap immediately; the
           flight is decoration only, and its landing just bumps
           the bag icon (inside flyToBag's land()) and releases
           the guard. The timeout is the live site's backstop in
           case a flight ever fails to land. */
        addsInFlight.current.add(key);
        commit();
        flyToBag(sourceEl, () => {
          addsInFlight.current.delete(key);
        });
        window.setTimeout(() => {
          addsInFlight.current.delete(key);
        }, 3000);
      } else if (sourceEl) {
        bumpBag();
        commit();
      } else {
        commit();
        setBagOpen(true);
      }
    },
    [add, toast],
  );

  /* The drawer steppers (the legacy [data-dq] handler). The legacy
     raised the quantity without bound, past the product's stock;
     the live fix clamps an increase at the stock cap, the same
     Math.max(1, stock) cap add() applies above. */
  const changeQty = useCallback((key: string, delta: number) => {
    setBag((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      next[key] += delta;
      if (delta > 0) {
        const p = byId(key.split('~')[0]);
        const cap = p ? Math.max(1, p.stock) : next[key];
        if (next[key] > cap) next[key] = cap;
      }
      if (next[key] <= 0) delete next[key];
      return next;
    });
  }, []);

  const removeLine = useCallback((key: string) => {
    setBag((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const clear = useCallback(() => setBag({}), []);
  const openBag = useCallback(() => setBagOpen(true), []);
  const closeBag = useCallback(() => setBagOpen(false), []);

  const value = useMemo<CartContextValue>(() => {
    const lines = bagList(bag);
    const count = lines.reduce((s, x) => s + x.qty, 0);
    const subtotal = lines.reduce((s, x) => s + x.product.price * x.qty, 0);
    const totals = computeTotals(
      lines.map((x) => ({ price: x.product.price, qty: x.qty })),
      { zone, freeAdmin, freeFirst: firstOrderFree, payMethod },
    );
    return {
      bag,
      lines,
      count,
      subtotal,
      totals,
      refreshFreeAdmin,
      add,
      addWithFly,
      changeQty,
      removeLine,
      clear,
      bagOpen,
      openBag,
      closeBag,
    };
  }, [
    bag,
    freeAdmin,
    zone,
    payMethod,
    firstOrderFree,
    refreshFreeAdmin,
    add,
    addWithFly,
    changeQty,
    removeLine,
    clear,
    bagOpen,
    openBag,
    closeBag,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
