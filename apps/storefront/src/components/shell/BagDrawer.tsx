'use client';

/* Bag drawer, a faithful port of the legacy #scrim and
   #bagDrawer markup and renderBag(): the header with the piece
   count, the line items (variant photo, name, colour and size
   line, quantity steppers keyed by the legacy data-dq values,
   the line total and Remove), the empty state, and the footer
   with the discount code row, subtotal, delivery line, total,
   checkout button, delivery note and payment row. The footer
   hides while the bag is empty, as the legacy #bagFoot does.

   Open and close follow the legacy: the header bag button and
   the footer Bag button open it; the close button, a click on
   the scrim and the Escape key close it (the legacy closeAll(),
   which also closes the welcome and help modals: the scrim is
   the one shared #scrim, so it lights for the modals too and
   its click runs the whole closeAll()). The checkout button
   closes the drawer and navigates to /checkout, the legacy
   go('checkout').

   The delivery line and note follow the legacy renderBag()
   formulas, reading the full totals() from CartProvider: the
   zone comes from the shared checkout form state (what the
   legacy detectZone() reads from the checkout fields), so
   before any address is typed the line reads "At checkout" and
   once one exists it quotes the zone fee; first-order free
   follows the signed-in account, and the admin free-delivery
   offer (the dostelo-free-delivery switch) is honoured, as the
   legacy honours it. The drawer total stays subtotal plus zone
   fee: the legacy never adds the COD fee in the bag, that line
   appears at checkout where the payment method is chosen. */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '../../features/cart/CartProvider';
import { useModals } from '../../features/modals/Modals';
import { useToast } from '../../features/toast/Toast';
import { money } from '../../lib/format';

export default function BagDrawer() {
  const { lines, count, totals, changeQty, removeLine, bagOpen, closeBag } = useCart();
  const { modalOpen, closeModals } = useModals();
  const { toast } = useToast();
  const router = useRouter();

  /* The legacy document keydown: Escape closes the drawer. */
  useEffect(() => {
    if (!bagOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeBag();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [bagOpen, closeBag]);

  const headCount = count ? '\u00B7 ' + count + (count === 1 ? ' piece' : ' pieces') : '';

  /* The legacy renderBag() delivery line. */
  const delText = totals.free
    ? totals.freeFirst && !totals.freeAdmin
      ? 'Free \u00B7 first order offer'
      : 'Free \u00B7 offer'
    : totals.zone
      ? money(totals.zoneFee)
      : 'At checkout';

  /* The legacy renderBag() delivery note. */
  const noteText = !lines.length
    ? totals.freeFirst
      ? 'Free delivery on your first order \u00B7 free size exchange within 7 days.'
      : 'Delivery \u09F370 Dhaka city \u00B7 \u09F3100 sub city \u00B7 \u09F3150 outside - set automatically at checkout from your address.'
    : totals.freeFirst && !totals.freeAdmin
      ? 'Free delivery applied - first order offer \u00B7 free size exchange within 7 days.'
      : totals.free
        ? 'Free delivery - offer is on \u00B7 free size exchange within 7 days.'
        : 'Delivery is set automatically at checkout from your address \u00B7 free size exchange within 7 days.';

  return (
    <>
      <div
        className={'scrim' + (bagOpen || modalOpen ? ' on' : '')}
        id="scrim"
        onClick={() => {
          closeBag();
          closeModals();
        }}
      ></div>

      <aside className={'drawer' + (bagOpen ? ' on' : '')} id="bagDrawer" aria-label="Shopping bag">
        <div className="dhead">
          <h3>
            Your bag{' '}
            <span id="bagHeadCount" style={{ color: 'var(--muted)', fontSize: 14 }}>
              {headCount}
            </span>
          </h3>
          <button className="hbtn" id="bagClose" aria-label="Close bag" onClick={closeBag}>
            <svg className="icon" viewBox="0 0 24 24">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="ditems" id="bagItems">
          {!lines.length ? (
            <div className="dempty">
              Your bag is empty.
              <br />
              Every good wardrobe starts with a single piece.
            </div>
          ) : (
            lines.map((x) => (
              <div className="ditem" key={x.key}>
                <img loading="lazy" decoding="async" src={x.img} alt={x.product.name} />
                <div>
                  <b>{x.product.name}</b>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                    {(x.colour ? x.colour + ' \u00B7 ' : '') +
                      'Size ' +
                      x.size +
                      ' \u00B7 ' +
                      money(x.product.price)}
                  </div>
                  <div className="dq">
                    <button
                      data-dq={x.key + '|-1'}
                      aria-label="Decrease"
                      onClick={() => changeQty(x.key, -1)}
                    >
                      {'\u2212'}
                    </button>
                    <b>{x.qty}</b>
                    <button
                      data-dq={x.key + '|1'}
                      aria-label="Increase"
                      onClick={() => changeQty(x.key, 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="dp">
                  <b>{money(x.product.price * x.qty)}</b>
                  <br />
                  <button className="rm" data-rm={x.key} onClick={() => removeLine(x.key)}>
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="dfoot" id="bagFoot" style={lines.length ? undefined : { display: 'none' }}>
          <div className="code-row">
            <input id="codeInput" placeholder="Discount code" aria-label="Discount code" />
            <button id="codeApply" onClick={() => toast('That code is not valid')}>
              Apply
            </button>
          </div>
          <div className="row">
            <span>Subtotal</span>
            <span id="bagSub">{money(totals.sub)}</span>
          </div>
          <div className="row">
            <span>Delivery</span>
            <span id="bagDel">{delText}</span>
          </div>
          <div className="row total">
            <span>Total</span>
            <span id="bagTotal">{money(totals.sub + totals.zoneFee)}</span>
          </div>
          <button
            className="btn block"
            id="checkoutBtn"
            style={{ marginTop: 16 }}
            onClick={() => {
              closeBag();
              router.push('/checkout');
            }}
          >
            Checkout
          </button>
          <div className="freenote" id="bagNote">
            {noteText}
          </div>
          <div className="pay" aria-label="Accepted payments">
            <span>bKash</span>
            <span>Nagad</span>
            <span>Rocket</span>
            <span>Upay</span>
            <span>VISA</span>
            <span>MC</span>
            <span>COD</span>
          </div>
        </div>
      </aside>
    </>
  );
}
