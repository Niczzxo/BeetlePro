'use client';

/* Toast, a faithful port of the legacy toast(): a single
   #toast pill whose text is set, the .on class added, and any
   pending hide timer cleared and restarted, so the message
   hides 2400ms after the most recent call. The slide itself is
   the legacy .toast CSS (ported in styles/legacy.css). Every
   message string comes from the legacy call sites, unchanged. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

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
