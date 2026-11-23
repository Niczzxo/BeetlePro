'use client';

/* Theme toggle. The button itself is the legacy #themeToggle: the
   ink-bleed module (features/theme/inkBleed.ts, the port of the
   legacy ink IIFE) owns it, attaching the click handler that runs
   the WebGL2 ink bleed from the click point, syncing the
   aria-label and the theme-color meta, and persisting the choice
   under the dostelo-theme localStorage key, with the legacy 2D
   ink blob and CSS cross-fade fallbacks. This component only
   renders the button (with the pre-paint theme's label as the
   server-rendered default) and starts the module on mount. */

import { useEffect } from 'react';
import { initInkBleed } from '../../features/theme/inkBleed';

export default function ThemeToggle() {
  useEffect(() => {
    initInkBleed();
  }, []);

  return (
    <button
      className="hbtn"
      id="themeToggle"
      data-ink-live=""
      aria-label="Switch to dark theme"
    >
      <svg className="icon icon-moon" viewBox="0 0 24 24">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
      <svg className="icon icon-sun" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    </button>
  );
}
