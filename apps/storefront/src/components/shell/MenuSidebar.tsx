'use client';

/* Mobile sidebar menu, synced from the live site fix (the
   legacy #mscrim and #sidenav markup that now ships in the
   single-file store). It renders beside the bag drawer, the
   way the legacy renders it beside #bagDrawer, because the
   sticky header's backdrop filter would trap a fixed panel
   placed inside it.

   Behaviour, mirrored from the live fix: the header burger
   opens the panel from the left over its own backdrop (never
   the bag's shared #scrim); the header row carries the
   DOSTELO logo (the .logo rules in legacy.css pick the light
   or dark lockup per theme, exactly as in the header) and a
   close button; the nav list mirrors the main nav exactly
   (same labels, same order, same data-nav routing through
   NavSystem) and every tap closes the panel; the bottom rows
   are Account (data-nav, routed like the header account
   button) and Wishlist (the header wish button's own action:
   the empty wishlist toast, otherwise the shop in wishlist
   view), each closing the panel first, as the live fix closes
   and then triggers the header buttons. The close button, a
   backdrop click and Escape (in MenuProvider) close it too.
   The panel animates with transform only, the backdrop with
   opacity only, so nothing shifts layout.

   The mobile search fix adds a search field under the header
   row: the header's own field is hidden at 1080px and below,
   so this field feeds the SAME dropdown and the SAME shop
   results flow through the shared search state
   (features/search), and pressing Enter or choosing a result
   closes the panel behind the navigation. */

import { useRouter } from 'next/navigation';
import { useMenu } from '../../features/menu/Menu';
import { useSearch } from '../../features/search/Search';
import { useScrollLock } from '../../features/scrollLock';
import { useWishlist } from '../../features/wishlist/WishlistProvider';
import { useToast } from '../../features/toast/Toast';

/* Same list, labels and order as Header's NAV and NAV_LABELS:
   the legacy keeps the sidebar list as its own copy of the
   main nav, and so does the port. */
const NAV = ['home', 'shop', 'collections', 'journal', 'about', 'contact'] as const;
const NAV_LABELS: Record<(typeof NAV)[number], string> = {
  home: 'Home',
  shop: 'Shop',
  collections: 'Collections',
  journal: 'Journal',
  about: 'About',
  contact: 'Contact',
};

export default function MenuSidebar() {
  const { menuOpen, closeMenu } = useMenu();

  /* The live site's scroll lock, menu flag: the page is locked
     while the sidebar is open. */
  useScrollLock('menu', menuOpen);
  const { ids: wishIds } = useWishlist();
  const { toast } = useToast();
  const router = useRouter();
  const { query, feed, hideDrop } = useSearch();

  /* The live fix's Wishlist row: close the menu, then run the
     header wish button's action (Header's onWishBtn). */
  function onWishlist() {
    closeMenu();
    if (!wishIds.length) {
      toast('Your wishlist is empty - tap a heart to save a piece');
      return;
    }
    router.push('/shop?wish=1');
  }

  return (
    <>
      <div
        className={'mscrim' + (menuOpen ? ' on' : '')}
        id="mscrim"
        onClick={closeMenu}
      ></div>

      <aside
        className={'snav' + (menuOpen ? ' on' : '')}
        id="sidenav"
        aria-hidden={!menuOpen}
        aria-label="Menu"
      >
        <div className="snav-head">
          <span className="logo" aria-label="DOSTELO">
            <img className="logo-img logo-light" src="/images/logo-light.png" alt="DOSTELO" />
            <img className="logo-img logo-dark" src="/images/logo-dark.png" alt="" aria-hidden="true" />
          </span>
          <button className="hbtn" id="snavClose" aria-label="Close menu" onClick={closeMenu}>
            <svg className="icon" viewBox="0 0 24 24">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="snav-search">
          <label className="hsearch">
            <svg className="icon" viewBox="0 0 24 24" style={{ width: 17, height: 17 }}>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.8-3.8" />
            </svg>
            <input
              id="searchInputM"
              type="search"
              placeholder="Search shirts, tees, jeans…"
              autoComplete="off"
              aria-label="Search products"
              value={query}
              onChange={(e) => {
                feed(e.target.value, true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  hideDrop();
                  closeMenu();
                  router.push('/shop?q=' + encodeURIComponent(query.trim()));
                }
              }}
            />
          </label>
        </div>
        <nav className="snav-nav" aria-label="Main">
          {NAV.map((key) => (
            <button key={key} className="snav-link" data-nav={key} onClick={closeMenu}>
              {NAV_LABELS[key]}
            </button>
          ))}
        </nav>
        <div className="snav-foot">
          <button className="snav-link" id="snavAccount" data-nav="account" onClick={closeMenu}>
            <svg className="icon" viewBox="0 0 24 24">
              <circle cx="12" cy="7.6" r="3.4" />
              <path d="M5.3 20.1v-2.4a3.6 3.6 0 0 1 3.6-3.6h6.2a3.6 3.6 0 0 1 3.6 3.6v2.4" />
            </svg>
            Account
          </button>
          <button className="snav-link" id="snavWishlist" onClick={onWishlist}>
            <svg className="icon" viewBox="0 0 24 24">
              <path d="M12 20.4C7.3 16.8 4.1 13.7 4.1 10.2 4.1 7.6 6 5.6 8.4 5.6c1.5 0 2.9.8 3.6 2 .7-1.2 2.1-2 3.6-2 2.4 0 4.3 2 4.3 4.6 0 3.5-3.2 6.6-7.9 10.2Z" />
            </svg>
            Wishlist
          </button>
        </div>
      </aside>
    </>
  );
}
