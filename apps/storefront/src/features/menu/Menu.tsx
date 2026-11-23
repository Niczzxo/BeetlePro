'use client';

/* Mobile menu state, following the same provider shape as the
   modal system (features/modals/Modals.tsx). The live site's
   sidebar fix keeps the menu state in two functions, openMenu()
   and closeMenu(), which toggle the .on class on #sidenav and
   its own backdrop #mscrim, set aria-expanded on the header
   burger and aria-hidden on the sidebar, and close on the
   Escape key. The port keeps the same contract in React state:
   Header's burger calls openMenu(), the MenuSidebar shell
   component renders the backdrop and the panel from menuOpen,
   and Escape closes while the menu is open (the sidebar half of
   the legacy document keydown; the bag drawer keeps its own
   handler in BagDrawer). */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

interface MenuContextValue {
  menuOpen: boolean;
  openMenu: () => void;
  closeMenu: () => void;
}

const MenuContext = createContext<MenuContextValue | null>(null);

export default function MenuProvider({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  /* The legacy document keydown: Escape closes the sidebar. */
  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeMenu();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen, closeMenu]);

  return (
    <MenuContext.Provider value={{ menuOpen, openMenu, closeMenu }}>
      {children}
    </MenuContext.Provider>
  );
}

export function useMenu(): MenuContextValue {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error('useMenu must be used inside MenuProvider');
  return ctx;
}
