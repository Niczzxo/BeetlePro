'use client';

/* Cart page from the public page map (docs/PUBLIC_STOREFRONT.md).
   The bag drawer stays the quick view; this is the full page:
   the same lines, steppers and totals as the drawer and
   checkout (one cart provider, one totals function), an honest
   empty state with a way back to the shop, and the checkout
   call to action. Quantities change through the provider, so the
   header count, the drawer and this page never disagree. */

import Link from 'next/link';
import { useCart } from '../../features/cart/CartProvider';
import { ZONE_NAME } from '../../features/checkout/detectZone';
import { money } from '../../lib/format';

export default function CartView() {
  const { lines, count, totals, changeQty, removeLine } = useCart();

  return (
    <main>
      <div className="view" id="view-cart">
        <div className="wrap">
          <div className="page-head">
            <h1>Your bag</h1>
            <p>
              {count === 0
                ? 'Your bag is empty.'
                : count + (count === 1 ? ' piece' : ' pieces') + ' in your bag.'}
            </p>
          </div>
          {lines.length === 0 ? (
            <div style={{ marginTop: 36 }}>
              <p>Nothing here yet. When you add a piece, it will show on this page.</p>
              <Link className="btn" href="/shop" style={{ marginTop: 16 }}>
                Start shopping
              </Link>
            </div>
          ) : (
            <div className="split" style={{ marginTop: 36 }}>
              <div>
                {lines.map((x) => (
                  <div className="co-item" key={x.key} style={{ marginBottom: 14 }}>
                    <img loading="lazy" decoding="async" src={x.img} alt={x.product.name} />
                    <div>
                      <b>{x.product.name}</b>
                      <span>
                        {(x.colour ? x.colour + ' · ' : '') + 'Size ' + x.size}
                      </span>
                      <span>
                        <button
                          type="button"
                          aria-label={'One less ' + x.product.name}
                          onClick={() => changeQty(x.key, -1)}
                        >
                          −
                        </button>{' '}
                        {x.qty}{' '}
                        <button
                          type="button"
                          aria-label={'One more ' + x.product.name}
                          onClick={() => changeQty(x.key, 1)}
                        >
                          +
                        </button>{' '}
                        <button type="button" onClick={() => removeLine(x.key)}>
                          Remove
                        </button>
                      </span>
                    </div>
                    <b style={{ color: 'var(--ink)' }}>{money(x.product.price * x.qty)}</b>
                  </div>
                ))}
              </div>
              <div className="co-card">
                <h3>Summary</h3>
                <p>
                  Subtotal <b>{money(totals.sub)}</b>
                </p>
                <p>
                  Delivery{' '}
                  <b>
                    {totals.free
                      ? 'Free'
                      : totals.zone
                        ? money(totals.zoneFee) + ' (' + ZONE_NAME[totals.zone] + ')'
                        : 'Calculated at checkout from your address'}
                  </b>
                </p>
                <p>
                  Total <b>{money(totals.total)}</b>
                </p>
                <Link className="btn block" href="/checkout">
                  Go to checkout
                </Link>
                <Link className="btn block light" href="/shop" style={{ marginTop: 10 }}>
                  Keep shopping
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
