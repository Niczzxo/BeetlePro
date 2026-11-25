'use client';

/* Toast, a faithful port of the legacy toast(): a single
   #toast pill whose text is set, the .on class added, and any
   pending hide timer cleared and restarted, so the message
   hides 2400ms after the most recent call. The slide itself is
   the legacy .toast CSS (ported in styles/legacy.css). Every
   message string comes from the legacy call sites, unchanged.
   One live-site behaviour joins it: the legacy go() clears a
   toast raised on the outgoing view before the new view
   renders, so a note from the old page (the wishlist empty
   toast was the reported case) never rides over the new one.
   Routes mount separately here, so the equivalent is to
   dismiss the toast on every pathname change. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';

interface ToastContextValue {
  toast: (msg: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('');
  const [on, setOn] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const toast = useCallback((m: string) => {
    setMsg(m);
    setOn(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOn(false), 2400);
  }, []);

  /* The legacy go() toast cleanup, route edition: any toast
     still up when the route changes is dismissed and its hide
     timer cleared, exactly as go() removes the .on class and
     clears the timer before rendering the incoming view. */
  const pathname = usePathname();
  useEffect(() => {
    window.clearTimeout(timer.current);
    setOn(false);
  }, [pathname]);

  useEffect(() => {
    return () => window.clearTimeout(timer.current);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className={'toast' + (on ? ' on' : '')} id="toast" role="status">
        {msg}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
