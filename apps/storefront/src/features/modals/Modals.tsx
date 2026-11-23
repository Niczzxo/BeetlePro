'use client';

/* The legacy modal system: #welcomeModal and #helpModal, their
   shared behaviour, and the HELP content table.

   Welcome: the legacy keeps an in-memory `welcomed` flag and a
   single 1400ms timer from page load; when it fires, the modal
   and the shared scrim gain .on. Nothing is stored, so a fresh
   page load shows it again and it can never reappear within
   one load. The port keeps the same shape: a module-level flag
   and one timer mounted with the shell. #welcomeClose runs the
   legacy closeAll(); #welcomeShop runs closeAll() then goes to
   the shop.

   Help: openHelp(key) fills #helpTitle and #helpBody from the
   HELP table and opens the modal; an unknown key does nothing,
   as in the legacy. #helpClose runs closeAll(). Every
   [data-help] button in the migrated markup (footer Help
   column, Privacy and Terms, the account page's Your orders)
   reaches openHelp through NavSystem's delegation, exactly as
   the legacy document listener routed them.

   The scrim is the single shared #scrim rendered by the bag
   drawer: its .on state and click follow the legacy closeAll()
   semantics (drawer and modals together), so the drawer reads
   this context for the modal half. Escape likewise runs the
   modal half of closeAll() from here; the drawer half has its
   own handler in BagDrawer. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';

/* The legacy HELP table, verbatim. */
export const HELP: Record<string, { t: string; b: string }> = {
  delivery: {
    t: 'Delivery & returns',
    b: '<p><b>Inside Dhaka:</b> 1-2 working days. <b>Nationwide:</b> 2-4 working days, to your doorstep anywhere in Bangladesh.</p><p>Delivery is <b>৳70 in Dhaka city</b>, <b>৳100 in Dhaka sub city</b> and <b>৳150 outside Dhaka</b>, worked out automatically from your delivery address at checkout. Cash on Delivery adds ৳10. Your first order gets free delivery; after that the three-zone rates apply. Cash on Delivery is available everywhere; you can also pay in advance with bKash, Nagad, Rocket, Upay or card.</p><p>Changed your mind, or the size is off? Returns and size exchanges are free within 7 days - we arrange the pickup, and refunds land within 3 working days of the piece reaching us.</p>',
  },
  faq: {
    t: 'FAQ',
    b: '<p><b>How do I pay?</b> Cash on Delivery, bKash, Nagad, Rocket, Upay, or debit/credit card - whatever suits you.</p><p><b>What if the size is wrong?</b> Size exchanges are free within 7 days. Keep the tags on until the fit is right.</p><p><b>How long does delivery take?</b> Dhaka 1-2 working days; nationwide 2-4 working days. Delivery ৳70 in Dhaka city, ৳100 in Dhaka sub city, ৳150 outside Dhaka - set automatically from your address at checkout. COD adds ৳10; your first order gets free delivery.</p><p><b>Do I need an account to order?</b> Yes - ordering needs a free DOSTELO account; sign in or create one at checkout and your bag will be waiting.</p><p><b>Do I get free delivery on my first order?</b> Yes - the first order on your account gets free delivery at checkout, with no code needed. From your second order onward the normal zone rates apply.</p><p><b>How do I find the right size?</b> See the size guide in our Journal - or message us the height and age and we will recommend a size.</p>',
  },
  orders: {
    t: 'Your orders',
    b: '<p>When you place an order you get an order number on screen and a confirmation by phone/email. Keep the order number - it is all we need to find, track or exchange your order.</p><p>Need to change a size, address or delivery time? Message us with your order number as soon as you can and we will sort it before dispatch.</p>',
  },
  checkout: {
    t: 'Checkout',
    b: '<p>Ordering needs a free DOSTELO account - sign in or create one first, then checkout takes your name, mobile number and delivery address, and lets you choose how to pay: Cash on Delivery, bKash, Nagad, Rocket, Upay or card. Your bag waits for you while you sign in, and your orders stay under your account, so your first order gets free delivery and we recognise you when you come back.</p><p>For mobile banking you will see the payment number at confirmation - send the amount and use your order number as the reference. Nothing is dispatched until COD is confirmed by phone or the mobile payment lands.</p>',
  },
  privacy: {
    t: 'Privacy',
    b: '<p>We collect only what an order needs: your name, mobile number, address and order history. We never sell personal data, and marketing messages are sent only to newsletter subscribers, who can unsubscribe in one click.</p>',
  },
  terms: {
    t: 'Terms',
    b: '<p>All prices are in Bangladeshi taka (BDT) and include VAT where applicable. Delivery is ৳70 in Dhaka city, ৳100 in Dhaka sub city and ৳150 outside Dhaka, calculated automatically from the delivery address at checkout; Cash on Delivery adds ৳10. Your first order gets free delivery; after that the three-zone rates apply. Every piece can be exchanged for size free within 7 days and returned within 7 days in original condition with tags. Natural fabrics vary slightly in tone - that is part of the material, not a defect.</p>',
  },
};

