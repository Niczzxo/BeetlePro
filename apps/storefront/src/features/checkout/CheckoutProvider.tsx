'use client';

/* Checkout form state: the legacy checkout form fields and the
   payMethod variable, held above the routes.

   On the legacy page the checkout form lives in the DOM for the
   whole visit: the district and address fields keep their text
   while the visitor moves between views, detectZone() re-reads
   them on every totals() call (so the bag drawer quotes the
   same zone fee once an address exists), and payMethod keeps
   the chosen payment across renders. Holding the fields here,
   in providers that wrap every route, reproduces that: the
   values survive route changes within the visit and reset on a
   full reload, exactly like the legacy form. Before anything
   is typed the zone is null, which is the legacy drawer's
   "At checkout" state. */

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { detectZone, type DeliveryZone } from './detectZone';

interface CheckoutContextValue {
  /** #coName */
  name: string;
  setName: (v: string) => void;
  /** #coPhone */
  phone: string;
  setPhone: (v: string) => void;
  /** #coEmail */
  email: string;
  setEmail: (v: string) => void;
  /** #coAddr, the full address textarea. */
  addr: string;
  setAddr: (v: string) => void;
  /** #coCity, the district field. */
  city: string;
  setCity: (v: string) => void;
  /** #coNote */
  note: string;
  setNote: (v: string) => void;
  /** The legacy payMethod variable, 'Cash on Delivery' at first. */
  payMethod: string;
  setPayMethod: (v: string) => void;
  /** detectZone() over the current district and address. */
  zone: DeliveryZone | null;
}

const CheckoutContext = createContext<CheckoutContextValue | null>(null);

export default function CheckoutProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [addr, setAddr] = useState('');
  const [city, setCity] = useState('');
  const [note, setNote] = useState('');
  const [payMethod, setPayMethod] = useState('Cash on Delivery');

  const value = useMemo<CheckoutContextValue>(() => {
    return {
      name,
      setName,
      phone,
      setPhone,
      email,
      setEmail,
      addr,
      setAddr,
      city,
      setCity,
      note,
      setNote,
      payMethod,
      setPayMethod,
      zone: detectZone(city, addr),
    };
  }, [name, phone, email, addr, city, note, payMethod]);

  return <CheckoutContext.Provider value={value}>{children}</CheckoutContext.Provider>;
}

export function useCheckout(): CheckoutContextValue {
  const ctx = useContext(CheckoutContext);
  if (!ctx) throw new Error('useCheckout must be used inside CheckoutProvider');
  return ctx;
}
