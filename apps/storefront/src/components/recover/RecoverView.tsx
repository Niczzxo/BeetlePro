'use client';

/* Recovery link view (Phase 6, architecture addition: the
   legacy site has no recovery links, and nothing here changes
   any legacy layout, class or behaviour). The unguessable token
   in the URL is the credential; the API's public token read
   returns the saved items at current catalogue prices and never
   any contact details.
 *
 * On the visitor's action, each saved line is added into the
 * local bag through the existing CartProvider (the API variant
 * name is "Colour / Size", or just the size, and is matched back
 * onto the product's own variants), then the bag opens so the
 * visitor can check out. Recovered, closed, cancelled, expired
 * and unknown tokens get an honest message in the store's own
 * design language instead of a bag that is not there. */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createApiClient } from '@dostelo/api-client';
import type { RecoveryCartView } from '@dostelo/types';
import { byId } from '../../data/products';
import { pvars, useCart } from '../../features/cart/CartProvider';
import { money } from '../../lib/format';

/** Same default as the tracker: NEXT_PUBLIC_API_URL when set at
 * build time, otherwise the API's local dev address. */
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const client = createApiClient({ baseUrl: API_BASE_URL });

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; view: RecoveryCartView }
  | { kind: 'unknown' };

/** Splits an API variant name back into the storefront's size
 * and colour for CartProvider.add(): "White / EU 42" becomes
 * colour White and size EU 42; a bare size stays a size; a bare
 * colour name stays a colour; anything else falls back to the
 * product defaults inside add(). */
function splitVariant(
  productId: string,
  variantName: string,
): { size: string | null; colour: string | null } {
  const product = byId(productId);
  if (!product) return { size: null, colour: null };
  const cut = variantName.lastIndexOf(' / ');
  if (cut > 0) {
    return {
      colour: variantName.slice(0, cut),
      size: variantName.slice(cut + 3),
    };
  }
  if (product.sizes.includes(variantName)) {
    return { size: variantName, colour: null };
  }
  if (pvars(product).some(([name]) => name === variantName)) {
    return { size: null, colour: variantName };
  }
  return { size: null, colour: null };
}

const STATUS_HEADINGS: Record<string, string> = {
  recovered: 'This bag is already yours',
  closed: 'This recovery link has closed',
  cancelled: 'This recovery was cancelled',
  expired: 'This recovery link has expired',
};

const STATUS_NOTES: Record<string, string> = {
  recovered:
    'The order from this bag was already placed, so there is nothing left to recover here. Thank you for coming back.',
  closed:
    'This bag is no longer being held for recovery. The pieces are still in the shop if you would like to start a fresh bag.',
  cancelled:
    'Recovery for this bag was cancelled, so no further messages will be sent about it. The shop is open whenever you are ready.',
  expired:
    'Recovery links stay open for a limited time and this one has run out. The pieces are still in the shop if you would like to start a fresh bag.',
};

