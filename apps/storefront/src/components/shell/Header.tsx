'use client';

/* Site header, ported from the legacy markup with the same DOM
   structure, ids and class names. Behaviour now ported: the
   burger opens the mobile sidebar (MenuSidebar, synced from
   the live site fix: it slides in from the left over its own
   backdrop, and its nav taps close it again), the topbar gains .scrolled
   after 10px of scroll, the nav highlights the current view the
   way the legacy go() did (the product view marks Shop), the bag
   count is the live bag total, and the search is the legacy
   search: a live dropdown of up to five pieces matching name or
   category, an empty state, Enter opening the shop with the
   query, and a click anywhere outside closing the dropdown.
   Routing itself runs through NavSystem's delegation, as the
   legacy routed through its own document listener. The bag
   button opens the bag drawer, and the wishlist button follows
   the legacy: an empty wishlist answers with the legacy toast,
   otherwise it opens the shop in its wishlist view (the shop
   route's ?wish=1 mode) with the saved pieces under the "Your
   wishlist" title. */

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import ThemeToggle from './ThemeToggle';
import { useMenu } from '../../features/menu/Menu';
import { useCart } from '../../features/cart/CartProvider';
import { useWishlist } from '../../features/wishlist/WishlistProvider';
import { useToast } from '../../features/toast/Toast';
import { products } from '../../data/products';
import { money } from '../../lib/format';

const NAV = ['home', 'shop', 'collections', 'journal', 'about', 'contact'] as const;
const NAV_LABELS: Record<(typeof NAV)[number], string> = {
  home: 'Home',
  shop: 'Shop',
  collections: 'Collections',
  journal: 'Journal',
  about: 'About',
  contact: 'Contact',
};

export default function Header() {
  const headerRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { menuOpen, openMenu } = useMenu();
  const { count, openBag } = useCart();
  const { count: wishCount, ids: wishIds } = useWishlist();
  const { toast } = useToast();

  /* The legacy #wishBtn handler: an empty wishlist answers with
     a toast; otherwise the shop opens showing the saved pieces
     as "Your wishlist" with the filters hidden (the shop view's
     wishlist mode, ?wish=1). */
  function onWishBtn() {
    if (!wishIds.length) {
      toast('Your wishlist is empty - tap a heart to save a piece');
      return;
    }
    router.push('/shop?wish=1');
  }

  /* The legacy go() nav highlight: the product view counts as
     Shop, the article view as Journal; the help views, account
     and checkout match no nav button, as in the legacy. */
  const activeNav =
    pathname === '/'
      ? 'home'
      : pathname === '/shop' || (pathname && pathname.startsWith('/product/'))
        ? 'shop'
        : pathname === '/collections'
          ? 'collections'
          : pathname && pathname.startsWith('/journal')
            ? 'journal'
            : pathname === '/about'
              ? 'about'
              : pathname === '/contact'
                ? 'contact'
                : null;

  const [query, setQuery] = useState('');
  const [dropOpen, setDropOpen] = useState(false);
  const q = query.trim();
  const hits = q
    ? products
        .filter((p) => (p.name + ' ' + p.cat).toLowerCase().indexOf(q.toLowerCase()) >= 0)
        .slice(0, 5)
    : [];

  useEffect(() => {
    const onScroll = () => {
      headerRef.current?.classList.toggle('scrolled', window.scrollY > 10);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* Legacy: a click outside the search field and the dropdown
     closes the dropdown. */
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Element | null;
      if (!t || typeof t.closest !== 'function') return;
      if (!t.closest('.hsearch') && !t.closest('#searchDrop')) setDropOpen(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  return (
    <header id="topbar" ref={headerRef}>
      <div className="wrap hbar">
        <button
          className="hbtn burger"
          id="burger"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls="sidenav"
          onClick={openMenu}
        >
          <svg className="icon" viewBox="0 0 24 24">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <a className="logo" href="#" data-nav="home" aria-label="DOSTELO - home">
          <img className="logo-img logo-light" src="/images/logo-light.png" alt="DOSTELO" />
          <img className="logo-img logo-dark" src="/images/logo-dark.png" alt="" aria-hidden="true" />
        </a>
        <nav className="main" id="mainnav">
          {NAV.map((key) => (
            <button key={key} data-nav={key} className={key === activeNav ? 'on' : undefined}>
              {NAV_LABELS[key]}
            </button>
          ))}
        </nav>
        <label className="hsearch">
          <svg className="icon" viewBox="0 0 24 24" style={{ width: 17, height: 17 }}>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.8-3.8" />
          </svg>
          <input
            id="searchInput"
            type="search"
            placeholder="Search shirts, tees, jeans…"
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setDropOpen(e.target.value.trim() !== '');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                setDropOpen(false);
                router.push('/shop?q=' + encodeURIComponent(q));
              }
            }}
          />
        </label>
        <div className="hicons">
          <ThemeToggle />
          <button className="hbtn" id="wishBtn" aria-label="Wishlist" onClick={onWishBtn}>
            <svg className="icon" viewBox="0 0 24 24">
              <path d="M12 20.4C7.3 16.8 4.1 13.7 4.1 10.2 4.1 7.6 6 5.6 8.4 5.6c1.5 0 2.9.8 3.6 2 .7-1.2 2.1-2 3.6-2 2.4 0 4.3 2 4.3 4.6 0 3.5-3.2 6.6-7.9 10.2Z" />
            </svg>
            <span className="count" id="wishCount" hidden={wishCount === 0}>
              {wishCount}
            </span>
          </button>
          <button className="hbtn" id="bagBtn" aria-label="Open bag" onClick={openBag}>
            <svg className="icon" viewBox="0 0 24 24">
              <path d="M4.3 7.4 6 4.1h12l1.7 3.3" />
              <path d="M4.3 7.4h15.4V19a2 2 0 0 1-2 2H6.3a2 2 0 0 1-2-2V7.4Z" />
              <path d="M9.2 10.3a2.8 2.8 0 0 0 5.6 0" />
            </svg>
            <span className="count" id="bagCount" hidden={count === 0}>
              {count}
            </span>
          </button>
          <button className="hbtn" data-nav="account" aria-label="Your account">
            <svg className="icon" viewBox="0 0 24 24">
              <circle cx="12" cy="7.6" r="3.4" />
              <path d="M5.3 20.1v-2.4a3.6 3.6 0 0 1 3.6-3.6h6.2a3.6 3.6 0 0 1 3.6 3.6v2.4" />
            </svg>
          </button>
        </div>
      </div>
      <div
        className="searchdrop"
        id="searchDrop"
        hidden={!dropOpen || !q}
        onClick={() => setDropOpen(false)}
      >
        {q
          ? hits.length
            ? hits.map((p) => (
                <button className="sd-item" data-product={p.id} key={p.id}>
                  <img src={p.img} alt="" />
                  <span>
                    <b>{p.name}</b>
                    <span>
                      {p.cat} {'·'} {money(p.price)}
                    </span>
                  </span>
                </button>
              ))
            : <div className="sd-none">No pieces match {'\u201C'}{q}{'\u201D'} yet.</div>
          : null}
      </div>
    </header>
  );
}
