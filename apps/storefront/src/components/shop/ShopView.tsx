'use client';

/* Shop view, a port of the legacy #view-shop markup and
   renderShop(): the filter chips are ['All'] followed by the
   categories in catalogue order (Shoes first), the sort select
   carries the legacy's four options with its exact orderings
   (featured keeps catalogue order), the heading follows the
   legacy rule (a search query wins, then the category, then
   "Shop all"), and the empty state is the legacy #shopEmpty
   line. The category and the search query arrive as URL
   parameters (?cat= and ?q=), the way the legacy hash router
   carried them; changing a chip updates the URL to match.

   The wishlist variant (the legacy #wishBtn handler) arrives
   as ?wish=1: the grid shows the saved pieces in the order
   they were saved, snapshotted when the view opens (the legacy
   renderGrid call in that handler), the heading reads "Your
   wishlist" and the filter row is hidden, exactly as the
   legacy sets it. Changing the sort leaves the wishlist view,
   as the legacy sort handler re-runs renderShop(). */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { byId, categories, products, type StorefrontProduct } from '../../data/products';
import { useWishlist } from '../../features/wishlist/WishlistProvider';
import ProductCard from '../home/ProductCard';
import RevealSystem from '../home/RevealSystem';

const FILTERS = ['All'].concat(categories.map((c) => c.name));

type ShopSort = 'featured' | 'price-asc' | 'price-desc' | 'name';

export default function ShopView({
  initialCat,
  initialQuery,
  initialWish = false,
}: {
  initialCat: string;
  initialQuery: string;
  initialWish?: boolean;
}) {
  const router = useRouter();
  const { ids: wishIds } = useWishlist();
  const [shopCat, setShopCat] = useState(initialCat);
  const [shopQuery] = useState(initialQuery);
  const [shopSort, setShopSort] = useState<ShopSort>('featured');
  const [wishMode, setWishMode] = useState(initialWish);
  /* The legacy wish button renders the wishlist grid once, from
     the ids saved at that moment; later heart toggles only
     restyle hearts, they do not re-render the grid. The view
     therefore snapshots the saved pieces on entry. */
  const [wishList] = useState<StorefrontProduct[]>(() =>
    initialWish ? wishIds.map((id) => byId(id)).filter((p): p is StorefrontProduct => !!p) : [],
  );

  let list = wishMode
    ? wishList
    : products.filter((p) => {
        const okC = shopCat === 'All' || p.cat === shopCat;
        const okQ =
          !shopQuery || (p.name + ' ' + p.cat).toLowerCase().indexOf(shopQuery.toLowerCase()) >= 0;
        return okC && okQ;
      });
  if (shopSort === 'price-asc') list = list.slice().sort((a, b) => a.price - b.price);
  if (shopSort === 'price-desc') list = list.slice().sort((a, b) => b.price - a.price);
  if (shopSort === 'name') list = list.slice().sort((a, b) => (a.name < b.name ? -1 : 1));

  const title = wishMode
    ? 'Your wishlist'
    : shopQuery
      ? 'Results for \u201C' + shopQuery + '\u201D'
      : shopCat === 'All'
        ? 'Shop all'
        : shopCat;

  function pickFilter(f: string) {
    setShopCat(f);
    const params = new URLSearchParams();
    if (f !== 'All') params.set('cat', f);
    if (shopQuery) params.set('q', shopQuery);
    const qs = params.toString();
    router.replace(qs ? '/shop?' + qs : '/shop', { scroll: false });
  }

  /* The legacy sort handler re-runs renderShop(), which also
     restores the filter row and the rule-based heading, so
     sorting out of the wishlist view returns the plain shop. */
  function pickSort(v: ShopSort) {
    if (wishMode) {
      setWishMode(false);
      router.replace('/shop', { scroll: false });
    }
    setShopSort(v);
  }

  return (
    <main>
      <div className="view" id="view-shop">
        <div className="wrap">
          <div className="page-head">
            <h1 id="shopTitle">{title}</h1>
            <p id="shopSub">
              Shirts, tees, polos, pants, jeans, belts and accessories - honest fabrics, fair taka
              prices, delivered across Bangladesh.
            </p>
          </div>
          <div className="filters" id="shopFilters" style={wishMode ? { display: 'none' } : undefined}>
            {FILTERS.map((f) => (
              <button
                className={'fbtn' + (shopCat === f ? ' on' : '')}
                data-filter={f}
                key={f}
                onClick={() => pickFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '-14px 0 22px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--ink)',
              }}
            >
              Sort
              <select
                className="sortsel"
                id="shopSort"
                aria-label="Sort products"
                value={shopSort}
                onChange={(e) => pickSort(e.target.value as ShopSort)}
              >
                <option value="featured">Featured</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
                <option value="name">Name A-Z</option>
              </select>
            </label>
          </div>
          <div className="grid" id="shopGrid" style={{ paddingBottom: 20 }}>
            {list.map((p) => (
              <ProductCard product={p} key={p.id} />
            ))}
          </div>
          <p className="sd-none" id="shopEmpty" hidden={wishMode || list.length > 0}>
            Nothing matches that search yet - try {'\u201C'}shirt{'\u201D'}, {'\u201C'}tee{'\u201D'},{' '}
            {'\u201C'}jeans{'\u201D'} or {'\u201C'}belt{'\u201D'}.
          </p>
        </div>
      </div>
      <RevealSystem key={shopCat + '|' + shopSort + '|' + shopQuery} />
    </main>
  );
}
