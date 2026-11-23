'use client';

/* Account state, a faithful port of the legacy account system
   (the script's "account (this-visit demo sign-in)" section).

   The legacy keeps NO account record anywhere: there is no
   localStorage key for accounts and no session persistence.
   `var user = null` lives in page memory only, set by the
   sign-in and sign-up submits and cleared by sign out, so a
   full page reload signs the visitor out again. This provider
   copies that exactly: React state, nothing persisted.

   Sign in: the typed identifier is trimmed; the account is
   { name: id.split('@')[0] || 'Friend', id: id.toLowerCase() }.
   The password field is required by the form but, as in the
   legacy, never read. Sign up: the id is the email when one is
   given, else the mobile number, trimmed and lowercased; the
   name is the typed full name or 'Friend'. The toasts are the
   legacy wordings.

   The only account data that persists is the per-account order
   count in localStorage (dostelo-orders-by-account), ported in
   features/account/orders.ts: it drives the returning-customer
   line on the account page and the first-order free delivery
   rule in totals(). The two dead offer flags are removed on
   mount, as the legacy removes them at load.

   Store settings are admin-only: isAdmin() in the legacy is
   user.id === 'hello@dostelo.example' (ADMIN_ID). */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useToast } from '../toast/Toast';
import {
  accountOrderCount,
  firstOrderFreeOn,
  purgeLegacyOfferFlags,
  recordAccountOrder,
  type AccountUser,
  type KeyValueStore,
} from './orders';

export const ADMIN_ID = 'hello@dostelo.example';

interface AccountContextValue {
  /** The legacy `user`: null when signed out. */
  user: AccountUser | null;
  /** The legacy isAdmin(). */
  isAdmin: boolean;
  /** The legacy accountOrderCount(user.id): 0 signed out. */
  orderCount: number;
  /** The legacy firstOrderFreeOn(). */
  firstOrderFree: boolean;
  /** The legacy sign-in submit. rawId is the untrimmed field. */
  signIn: (rawId: string) => void;
  /** The legacy sign-up submit: email wins over phone for the id. */
  signUp: (name: string, email: string, phone: string) => void;
  /** The legacy sign-out (both the account page and the
      checkout strip call the same sequence). */
  signOut: () => void;
  /** The legacy recordAccountOrder(user.id), called when an
      order is placed. */
  recordOrder: () => void;
}

const AccountContext = createContext<AccountContextValue | null>(null);

function browserStore(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export default function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null);
  /* Bumped whenever an order is recorded, so the count (and with
     it first-order free) re-reads from localStorage. */
  const [ordersVersion, setOrdersVersion] = useState(0);
  const { toast } = useToast();

  /* The legacy removes the dead offer flags at script load. */
  useEffect(() => {
    const store = browserStore();
    if (store) purgeLegacyOfferFlags(store);
  }, []);

  const signIn = useCallback(
    (rawId: string) => {
      const idv = rawId.trim();
      setUser({ name: idv.split('@')[0] || 'Friend', id: idv.toLowerCase() });
      toast('Signed in - welcome back');
    },
    [toast],
  );

  const signUp = useCallback(
    (name: string, email: string, phone: string) => {
      const idv = (email || phone || '').trim();
      setUser({ name: name || 'Friend', id: idv.toLowerCase() });
      toast('Account created - welcome to DOSTELO');
    },
    [toast],
  );

  const signOut = useCallback(() => {
    setUser(null);
    toast('Signed out');
  }, [toast]);

  const recordOrder = useCallback(() => {
    const store = browserStore();
    if (store) recordAccountOrder(store, user ? user.id : null);
    setOrdersVersion((v) => v + 1);
  }, [user]);

  const value = useMemo<AccountContextValue>(() => {
    const store = typeof window === 'undefined' ? null : browserStore();
    const orderCount = store && user ? accountOrderCount(store, user.id) : 0;
    return {
      user,
      isAdmin: !!user && (user.id || '') === ADMIN_ID,
      orderCount,
      firstOrderFree: store ? firstOrderFreeOn(store, user) : false,
      signIn,
      signUp,
      signOut,
      recordOrder,
    };
    // ordersVersion is read so the count refreshes after an order lands
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, ordersVersion, signIn, signUp, signOut, recordOrder]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount must be used inside AccountProvider');
  return ctx;
}
