'use client';

/* Shared search state, following the same provider shape as
   the menu system (features/menu/Menu.tsx). The live site
   keeps ONE search dropdown (#searchDrop) fed by two fields:
   the header field, and (since the mobile search fix) a second
   field inside the sidebar menu, because the header field is
   hidden at 1080px and below. Both fields fill the same
   dropdown and drive the same shop results flow; the dropdown
   is lifted above the menu (the over-menu flag) while the
   sidebar field is the one feeding it. The port keeps that
   contract in React state: Header renders the dropdown from
   this state, MenuSidebar's field writes to it, and the header
   search button (visible only at 1080px and below) opens the
   menu and focuses the sidebar field. */

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

interface SearchContextValue {
  query: string;
  dropOpen: boolean;
  /** True while the sidebar field is feeding the dropdown, so
      the dropdown renders above the open menu and choosing a
      result closes the menu behind the navigation. */
  overMenu: boolean;
  /** Feed the dropdown from a field: the live fillSearchDrop(). */
  feed: (value: string, overMenu: boolean) => void;
  setDropOpen: (open: boolean) => void;
  hideDrop: () => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);

export default function SearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('');
  const [dropOpen, setDropOpenState] = useState(false);
  const [overMenu, setOverMenu] = useState(false);

  const feed = useCallback((value: string, fromMenu: boolean) => {
    setQuery(value);
    setOverMenu(fromMenu);
    setDropOpenState(value.trim() !== '');
  }, []);

  const setDropOpen = useCallback((open: boolean) => {
    setDropOpenState(open);
  }, []);

  const hideDrop = useCallback(() => {
    setDropOpenState(false);
    setOverMenu(false);
  }, []);

  return (
    <SearchContext.Provider
      value={{ query, dropOpen, overMenu, feed, setDropOpen, hideDrop }}
    >
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error('useSearch must be used inside SearchProvider');
  return ctx;
}
