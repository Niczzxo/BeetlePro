/* Shop route. The legacy hash router reached the shop view as
   #/shop, #/shop/<category> or with a search query; here the
   category and query are URL parameters (?cat= and ?q=). The
   category match is case-insensitive, as the legacy
   routeFromHash() match was, and an unknown category falls back
   to All. The wishlist variant of the view (the legacy #wishBtn
   handler retitling the shop) arrives as ?wish=1. The view
   remounts when the parameters change, the way the legacy
   go('shop') re-rendered it from scratch.

   Metadata follows the legacy applySEO() shop rule: a category
   with no search query gets the dynamic category pair, anything
   else gets SEO_PAGES.shop (see src/lib/seo.ts). */

import type { Metadata } from 'next';
import ShopView from '../../components/shop/ShopView';
import { categories } from '../../data/products';
import { seoMetadata, shopSeo } from '../../lib/seo';

const FILTERS = ['All'].concat(categories.map((c) => c.name));

function matchCat(raw: string | undefined): string {
  if (!raw) return 'All';
  return FILTERS.find((f) => f.toLowerCase() === raw.toLowerCase()) ?? 'All';
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; q?: string; wish?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const q = params.q ? params.q.trim() : '';
  return seoMetadata(shopSeo(matchCat(params.cat), q));
}

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; q?: string; wish?: string }>;
}) {
  const params = await searchParams;
  const cat = matchCat(params.cat);
  const q = params.q ? params.q.trim() : '';
  const wish = params.wish === '1';
  return (
    <ShopView
      key={cat + '|' + q + '|' + (wish ? 'wish' : 'shop')}
      initialCat={cat}
      initialQuery={q}
      initialWish={wish}
    />
  );
}
