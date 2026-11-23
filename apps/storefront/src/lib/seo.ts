/* Per-view SEO metadata, a port of the legacy script's
   SEO_PAGES table and applySEO() rules. The legacy site is a
   single page that rewrites the document title and description
   on every view change; the migrated site is routed, so each
   route carries the same title/description pair as static
   metadata instead. Values are the legacy strings verbatim.

   applySEO() rules, mapped to routes:
   - home, collections, journal, about, contact, checkout,
     confirmation, account, shipping, returns, warranty, faq:
     the SEO_PAGES pair for the view.
   - shop: a category with no search query gets the dynamic
     "<Cat> for Boys - Shop | Dostelo" pair; anything else
     (All, or a search) gets SEO_PAGES.shop.
   - product: "<name> - <money(price)> | Dostelo" with the
     product description.
   - article: "<title> | Dostelo Journal" with the lead. */

import { money } from './format';
import type { StorefrontArticle, StorefrontProduct } from '../data/products';

export interface SeoPair {
  title: string;
  desc: string;
}

export const SEO_PAGES: Record<string, SeoPair> = {
  home: {
    title: 'Dostelo - Boys Clothing in Bangladesh | Shirts, Tees, Pants & Belts',
    desc: 'DOSTELO is a boys clothing store in Bangladesh - shirts, t-shirts, polos, pants, jeans, belts and accessories in honest fabrics and fair taka prices. Cash on Delivery, bKash, Nagad, Rocket, Upay and cards accepted.',
  },
  shop: {
    title: 'Shop Boys Clothing - Dostelo Bangladesh',
    desc: 'Shop boys shirts, t-shirts, polos, pants, jeans, belts and accessories. Fair taka prices, delivery across Bangladesh, free size exchange within 7 days.',
  },
  collections: {
    title: 'Categories - Shirts, T-Shirts, Polo, Pants, Jeans, Belts | Dostelo',
    desc: 'Boys clothing categories at DOSTELO: Shirts, T-Shirts, Polo, Pants, Jeans, Belts and Accessories - honest fabrics, sizes S-XL and waist 30-38.',
  },
  journal: {
    title: 'Journal - Fabric Care, Size Guide & Style Notes | Dostelo',
    desc: 'Notes from the DOSTELO workshop - keeping cotton crisp in Bangladesh weather, the boys size guide, and building a small wardrobe that works.',
  },
  about: {
    title: 'About Dostelo - Boys Clothing With Care, Made to Last',
    desc: 'DOSTELO started in a small Dhaka workshop: honest, comfortable boys clothing in fabrics that survive daily wear, at fair taka prices.',
  },
  contact: {
    title: 'Contact Dostelo - Orders, Sizes & Delivery',
    desc: 'Questions about a size, a delivery or an exchange? Contact the DOSTELO workshop - a person replies within one working day.',
  },
  checkout: {
    title: 'Checkout - Dostelo',
    desc: 'Checkout at DOSTELO: delivery anywhere in Bangladesh, pay with Cash on Delivery, bKash, Nagad, Rocket, Upay or card.',
  },
  confirmation: {
    title: 'Order Confirmed - Dostelo',
    desc: 'Your DOSTELO order is confirmed. Keep your order number for tracking, delivery and free size exchange.',
  },
  account: {
    title: 'Your Account - Dostelo',
    desc: 'Sign in to DOSTELO for faster checkout, order tracking and easy size exchanges.',
  },
  shipping: {
    title: 'Shipping & Delivery in Bangladesh - Dostelo',
    desc: 'DOSTELO delivery: Dhaka city 1-2 working days, nationwide 2-4 working days. Delivery 70 taka in Dhaka city, 100 taka in Dhaka sub city, 150 taka outside Dhaka, set automatically from your address at checkout; free delivery on your first order.',
  },
  returns: {
    title: 'Returns & Free Size Exchange - Dostelo',
    desc: 'Free size exchange within 7 days anywhere in Bangladesh, 7-day returns and refunds within 3 working days at DOSTELO.',
  },
  warranty: {
    title: 'Stitching Guarantee - Dostelo',
    desc: 'The DOSTELO stitching guarantee: seam splits, button loss and buckle faults repaired or replaced free within 12 months.',
  },
  faq: {
    title: 'FAQ - Payments, Delivery, Sizes | Dostelo',
    desc: 'DOSTELO FAQ: pay with bKash, Nagad, Rocket, Upay, card or Cash on Delivery; delivery times, size exchanges and returns explained.',
  },
};

/** The legacy applySEO() shop rule. */
export function shopSeo(cat: string, query: string): SeoPair {
  if (cat && cat !== 'All' && !query) {
    return {
      title: cat + ' for Boys - Shop | Dostelo',
      desc:
        'Shop boys ' +
        cat.toLowerCase() +
        ' at DOSTELO - honest fabrics, fair taka prices, delivery across Bangladesh and free size exchange within 7 days.',
    };
  }
  return SEO_PAGES.shop;
}

/** The legacy applySEO() product rule. */
export function productSeo(p: StorefrontProduct): SeoPair {
  return { title: p.name + ' - ' + money(p.price) + ' | Dostelo', desc: p.desc };
}

/** The legacy applySEO() article rule. */
export function articleSeo(a: StorefrontArticle): SeoPair {
  return { title: a.title + ' | Dostelo Journal', desc: a.lead };
}

/** Shape a pair as Next metadata. */
export function seoMetadata(pair: SeoPair): { title: string; description: string } {
  return { title: pair.title, description: pair.desc };
}
