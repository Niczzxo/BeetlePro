'use client';

/* Site footer, synced with the live site's footer redesign: one
   always-dark footer at every width (the rules live in
   src/styles/footer.css, imported after legacy.css, mirroring
   the live file where the same block is appended after the
   legacy stylesheet). Desktop shows six columns (Brand, Shop,
   Company, Help & Support, My Account, Newsletter) with the
   trust items under the newsletter form; tablet tightens the
   columns and moves the trust items to a full width row; mobile
   centres the brand and newsletter and turns the four link
   columns into one-open-at-a-time accordions.
   Behaviour mapping from the live script:
   - Accordion buttons (rendered only on phones by CSS) toggle
     their column's .open class; opening one closes the others,
     and aria-expanded follows. Here that is React state.
   - The Shop column is rendered from the category data exactly
     as the legacy script renders #footShop, routed by
     NavSystem's [data-cat] delegation. Company, Help and
     Account links keep the live data-nav and data-help mapping.
   - Wishlist mirrors the live #footWish: it runs the header
     wishlist button's own behaviour (empty toast, otherwise
     the shop in wishlist mode). Shopping Bag keeps #footBag
     and opens the bag drawer.
   - Newsletter: there is no backend, so, exactly as the live
     site, a subscription is stored locally under the
     dostelo-newsletter localStorage key. The submit validates
     the address, answers a duplicate with the live message,
     shows the live loading spinner state for the same 650ms
     window, then reveals #newsNote and toasts "Subscribed -
     welcome to DOSTELO".
   - Social links: TikTok is the real link, as on the live
     site; Instagram and Facebook keep their data-social
     attributes and NavSystem answers them with the legacy
     toast, the anchors' own click handler preventing the dead
     "#" navigation, as the legacy delegation did.
   - The copyright year is set from the current date, as the
     live #footYear script does (2026 is the static fallback
     the live markup ships). */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { categories } from '../../data/products';
import { useCart } from '../../features/cart/CartProvider';
import { useWishlist } from '../../features/wishlist/WishlistProvider';
import { useToast } from '../../features/toast/Toast';

const PAY_LOGOS = [
  { img: '/images/pay-bkash.png', alt: 'bKash' },
  { img: '/images/pay-nagad.png', alt: 'Nagad' },
  { img: '/images/pay-rocket.png', alt: 'Rocket' },
  { img: '/images/pay-upay.png', alt: 'Upay' },
  { img: '/images/pay-visa.png', alt: 'Visa' },
  { img: '/images/pay-mastercard.png', alt: 'Mastercard' },
];

const TRUST = [
  {
    label: 'Fast Delivery',
    sub: 'All over Bangladesh',
    icon: (
      <>
        <path d="M2.5 16V6.5A1 1 0 0 1 3.5 5.5h9a1 1 0 0 1 1 1V16h-11Z" />
        <path d="M13.5 10h3.8a1 1 0 0 1 .8.4l2.6 3.4a1 1 0 0 1 .2.6V16h-7.4" />
        <circle cx="6.8" cy="17.8" r="1.9" />
        <circle cx="16.8" cy="17.8" r="1.9" />
      </>
    ),
  },
  {
    label: 'Secure Payment',
    sub: '100% Safe & Trusted',
    icon: (
      <>
        <path d="M12 3l7 2.8v5.4c0 4.6-2.9 8.1-7 9.8-4.1-1.7-7-5.2-7-9.8V5.8Z" />
        <path d="m9 11.6 2.1 2.1 3.9-4.2" />
      </>
    ),
  },
  {
    label: 'Easy Returns',
    sub: '7 Days Return',
    icon: (
      <>
        <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5" />
        <path d="M3.5 3.5v5h5" />
      </>
    ),
  },
  {
    label: 'Genuine Products',
    sub: 'Quality Guaranteed',
    icon: (
      <>
        <circle cx="12" cy="9.5" r="5.5" />
        <path d="m9.3 9.5 1.9 1.9 3.5-3.9" />
        <path d="M8.8 14.2 7 20.5l5-2.3 5 2.3-1.8-6.3" />
      </>
    ),
  },
];

/* The live mini row (desktop, under the newsletter form) breaks
   each label over two lines. */
const TRUST_MINI_LABELS: Record<string, [string, string]> = {
  'Fast Delivery': ['Fast', 'Delivery'],
  'Secure Payment': ['Secure', 'Payment'],
  'Easy Returns': ['Easy', 'Returns'],
  'Genuine Products': ['Genuine', 'Products'],
};

