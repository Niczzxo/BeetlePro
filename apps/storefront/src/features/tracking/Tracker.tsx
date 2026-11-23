'use client';

/**
 * Storefront tracker (Phase 5, architecture addition). Mounted
 * once in the root layout inside the cart provider. It renders
 * nothing except the one-time consent notice, and it changes no
 * legacy layout, class or behaviour:
 *
 * - page-view on every route change;
 * - product-view on product pages, with the product id;
 * - search when the shop is opened with a query (the header
 *   search submits by routing to /shop?q=...);
 * - add-to-cart when a bag line's quantity grows, observed from
 *   the cart provider's state, so the cart code itself is
 *   untouched;
 * - checkout-start when the checkout page opens, with the cart
 *   value at that moment.
 *
 * The consent notice uses only the existing design tokens
 * (var(--surface), var(--ink), var(--line), var(--dark),
 * var(--on-dark), var(--r-md), var(--shadow)): no new colours,
 * no new CSS file, nothing in the legacy stylesheet.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { usePathname } from 'next/navigation';
import { useCart } from '../cart/CartProvider';
import {
  getMarketingConsent,
  recordMarketingConsent,
  trackEvent,
  type MarketingConsentChoice,
} from './tracker';

const barStyle: CSSProperties = {
  position: 'fixed',
  left: 16,
  right: 16,
  bottom: 16,
  maxWidth: 560,
  margin: '0 auto',
  zIndex: 80,
  background: 'var(--surface)',
  color: 'var(--ink)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--r-md)',
  boxShadow: 'var(--shadow)',
  padding: '16px 18px',
};

const acceptStyle: CSSProperties = {
  background: 'var(--dark)',
  color: 'var(--on-dark)',
  border: '1px solid var(--dark)',
  borderRadius: 'var(--r-sm)',
  padding: '8px 16px',
  cursor: 'pointer',
  font: 'inherit',
};

const declineStyle: CSSProperties = {
  background: 'transparent',
  color: 'var(--ink)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--r-sm)',
  padding: '8px 16px',
  cursor: 'pointer',
  font: 'inherit',
};

export default function Tracker() {
  const pathname = usePathname();
  const { lines, count, subtotal } = useCart();
  const [consent, setConsent] = useState<MarketingConsentChoice | null>(null);
  const [answered, setAnswered] = useState(true);
  const previousQuantities = useRef<Map<string, number>>(new Map());
  const cartPrimed = useRef(false);

  /* The consent notice shows once, until answered. Reading the
     stored choice happens after mount so server rendering and
     the first client render agree (both render nothing). */
  useEffect(() => {
    const stored = getMarketingConsent();
    setConsent(stored);
    setAnswered(stored !== null);
  }, []);

  /* Route-driven events. Fires on route changes only; the cart
     figures for checkout-start are the ones in place when the
     checkout page opens. */
  useEffect(() => {
    if (!pathname) return;
    trackEvent('page-view', undefined, pathname);
    if (pathname.startsWith('/product/')) {
      const id = pathname.split('/')[2];
      if (id) {
        trackEvent(
          'product-view',
          { productId: decodeURIComponent(id) },
          pathname,
        );
      }
    }
    if (pathname === '/shop') {
      const query = new URLSearchParams(window.location.search).get('q');
      if (query) trackEvent('search', { query }, pathname);
    }
    if (pathname === '/checkout') {
      trackEvent(
        'checkout-start',
        { cartValueMinor: subtotal * 100, cartItemCount: count },
        pathname,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  /* Add-to-cart, observed from cart state: any line whose
     quantity grew since the last render is an add. The first
     observation only primes the snapshot, so a restored or
     initial bag never fires false events. */
  useEffect(() => {
    const previous = previousQuantities.current;
    if (cartPrimed.current) {
      for (const line of lines) {
        if (line.qty > (previous.get(line.key) ?? 0)) {
          trackEvent('add-to-cart', {
            productId: line.product.id,
            cartValueMinor: subtotal * 100,
            cartItemCount: count,
          });
        }
      }
    }
    cartPrimed.current = true;
    previousQuantities.current = new Map(
      lines.map((line) => [line.key, line.qty]),
    );
  }, [lines, count, subtotal]);

  function answer(status: MarketingConsentChoice): void {
    recordMarketingConsent(status);
    setConsent(status);
    setAnswered(true);
  }

  if (answered || consent !== null) return null;

  return (
    <div style={barStyle} role="region" aria-label="Cookie consent">
      <p style={{ margin: '0 0 6px', fontWeight: 600 }}>Your privacy</p>
      <p style={{ margin: '0 0 12px', color: 'var(--body)' }}>
        Dostelo records anonymous browsing activity (pages viewed,
        products seen, searches and bag activity) under a random
        id to understand what shoppers look for. It is never used
        to identify you. You can decline marketing use of this
        activity; the store works the same either way.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={acceptStyle} onClick={() => answer('granted')}>
          Accept marketing use
        </button>
        <button
          type="button"
          style={declineStyle}
          onClick={() => answer('denied')}
        >
          Decline
        </button>
      </div>
    </div>
  );
}