export default function RecoverView({ token }: { token: string }) {
  const { add, openBag } = useCart();
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [added, setAdded] = useState(false);
  const [skipped, setSkipped] = useState(0);

  useEffect(() => {
    let cancelled = false;
    client
      .getRecoveryCart(token)
      .then((view) => {
        if (!cancelled) setState({ kind: 'ready', view });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'unknown' });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  function addEverything(view: RecoveryCartView): void {
    let missed = 0;
    for (const line of view.items) {
      if (!byId(line.productId)) {
        missed += 1;
        continue;
      }
      const { size, colour } = splitVariant(line.productId, line.variantName);
      add(line.productId, line.quantity, size, colour);
    }
    setSkipped(missed);
    setAdded(true);
    openBag();
  }

  return (
    <main>
      <div className="view" id="view-recover">
        <div className="wrap">
          <div className="page-head">
            <h1>Your saved bag</h1>
            <p>
              You left a few pieces behind, so we kept them here for you.
              Prices are the shop's current prices.
            </p>
          </div>

          {state.kind === 'loading' ? (
            <p style={{ marginTop: 28, color: 'var(--muted)' }}>
              Finding your bag...
            </p>
          ) : null}

          {state.kind === 'unknown' ? (
            <div style={{ marginTop: 28 }}>
              <h2 style={{ fontSize: 24 }}>We could not find this link</h2>
              <p style={{ maxWidth: 560, marginTop: 12 }}>
                This recovery link does not match any saved bag. It may
                have been copied incompletely, or the bag may already
                have been cleared. Nothing was added to your bag.
              </p>
              <p style={{ marginTop: 20 }}>
                <Link className="btn" href="/shop">
                  Continue shopping
                </Link>
              </p>
            </div>
          ) : null}

          {state.kind === 'ready' && state.view.status !== 'active' ? (
            <div style={{ marginTop: 28 }}>
              <h2 style={{ fontSize: 24 }}>
                {STATUS_HEADINGS[state.view.status] ??
                  'This recovery link is no longer active'}
              </h2>
              <p style={{ maxWidth: 560, marginTop: 12 }}>
                {state.view.message ??
                  STATUS_NOTES[state.view.status] ??
                  'This bag is no longer available for recovery.'}
              </p>
              <p style={{ marginTop: 20 }}>
                <Link className="btn" href="/shop">
                  Continue shopping
                </Link>
              </p>
            </div>
          ) : null}

          {state.kind === 'ready' && state.view.status === 'active' ? (
            <div style={{ marginTop: 28 }}>
              {state.view.items.length === 0 ? (
                <p>
                  This bag is empty now. The pieces are still in the shop
                  if you would like to start again.
                </p>
              ) : (
                <>
                  <div>
                    {state.view.items.map((line) => {
                      const product = byId(line.productId);
                      return (
                        <div
                          key={line.variantId}
                          style={{
                            display: 'flex',
                            gap: 16,
                            alignItems: 'center',
                            padding: '14px 0',
                            borderBottom: '1px solid var(--line)',
                          }}
                        >
                          {product ? (
                            <img
                              loading="lazy"
                              decoding="async"
                              src={product.img}
                              alt={line.productName}
                              style={{
                                width: 72,
                                height: 72,
                                objectFit: 'cover',
                                borderRadius: 'var(--r-md)',
                                background: 'var(--surface2)',
                              }}
                            />
                          ) : null}
                          <div style={{ flex: 1 }}>
                            <b>{line.productName}</b>
                            <div
                              style={{ fontSize: 13, color: 'var(--muted)' }}
                            >
                              {line.variantName} · {money(line.unitPrice.amountMinor / 100)} · Qty{' '}
                              {line.quantity}
                            </div>
                          </div>
                          <b>{money(line.lineTotal.amountMinor / 100)}</b>
                        </div>
                      );
                    })}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginTop: 18,
                      fontSize: 17,
                    }}
                  >
                    <span>Subtotal at today's prices</span>
                    <b>{money(state.view.subtotal.amountMinor / 100)}</b>
                  </div>

                  {added ? (
                    <div style={{ marginTop: 22 }}>
                      <p>
                        Your pieces are in your bag.
                        {skipped > 0
                          ? ` ${skipped} saved piece(s) are no longer in the catalogue and could not be added.`
                          : ''}
                      </p>
                      <p
                        style={{
                          marginTop: 14,
                          display: 'flex',
                          gap: 10,
                          flexWrap: 'wrap',
                        }}
                      >
                        <button
                          type="button"
                          className="btn"
                          onClick={() => router.push('/checkout')}
                        >
                          Go to checkout
                        </button>
                        <button
                          type="button"
                          className="btn light"
                          onClick={openBag}
                        >
                          Review my bag
                        </button>
                      </p>
                    </div>
                  ) : (
                    <p style={{ marginTop: 22 }}>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => addEverything(state.view)}
                      >
                        Add everything to my bag
                      </button>
                    </p>
                  )}
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
