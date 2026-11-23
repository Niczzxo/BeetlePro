'use client';

/* Site footer, ported from the legacy markup with the same DOM
   structure and class names, including the payment logo chip row.
   The Shop column is rendered from the category data exactly as the
   legacy script renders #footShop. The newsletter submit is the
   legacy handler: prevent the submit, reveal #newsNote and toast
   "Subscribed - welcome to DOSTELO". Social links keep their
   data-social attributes; NavSystem's delegation answers them
   with the legacy toast, and the anchors' own click handler
   prevents the dead "#" navigation, as the legacy delegation
   did. The Help column and Privacy/Terms buttons keep their
   data-help attributes and open the help modal through the
   same delegation. */

import { useState } from 'react';
import { categories } from '../../data/products';
import { useCart } from '../../features/cart/CartProvider';
import { useToast } from '../../features/toast/Toast';

const PAY_LOGOS = [
  { img: '/images/pay-bkash.png', alt: 'bKash' },
  { img: '/images/pay-nagad.png', alt: 'Nagad' },
  { img: '/images/pay-rocket.png', alt: 'Rocket' },
  { img: '/images/pay-upay.png', alt: 'Upay' },
  { img: '/images/pay-visa.png', alt: 'Visa' },
  { img: '/images/pay-mastercard.png', alt: 'Mastercard' },
];

export default function Footer() {
  const { openBag } = useCart();
  const { toast } = useToast();
  const [subscribed, setSubscribed] = useState(false);

  return (
    <footer>
      <div className="wrap">
        <div className="fgrid">
          <div>
            <a className="logo" href="#" data-nav="home" aria-label="DOSTELO - home">
              <img className="logo-img" src="/images/logo-dark.png" alt="DOSTELO" loading="lazy" decoding="async" />
            </a>
            <p>Boys’ clothing made to be worn - honest fabrics, fair taka prices, delivered across Bangladesh.</p>
            <div className="socials">
              <a href="#" aria-label="Instagram" data-social="Instagram" onClick={(e) => e.preventDefault()}>
                <svg className="icon" viewBox="0 0 24 24">
                  <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.2" cy="6.8" r=".8" fill="currentColor" />
                </svg>
              </a>
              <a href="#" aria-label="Pinterest" data-social="Pinterest" onClick={(e) => e.preventDefault()}>
                <svg className="icon" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7.5c-2.5 0-4 1.7-4 3.6 0 1.2.6 2.1 1.7 2.4l.5-1.2c-.3-.2-.5-.6-.5-1.1 0-1.2 1-2.2 2.4-2.2 1.3 0 2.2.8 2.2 1.9 0 1.4-.6 2.6-1.5 2.6-.5 0-.9-.4-.8-1l.4-1.5M10.5 21l1.2-4.8" />
                </svg>
              </a>
              <a href="#" aria-label="TikTok" data-social="TikTok" onClick={(e) => e.preventDefault()}>
                <svg className="icon fill" viewBox="0 0 24 24">
                  <path d="M16.7 3c.4 2.2 1.9 3.8 4.1 4.1v3c-1.6 0-3-.5-4.1-1.3v6.4c0 3.9-2.7 6.4-6.2 6.4A6.3 6.3 0 0 1 4.2 15c0-3.6 3-6.3 6.7-6.2v3.2c-1.9-.5-3.6.8-3.6 2.8 0 1.7 1.3 3 3.1 3 1.9 0 3.3-1.4 3.3-3.5V3h3Z" />
                </svg>
              </a>
            </div>
            <div style={{ fontWeight: 600, color: 'var(--on-dark)', marginBottom: 12, fontSize: 15 }}>
              Join the newsletter
            </div>
            <form
              className="news"
              id="newsForm"
              onSubmit={(e) => {
                e.preventDefault();
                setSubscribed(true);
                toast('Subscribed - welcome to DOSTELO');
              }}
            >
              <input type="email" required placeholder="Email address" aria-label="Email address" />
              <button type="submit">
                Subscribe{' '}
                <svg className="icon" viewBox="0 0 24 24" style={{ width: 15, height: 15, verticalAlign: -2 }}>
                  <path d="M4.5 12h15" />
                  <path d="m13.5 6 6 6-6 6" />
                </svg>
              </button>
            </form>
            <div
              className="formnote"
              id="newsNote"
              hidden={!subscribed}
              style={{ background: 'var(--dark2)', color: 'var(--on-dark)', marginTop: 12 }}
            >
              Welcome aboard - your first order gets free delivery, anywhere in Bangladesh.
            </div>
          </div>
          <div>
            <h4>Shop</h4>
            <ul id="footShop">
              {categories.map((c) => (
                <li key={c.name}>
                  <button data-cat={c.name}>{c.name}</button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Company</h4>
            <ul>
              <li><button data-nav="about">About</button></li>
              <li><button data-nav="about">Atelier</button></li>
              <li><button data-nav="collections">Collections</button></li>
              <li><button data-nav="journal">Journal</button></li>
              <li><button data-nav="contact">Contact</button></li>
            </ul>
          </div>
          <div>
            <h4>Help</h4>
            <ul>
              <li><button data-help="delivery">Delivery &amp; returns</button></li>
              <li><button data-help="faq">FAQ</button></li>
              <li><button data-help="orders">Your orders</button></li>
              <li><button id="footBag" onClick={openBag}>Bag</button></li>
              <li><button data-help="checkout">Checkout</button></li>
            </ul>
          </div>
        </div>
        <div className="fbot">
          <span>© 2026 DOSTELO. All rights reserved.</span>
          <div className="pay paylogos" aria-label="Accepted payments">
            {PAY_LOGOS.map((p) => (
              <span className="plogo" key={p.alt}>
                <img loading="lazy" decoding="async" src={p.img} alt={p.alt} />
              </span>
            ))}
            <span className="plogo cod">COD</span>
          </div>
          <div className="links">
            <button data-help="privacy">Privacy</button>
            <button data-help="terms">Terms</button>
          </div>
        </div>
      </div>
    </footer>
  );
}
