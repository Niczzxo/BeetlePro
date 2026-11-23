'use client';

/* Product card, a direct port of the legacy cardHTML() renderer:
   same DOM, same classes, same conditional pieces. The photo
   crossfade to the second (gallery) photo and the Add to bag bar
   rising from the bottom of the frame are pure legacy CSS on this
   markup (.ph img.alt, .addbag). Sold-out products show the
   "Sold out" badge and a disabled bar; stock of 4 or less shows the
   low-stock line. The card keeps its legacy data attributes:
   data-product and data-add are routed by NavSystem (the legacy
   document delegation, ported; data-add flies the card photo to
   the bag), and the wishlist heart runs the legacy toggleWish()
   through the wishlist provider, carrying the .loved class
   while the piece is saved. */

import type { StorefrontProduct } from '../../data/products';
import { money } from '../../lib/format';
import { useWishlist } from '../../features/wishlist/WishlistProvider';
import { HeartIcon, PlusIcon } from '../icons';

export default function ProductCard({ product }: { product: StorefrontProduct }) {
  const p = product;
  const { wished, toggleWish } = useWishlist();
  const out = p.stock === 0;
  const badge = out ? 'Sold out' : p.badge;
  return (
    <article className={'card reveal' + (out ? ' soldout' : '')}>
      <div className="ph">
        {badge ? <span className="badge">{badge}</span> : null}
        <button
          className={'heart' + (wished(p.id) ? ' loved' : '')}
          data-wish={p.id}
          aria-label={`Save ${p.name} to wishlist`}
          onClick={() => toggleWish(p.id)}
        >
          <HeartIcon />
        </button>
        <button data-product={p.id} aria-label={`View ${p.name}`}>
          <img src={p.img} alt={p.name} loading="lazy" decoding="async" />
          {p.gallery && p.gallery.length > 1 ? (
            <img className="alt" src={p.gallery[1]} alt="" aria-hidden="true" loading="lazy" decoding="async" />
          ) : null}
        </button>
        {out ? (
          <button className="addbag" disabled>
            Sold out
          </button>
        ) : (
          <button className="addbag" data-add={p.id}>
            <PlusIcon /> Add to bag
          </button>
        )}
      </div>
      <button data-product={p.id} style={{ textAlign: 'left', padding: 0, width: '100%' }}>
        <h3>{p.name}</h3>
        <div className="cat">{p.cat}</div>
        <div className="price">
          <b>{money(p.price)}</b>
          {p.was ? <s>{money(p.was)}</s> : null}
        </div>
        {!out && p.stock <= 4 ? <div className="lowstock">Only {p.stock} left in stock</div> : null}
      </button>
    </article>
  );
}