interface ModalContextValue {
  openHelp: (key: string) => void;
  closeModals: () => void;
  modalOpen: boolean;
}

const ModalContext = createContext<ModalContextValue | null>(null);

/* The legacy `welcomed` flag: module scope, so it lives for
   exactly one page load, as the legacy variable did. */
let welcomed = false;

function CloseIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export default function ModalProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [welcomeOn, setWelcomeOn] = useState(false);
  const [helpKey, setHelpKey] = useState<string | null>(null);

  const help = helpKey ? HELP[helpKey] : undefined;
  const modalOpen = welcomeOn || !!help;

  const closeModals = useCallback(() => {
    setWelcomeOn(false);
    setHelpKey(null);
  }, []);

  const openHelp = useCallback((key: string) => {
    if (!HELP[key]) return;
    setHelpKey(key);
  }, []);

  /* The legacy welcome timer: 1400ms after load, once. */
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!welcomed) {
        welcomed = true;
        setWelcomeOn(true);
      }
    }, 1400);
    return () => window.clearTimeout(t);
  }, []);

  /* The legacy document keydown: Escape runs closeAll(); this
     is its modal half (the drawer half lives in BagDrawer). */
  useEffect(() => {
    if (!modalOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeModals();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modalOpen, closeModals]);

  return (
    <ModalContext.Provider value={{ openHelp, closeModals, modalOpen }}>
      {children}

      <div
        className={'modal' + (welcomeOn ? ' on' : '')}
        id="welcomeModal"
        role="dialog"
        aria-label="Welcome offer"
      >
        <div className="box">
          <img
            src="/images/offer-up-to-30-off-shirts.jpg"
            alt="Rail of new-season boys shirts and t-shirts"
          />
          <div className="mc">
            <button className="x" id="welcomeClose" aria-label="Close offer" onClick={closeModals}>
              <CloseIcon />
            </button>
            <small>Welcome to DOSTELO</small>
            <h3>Free delivery on your first order</h3>
            <p>
              Every new customer gets free delivery on their first order at checkout - no code
              needed, wherever you found us. Plus early access to new collections and sample sales.
            </p>
            <div className="codetag">
              <b style={{ letterSpacing: '.04em', fontSize: 14 }}>FIRST ORDER · FREE DELIVERY</b>
            </div>
            <button
              className="btn block"
              id="welcomeShop"
              onClick={() => {
                closeModals();
                router.push('/shop');
              }}
            >
              Shop new arrivals
            </button>
          </div>
        </div>
      </div>

      <div
        className={'modal' + (help ? ' on' : '')}
        id="helpModal"
        role="dialog"
        aria-label="Help"
      >
        <div className="box" style={{ gridTemplateColumns: '1fr', maxWidth: 560 }}>
          <div className="mc">
            <button className="x" id="helpClose" aria-label="Close" onClick={closeModals}>
              <CloseIcon />
            </button>
            <h3 id="helpTitle" style={{ fontSize: 26 }}>
              {help ? help.t : ''}
            </h3>
            <div
              id="helpBody"
              style={{ fontSize: 15, lineHeight: 1.65 }}
              dangerouslySetInnerHTML={{ __html: help ? help.b : '' }}
            />
          </div>
        </div>
      </div>
    </ModalContext.Provider>
  );
}

export function useModals(): ModalContextValue {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModals must be used inside ModalProvider');
  return ctx;
}
