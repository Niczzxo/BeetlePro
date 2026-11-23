/* Per-account order history, a faithful port of the legacy
   accountOrders(), accountOrderCount(), recordAccountOrder() and
   firstOrderFreeOn().

   The legacy stores placed orders in localStorage under
   dostelo-orders-by-account: a JSON map of account id to the
   number of orders that account has placed. That count is the
   whole record: no order details are kept, and the count is how
   a returning customer is recognised. An account with zero
   recorded orders gets free delivery on its first order; from
   the second order onward the normal zone rates apply. A
   different account on the same browser has its own count, so
   its first order is free too.

   The legacy also removes two dead keys on sight: the old
   browser-wide dostelo-first-order-used flag and the older
   dostelo-social-free flag. Neither decides anything any more.

   The store is passed in (localStorage in the browser) so the
   rules can be exercised in plain node tests. */

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const ORDERS_BY_ACCOUNT_KEY = 'dostelo-orders-by-account';

/** The legacy account shape: the in-memory user object. */
export interface AccountUser {
  name: string;
  id: string;
}

/** The legacy accountOrders(). */
export function accountOrders(store: KeyValueStore): Record<string, number> {
  try {
    const m = JSON.parse(store.getItem(ORDERS_BY_ACCOUNT_KEY) || '{}');
    return m && typeof m === 'object' ? (m as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** The legacy accountOrderCount(). */
export function accountOrderCount(store: KeyValueStore, id: string | null | undefined): number {
  if (!id) return 0;
  return accountOrders(store)[id] || 0;
}

/** The legacy recordAccountOrder(): bump the account's count,
    and remove the two dead offer flags, as the legacy does. */
export function recordAccountOrder(store: KeyValueStore, id: string | null | undefined): void {
  if (!id) return;
  try {
    const m = accountOrders(store);
    m[id] = (m[id] || 0) + 1;
    store.setItem(ORDERS_BY_ACCOUNT_KEY, JSON.stringify(m));
    store.removeItem('dostelo-first-order-used');
    store.removeItem('dostelo-social-free');
  } catch {
    /* the legacy swallows storage errors here too */
  }
}

/** The legacy script removes the dead offer flags at load. */
export function purgeLegacyOfferFlags(store: KeyValueStore): void {
  try {
    store.removeItem('dostelo-social-free');
    store.removeItem('dostelo-first-order-used');
  } catch {
    /* ignore */
  }
}

/** The legacy firstOrderFreeOn(): a signed-in account with zero
    recorded orders gets its first order's delivery free. */
export function firstOrderFreeOn(store: KeyValueStore, user: AccountUser | null): boolean {
  return !!user && accountOrderCount(store, user.id) === 0;
}
