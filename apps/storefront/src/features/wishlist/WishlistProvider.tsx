'use client';

/* Wishlist state, a faithful port of the legacy wishlist: the
   script's `var wish = {}` (id -> true) and toggleWish(). Like
   the legacy bag, the wishlist is memory only: the legacy file
   stores nothing about it (its only localStorage keys are
   dostelo-theme, dostelo-free-delivery and
   dostelo-orders-by-account), so this provider does not persist
   either - the wishlist empties on a full page reload, exactly
   as on the legacy site.

   toggleWish() flips the id, and the toast confirms with the
   legacy wording: "<name> saved to your wishlist" or "<name>
   removed from wishlist". The .loved class on every heart for
   the piece and the header #wishCount (hidden at zero) follow
   from this state, as they followed from the legacy's DOM pass. */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { byId } from '../../data/products';
import { useToast } from '../toast/Toast';

interface WishlistContextValue {
  /** Raw legacy-shaped wish map: product id -> true. */
  wish: Record<string, true>;
  /** Wished ids in the order they were added (the legacy
      Object.keys(wish) order the wishlist view renders). */
  ids: string[];
  /** Total saved pieces, the number the header wish count shows. */
  count: number;
  wished: (id: string) => boolean;
  /** The legacy toggleWish(). */
  toggleWish: (id: string) => void;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

export default function WishlistProvider({ children }: { children: ReactNode }) {
  const [wish, setWish] = useState<Record<string, true>>({});
  const { toast } = useToast();

  const toggleWish = useCallback(
    (id: string) => {
      const p = byId(id);
      if (!p) return;
      const adding = !wish[id];
      setWish((prev) => {
        const next = { ...prev };
        if (next[id]) delete next[id];
        else next[id] = true as const;
        return next;
      });
      toast(adding ? p.name + ' saved to your wishlist' : p.name + ' removed from wishlist');
    },
    [wish, toast],
  );

  const value = useMemo<WishlistContextValue>(() => {
    const ids = Object.keys(wish);
    return {
      wish,
      ids,
      count: ids.length,
      wished: (id: string) => !!wish[id],
      toggleWish,
    };
  }, [wish, toggleWish]);

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistContextValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used inside WishlistProvider');
  return ctx;
}
