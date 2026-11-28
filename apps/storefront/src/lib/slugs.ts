/* URL slugs for categories and collections. Category names are
   the catalogue's own (Shoes first); a slug is the name lowered
   and spaced with dashes, and matching is case-insensitive, the
   same rule the shop route uses for its ?cat= parameter. */

import { categories, products, type StorefrontProduct } from '../data/products';

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function categoryBySlug(slug: string): string | null {
  const found = categories.find((c) => slugify(c.name) === slug.toLowerCase());
  return found ? found.name : null;
}

/** A curated collection is a named, real slice of the catalogue:
    the pieces on offer (a compare-at price above the price), the
    new arrivals (the New badge), the bestsellers (the Bestseller
    badge), and each category itself. Nothing here invents a
    product or a price; every collection is computed from the
    catalogue data. */
export interface CollectionDef {
  slug: string;
  title: string;
  blurb: string;
  items: StorefrontProduct[];
}

export function collections(): CollectionDef[] {
  const onOffer = products.filter((p) => p.was > p.price);
  const newIn = products.filter((p) => p.badge === 'New');
  const best = products.filter((p) => p.badge === 'Bestseller');
  const defs: CollectionDef[] = [
    {
      slug: 'on-offer',
      title: 'On offer',
      blurb: 'Pieces with a lower price than before, while stock lasts.',
      items: onOffer,
    },
    {
      slug: 'new-in',
      title: 'New in',
      blurb: 'The newest pieces in the workshop.',
      items: newIn,
    },
    {
      slug: 'bestsellers',
      title: 'Bestsellers',
      blurb: 'The pieces families come back for.',
      items: best,
    },
  ];
  for (const c of categories) {
    defs.push({
      slug: slugify(c.name),
      title: c.name,
      blurb: 'Boys ' + c.name.toLowerCase() + ' in honest fabrics and fair taka prices.',
      items: products.filter((p) => p.cat === c.name),
    });
  }
  return defs.filter((d) => d.items.length > 0);
}

export function collectionBySlug(slug: string): CollectionDef | null {
  return collections().find((d) => d.slug === slug.toLowerCase()) ?? null;
}
