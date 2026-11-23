'use client';

/* Global click delegation, a port of the legacy script's two
   document-level click listeners. The legacy site routes every
   control through data attributes, and the migrated markup keeps
   those attributes, so the same delegation drives it here:

   - [data-add]      quick-add from a card: the legacy delegation
                     takes the card's .ph photo as the flight
                     source and calls addToBag(id, 1) with the
                     legacy defaults; the paper plane flies and
                     the commit lands with it (CartProvider's
                     addWithFly)
   - [data-nav]      view navigation: every legacy view now has
                     a route (home, shop, collections, journal,
                     about, contact, account, checkout, and the
                     four help views under /policies)
   - [data-product]  open the product page
   - [data-cat]      open the shop filtered to that category
                     (category cards, footer Shop column, hero)
   - [data-offer]    offer cards: shop filtered to the offer's
                     category, or the plain shop when it has none
   - [data-article]  open the article page (journal cards)
   - [data-help]     open the help modal on that topic (footer
                     Help column, Privacy and Terms, the account
                     page's Your orders button)
   - [data-social]   social links: the legacy answers with the
                     toast "<name> - find us as @dostelo"

   [data-wish] keeps its legacy attribute on the card hearts and
   is handled by the cards themselves through the wishlist
   provider (the legacy toggleWish). Clicks that follow a rail
   drag never reach this listener: DragSystem swallows them in
   the capture phase, exactly as the legacy makeDraggable()
   did. */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '../../features/cart/CartProvider';
import { useModals } from '../../features/modals/Modals';
import { useToast } from '../../features/toast/Toast';

const NAV_ROUTES: Record<string, string> = {
  home: '/',
  shop: '/shop',
  collections: '/collections',
  journal: '/journal',
  about: '/about',
  contact: '/contact',
  account: '/account',
  checkout: '/checkout',
  shipping: '/policies/shipping',
  returns: '/policies/returns',
  warranty: '/policies/warranty',
  faq: '/policies/faq',
};

export default function NavSystem() {
  const router = useRouter();
  const { addWithFly } = useCart();
  const { openHelp } = useModals();
  const { toast } = useToast();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as Element | null;
      if (!target || typeof target.closest !== 'function') return;

      const addEl = target.closest('[data-add]');
      if (addEl) {
        const id = addEl.getAttribute('data-add');
        if (id) {
          /* The legacy delegation: the flight source is the
             card's main .ph photo. */
          const card = addEl.closest('.card');
          const img = card ? card.querySelector('.ph img') : null;
          addWithFly(id, 1, null, null, img as HTMLElement | null);
        }
        return;
      }

      const nav = target.closest('[data-nav]');
      if (nav) {
        const view = nav.getAttribute('data-nav') || '';
        const route = NAV_ROUTES[view];
        if (route) {
          e.preventDefault();
          router.push(route);
        }
        return;
      }

      const pc = target.closest('[data-product]');
      if (pc) {
        const id = pc.getAttribute('data-product');
        if (id) router.push('/product/' + encodeURIComponent(id));
        return;
      }

      const cc = target.closest('[data-cat]');
      if (cc) {
        const cat = cc.getAttribute('data-cat');
        if (cat) router.push('/shop?cat=' + encodeURIComponent(cat));
        return;
      }

      const oc = target.closest('[data-offer]');
      if (oc) {
        const cat = oc.getAttribute('data-offer');
        if (cat) router.push('/shop?cat=' + encodeURIComponent(cat));
        else router.push('/shop');
        return;
      }

      const ac = target.closest('[data-article]');
      if (ac) {
        const id = ac.getAttribute('data-article');
        if (id) router.push('/journal/' + encodeURIComponent(id));
        return;
      }

      const hp = target.closest('[data-help]');
      if (hp) {
        const key = hp.getAttribute('data-help');
        if (key) openHelp(key);
        return;
      }

      const so = target.closest('[data-social]');
      if (so) {
        e.preventDefault();
        toast(so.getAttribute('data-social') + ' - find us as @dostelo');
        return;
      }
    }

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [router, addWithFly, openHelp, toast]);

  return null;
}