function Chevron() {
  return (
    <svg className="icon fchev" viewBox="0 0 24 24">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export default function Footer() {
  const { openBag } = useCart();
  const { ids: wishIds } = useWishlist();
  const { toast } = useToast();
  const router = useRouter();

  const [openCol, setOpenCol] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [note, setNote] = useState<{ msg: string; err: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState(2026);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setYear(new Date().getFullYear());
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  /* The live .facc-btn handler: tapping the open column closes
     it, tapping another closes the rest and opens that one. */
  function toggleCol(key: string) {
    setOpenCol((cur) => (cur === key ? null : key));
  }

  /* The live #footWish: it clicks the header wishlist button, so
     the footer follows the header's own behaviour exactly. */
  function onFootWish() {
    if (!wishIds.length) {
      toast('Your wishlist is empty - tap a heart to save a piece');
      return;
    }
    router.push('/shop?wish=1');
  }

  /* The live #newsForm handler, step for step. */
  function onSubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      setNote({ msg: 'Please enter a valid email address.', err: true });
      inputRef.current?.focus();
      return;
    }
    let subs: string[] = [];
    try {
      subs = JSON.parse(localStorage.getItem('dostelo-newsletter') || '[]');
    } catch {
      subs = [];
    }
    if (subs.indexOf(value) >= 0) {
      setNote({ msg: 'This email is already subscribed. You are on the list.', err: true });
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(() => {
      subs.push(value);
      try {
        localStorage.setItem('dostelo-newsletter', JSON.stringify(subs));
      } catch {
        /* storage unavailable: the live handler ignores it too */
      }
      setLoading(false);
      setEmail('');
      setNote({
        msg: 'Welcome aboard - your first order gets free delivery, anywhere in Bangladesh.',
        err: false,
      });
      toast('Subscribed - welcome to DOSTELO');
    }, 650);
  }

  function colClass(key: string, first = false) {
    return 'fcol' + (first ? ' fcol-first' : '') + (openCol === key ? ' open' : '');
  }

  return (
    <footer>
      <div className="wrap">
        <div className="fgrid">
          <div className="fbrand">
            <a className="logo" href="#" data-nav="home" aria-label="DOSTELO - home">
              <img className="logo-img" src="/images/logo-dark.png" alt="DOSTELO" loading="lazy" decoding="async" />
            </a>
            <p className="ftag">Wear Your Style, The Dostelo Way.</p>
            <p className="fdesc">Boys’ clothing made to be worn, honest fabrics, fair taka prices, delivered across Bangladesh.</p>
            <div className="socials">
              <a href="#" aria-label="Instagram" data-social="Instagram" onClick={(e) => e.preventDefault()}>
                <svg className="icon" viewBox="0 0 24 24">
                  <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.2" cy="6.8" r=".8" fill="currentColor" />
                </svg>
              </a>
              <a href="#" aria-label="Facebook" data-social="Facebook" onClick={(e) => e.preventDefault()}>
                <svg className="icon" viewBox="0 0 24 24">
                  <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                </svg>
              </a>
              <a href="https://www.tiktok.com/@dostelo" target="_blank" rel="noopener" aria-label="TikTok">
                <svg className="icon fill" viewBox="0 0 24 24">
                  <path d="M16.7 3c.4 2.2 1.9 3.8 4.1 4.1v3c-1.6 0-3-.5-4.1-1.3v6.4c0 3.9-2.7 6.4-6.2 6.4A6.3 6.3 0 0 1 4.2 15c0-3.6 3-6.3 6.7-6.2v3.2c-1.9-.5-3.6.8-3.6 2.8 0 1.7 1.3 3 3.1 3 1.9 0 3.3-1.4 3.3-3.5V3h3Z" />
                </svg>
              </a>
            </div>
          </div>

          <div className={colClass('shop', true)}>
            <h4>Shop</h4>
            <button className="facc-btn" type="button" aria-expanded={openCol === 'shop'} onClick={() => toggleCol('shop')}>
              <svg className="icon" viewBox="0 0 24 24">
                <path d="M4.3 7.4 6 4.1h12l1.7 3.3" />
                <path d="M4.3 7.4h15.4V19a2 2 0 0 1-2 2H6.3a2 2 0 0 1-2-2V7.4Z" />
                <path d="M9.2 10.3a2.8 2.8 0 0 0 5.6 0" />
              </svg>
              Shop
              <Chevron />
            </button>
            <div className="facc-body">
              <ul id="footShop">
                {categories.map((c) => (
                  <li key={c.name}>
                    <button data-cat={c.name}>{c.name}</button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className={colClass('company')}>
            <h4>Company</h4>
            <button className="facc-btn" type="button" aria-expanded={openCol === 'company'} onClick={() => toggleCol('company')}>
              <svg className="icon" viewBox="0 0 24 24">
                <rect x="5" y="3.5" width="14" height="17" rx="1.5" />
                <path d="M9.5 20.5v-3.5h5v3.5" />
                <path d="M9 7.5h2M13 7.5h2M9 11h2M13 11h2" />
              </svg>
              Company
              <Chevron />
            </button>
            <div className="facc-body">
              <ul>
                <li><button data-nav="about">About</button></li>
                <li><button data-nav="about">Atelier</button></li>
                <li><button data-nav="collections">Collections</button></li>
                <li><button data-nav="journal">Journal</button></li>
                <li><button data-nav="contact">Contact</button></li>
              </ul>
            </div>
          </div>

          <div className={colClass('help')}>
            <h4>Help &amp; Support</h4>
            <button className="facc-btn" type="button" aria-expanded={openCol === 'help'} onClick={() => toggleCol('help')}>
              <svg className="icon" viewBox="0 0 24 24">
                <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
                <rect x="3" y="14.5" width="4" height="6" rx="2" />
                <rect x="17" y="14.5" width="4" height="6" rx="2" />
              </svg>
              Help &amp; Support
              <Chevron />
            </button>
            <div className="facc-body">
              <ul>
                <li><button data-help="delivery">Delivery &amp; Returns</button></li>
                <li><button data-help="faq">FAQ</button></li>
                <li><button data-help="orders">Order Tracking</button></li>
                <li><button data-nav="contact">Contact Support</button></li>
              </ul>
            </div>
          </div>

          <div className={colClass('account')}>
            <h4>My Account</h4>
            <button className="facc-btn" type="button" aria-expanded={openCol === 'account'} onClick={() => toggleCol('account')}>
              <svg className="icon" viewBox="0 0 24 24">
                <circle cx="12" cy="7.6" r="3.4" />
                <path d="M5.3 20.1v-2.4a3.6 3.6 0 0 1 3.6-3.6h6.2a3.6 3.6 0 0 1 3.6 3.6v2.4" />
              </svg>
              My Account
              <Chevron />
            </button>
            <div className="facc-body">
              <ul>
                <li><button data-nav="account">Login / Register</button></li>
                <li><button data-nav="account">My Profile</button></li>
                <li><button data-nav="account">My Orders</button></li>
                <li><button id="footWish" onClick={onFootWish}>Wishlist</button></li>
                <li><button id="footBag" onClick={openBag}>Shopping Bag</button></li>
              </ul>
            </div>
          </div>

          <div className="fnews">
            <div className="fnl-head">
              <svg className="icon" viewBox="0 0 24 24">
                <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
                <path d="m3.5 7.5 8.5 6 8.5-6" />
              </svg>
              <h4>Stay in Style.</h4>
            </div>
            <p className="fnl-text">Get new collections, offers and updates.</p>
            <form className="news" id="newsForm" noValidate onSubmit={onSubscribe}>
              <input
                ref={inputRef}
                type="email"
                placeholder="Email address"
                aria-label="Email address"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button type="submit" aria-label="Subscribe" disabled={loading} className={loading ? 'loading' : undefined}>
                <svg className="icon" viewBox="0 0 24 24">
                  <path d="M22 2 11 13" />
                  <path d="M22 2 15 22l-4-9-9-4Z" />
                </svg>
              </button>
            </form>
            <div className={'formnote' + (note && note.err ? ' err' : '')} id="newsNote" hidden={note === null} aria-live="polite">
              {note ? note.msg : ''}
            </div>
            <div className="ftrust-mini" aria-label="Why shop with DOSTELO">
              {TRUST.map((t) => (
                <div className="ft-item" key={t.label}>
                  <svg className="icon" viewBox="0 0 24 24">{t.icon}</svg>
                  <span className="ft-l">
                    {TRUST_MINI_LABELS[t.label][0]}
                    <br />
                    {TRUST_MINI_LABELS[t.label][1]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="ftrust-row" aria-label="Why shop with DOSTELO">
          {TRUST.map((t) => (
            <div className="ft-item" key={t.label}>
              <svg className="icon" viewBox="0 0 24 24">{t.icon}</svg>
              <span className="ft-tx">
                <span className="ft-l">{t.label}</span>
                <span className="ft-s">{t.sub}</span>
              </span>
            </div>
          ))}
        </div>

        <div className="fbot">
          <span>
            © <span id="footYear">{year}</span> DOSTELO. All rights reserved.
          </span>
          <div className="pay paylogos" aria-label="Accepted payments">
            {PAY_LOGOS.map((p) => (
              <span className="plogo" key={p.alt}>
                <img loading="lazy" decoding="async" src={p.img} alt={p.alt} />
              </span>
            ))}
            <span className="plogo cod">COD</span>
          </div>
          <div className="links">
            <button data-help="privacy">Privacy Policy</button>
            <span className="fsep" aria-hidden="true">|</span>
            <button data-help="terms">Terms &amp; Conditions</button>
            <span className="fsep" aria-hidden="true">|</span>
            <button data-nav="contact">Contact Us</button>
          </div>
        </div>
      </div>
    </footer>
  );
}
