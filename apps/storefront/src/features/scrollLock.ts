'use client';

/* Scroll lock (CSS: html.scroll-locked in styles/footer.css),
   ported from the live site's overlay fix. Each overlay family
   owns one flag (scrim: bag drawer, welcome modal, help modal,
   which share the one #scrim; menu: sidebar; zoom: product image
   zoom) and the root class is the OR of the three, so overlapping
   opens and closes in any order can never unlock the page while
   an overlay is still up, nor leave it locked after the last one
   closes. The gutter never moves: legacy.css already carries
   scrollbar-gutter:stable on html, so hiding overflow does not
   shift the layout. */

import { useEffect } from 'react';

export type ScrollLockName = 'scrim' | 'menu' | 'zoom';

const scrollLocks: Record<ScrollLockName, boolean> = {
  scrim: false,
  menu: false,
  zoom: false,
};

function applyScrollLock(): void {
  document.documentElement.classList.toggle(
    'scroll-locked',
    scrollLocks.scrim || scrollLocks.menu || scrollLocks.zoom,
  );
}

export function setScrollLock(name: ScrollLockName, on: boolean): void {
  scrollLocks[name] = !!on;
  applyScrollLock();
}

/* Hook form for the overlay owners: pass the overlay's open
   state and the flag follows it, releasing on unmount too. */
export function useScrollLock(name: ScrollLockName, on: boolean): void {
  useEffect(() => {
    setScrollLock(name, on);
    return () => {
      if (on) setScrollLock(name, false);
    };
  }, [name, on]);
}
