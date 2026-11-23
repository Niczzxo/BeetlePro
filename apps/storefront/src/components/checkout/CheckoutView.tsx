'use client';

/* Checkout view, a port of the legacy #view-checkout markup,
   renderCoAccount(), renderCheckout() and the checkoutForm
   submit handler, plus the #view-confirmation it hands over to.

   The account strip follows renderCoAccount(): signed-out
   visitors see the account-needed notice; signed-in customers
   see "Ordering as name - id" with a sign-out, and their name
   (and email, when the id is one) prefill the form while those
   fields are empty.

   The summary follows renderCheckout() line for line, reading
   the full totals() from the cart provider: subtotal, the
   delivery label with its zone name, the delivery value (free
   for a first order, free for the admin offer, the zone fee, or
   "Enter address to calculate"), the first-order note row, the
   COD charge row and the total. The Place order button is
   disabled on an empty bag.

   Typing in the address or district field updates the shared
   checkout state, so the zone, the summary and the bag drawer
   all re-read it on every keystroke, as the legacy input
   listeners re-ran renderCheckout() and renderBag().

   The submit is the legacy handler: an empty bag does nothing;
   a signed-out submit places NO order and records nothing, it
   scrolls the account card into view and toasts the
   account-needed notice, leaving the bag and the form intact.
   A signed-in submit mints the order number (BP- plus six
   digits), snapshots the confirmation from the form and the
   totals, records the order against the account
   (dostelo-orders-by-account), empties the bag and shows the
   confirmation view in place, the legacy go('confirmation'). */

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAccount } from '../../features/account/AccountProvider';
import { useCart, type BagLine } from '../../features/cart/CartProvider';
import { useCheckout } from '../../features/checkout/CheckoutProvider';
import { ZONE_NAME } from '../../features/checkout/detectZone';
import { useToast } from '../../features/toast/Toast';
import { money } from '../../lib/format';

const PAY_OPTIONS: { pay: string; label: string; desc: string }[] = [
  {
    pay: 'Cash on Delivery',
    label: 'Cash on Delivery',
    desc: 'Pay at your doorstep - cash or mobile banking \u00B7 +\u09F310 COD charge',
  },
  { pay: 'bKash', label: 'bKash', desc: 'Send money to our bKash number at confirmation' },
  { pay: 'Nagad', label: 'Nagad', desc: 'Send money to our Nagad number at confirmation' },
  { pay: 'Rocket', label: 'Rocket', desc: 'DBBL Rocket send money at confirmation' },
  { pay: 'Upay', label: 'Upay', desc: 'Send money to our Upay number at confirmation' },
  {
    pay: 'Card',
    label: 'Debit / credit card',
    desc: 'Visa, Mastercard, Amex - secure card payment step',
  },
];

interface PlacedItem {
  img: string;
  name: string;
  colour: string;
  size: string;
  qty: number;
  lineTotal: number;
}

interface PlacedOrder {
  no: string;
  name: string;
  pay: string;
  addrLine: string;
  eta: string;
  items: PlacedItem[];
  total: number;
  payNote: string;
}

function ItemRow({ x }: { x: PlacedItem }) {
  return (
    <div className="co-item">
      <img loading="lazy" decoding="async" src={x.img} alt={x.name} />
      <div>
        <b>{x.name}</b>
        <span>
          {(x.colour ? x.colour + ' \u00B7 ' : '') + 'Size ' + x.size + ' \u00B7 Qty ' + x.qty}
        </span>
      </div>
      <b style={{ color: 'var(--ink)' }}>{money(x.lineTotal)}</b>
    </div>
  );
}

function toPlaced(x: BagLine): PlacedItem {
  return {
    img: x.img,
    name: x.product.name,
    colour: x.colour,
    size: x.size,
    qty: x.qty,
    lineTotal: x.product.price * x.qty,
  };
}

export default function CheckoutView() {
  const { user, signOut, recordOrder } = useAccount();
  const { lines, totals, clear } = useCart();
  const co = useCheckout();
  const { toast } = useToast();
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);

  /* renderCoAccount()'s prefill: when a customer signs in, the
     name (and the email, when the account id is one) fill the
     form while those fields are still empty. */
  const lastUserId = useRef<string | null>(null);
  useEffect(() => {
    const uid = user ? user.id : null;
    if (user && uid !== lastUserId.current) {
      if (!co.name) co.setName(user.name);
      if (!co.email && user.id.indexOf('@') >= 0) co.setEmail(user.id);
    }
    lastUserId.current = uid;
    // Only the sign-in change drives the prefill, as in the legacy
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!lines.length) return;
    /* The legacy account gate: no order, nothing recorded, the
       bag and form stay intact. */
    if (!user) {
      const card = document.getElementById('coAcctCard');
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('An account is needed to order - sign in or create one first');
      return;
    }
    const no = 'BP-' + Math.floor(100000 + Math.random() * 900000);
    const total = totals.total;
    const payNote =
      co.payMethod === 'Cash on Delivery'
        ? 'Please keep ' +
          money(total) +
          ' ready for the rider. We will call ' +
          co.phone +
          ' to confirm before dispatch.'
        : 'To complete payment, send ' +
          money(total) +
          ' via ' +
          co.payMethod +
          ' using order number ' +
          no +
          ' as the reference - the number to send to is shared by SMS to ' +
          co.phone +
          '.';
    const snapshot: PlacedOrder = {
      no,
      name: co.name,
      pay: co.payMethod,
      addrLine: co.addr + ', ' + co.city,
      eta: totals.zone === 'dhaka' ? '1-2 working days' : '2-4 working days',
      items: lines.map(toPlaced),
      total,
      payNote,
    };
    recordOrder();
    clear();
    setPlaced(snapshot);
  }

  if (placed) {
    return (
      <main>
        <div className="view" id="view-confirmation">
          <div className="wrap">
            <div
              className="page-head"
              style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto' }}
            >
              <span
                className="ic"
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 999,
                  background: 'var(--chip)',
                  display: 'inline-grid',
                  placeItems: 'center',
                  color: 'var(--ink)',
                }}
              >
                <svg className="icon" viewBox="0 0 24 24" style={{ width: 30, height: 30 }}>
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
              </span>
              <h1 style={{ marginTop: 20 }}>Order confirmed</h1>
              <p style={{ marginLeft: 'auto', marginRight: 'auto' }}>
                Thank you - your order is in. Keep your order number; it is all we need to track,
                deliver or exchange it.
              </p>
            </div>
            <div className="co-card" style={{ maxWidth: 640, margin: '26px auto 0' }}>
              <div
                className="row"
                style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}
              >
                <span>Order number</span>
                <b id="cfNo" style={{ color: 'var(--ink)' }}>
                  {placed.no}
                </b>
              </div>
              <div
                className="row"
                style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}
              >
                <span>Name</span>
                <b id="cfName" style={{ color: 'var(--ink)' }}>
                  {placed.name}
                </b>
              </div>
              <div
                className="row"
                style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}
              >
                <span>Payment</span>
                <b id="cfPay" style={{ color: 'var(--ink)' }}>
                  {placed.pay}
                </b>
              </div>
              <div
                className="row"
                style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}
              >
                <span>Delivery to</span>
                <b id="cfAddr" style={{ color: 'var(--ink)' }}>
                  {placed.addrLine}
                </b>
              </div>
              <div
                className="row"
                style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}
              >
                <span>Estimated delivery</span>
                <b id="cfEta" style={{ color: 'var(--ink)' }}>
                  {placed.eta}
                </b>
              </div>
              <div id="cfItems" style={{ marginTop: 10 }}>
                {placed.items.map((x, i) => (
                  <ItemRow key={i} x={x} />
                ))}
              </div>
              <div
                className="row total"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 17,
                  color: 'var(--ink)',
                  fontWeight: 700,
                  borderTop: '1px dashed var(--line)',
                  marginTop: 12,
                  paddingTop: 14,
                }}
              >
                <span>Total</span>
                <span id="cfTotal">{money(placed.total)}</span>
              </div>
              <p id="cfPayNote" style={{ fontSize: 14, color: 'var(--muted)', margin: '14px 0 0' }}>
                {placed.payNote}
              </p>
              <button className="btn block" data-nav="shop" style={{ marginTop: 18 }}>
                Continue shopping
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const zoneName = totals.zone ? ZONE_NAME[totals.zone] : '';
  const delText = !lines.length
    ? '-'
    : totals.freeFirst && !totals.freeAdmin
      ? 'Free (first order offer)'
      : totals.free
        ? 'Free \u00B7 offer'
        : totals.zone
          ? money(totals.zoneFee)
          : 'Enter address to calculate';

  return (
    <main>
      <div className="view" id="view-checkout">
        <div className="wrap">
          <div className="page-head">
            <h1>Checkout</h1>
            <p>
              Delivery anywhere in Bangladesh. Pay with Cash on Delivery, bKash, Nagad, Rocket,
              Upay or card. An account is needed to order.
            </p>
          </div>
          <form id="checkoutForm" onSubmit={onSubmit}>
            <div className="co-card" id="coAcctCard" style={{ marginBottom: 22 }}>
              <div id="coAcctGuest" hidden={!!user}>
                <h3 style={{ marginTop: 0 }}>An account is needed to order</h3>
                <p style={{ margin: '0 0 14px', color: 'var(--muted)' }}>
                  Sign in or create a free account to place your order. Your bag stays exactly as
                  it is - come back here and finish. Your account also gets free delivery on its
                  first order.
                </p>
                <button className="btn sm" type="button" data-nav="account">
                  Sign in or create account
                </button>
              </div>
              <div id="coAcctUser" hidden={!user}>
                <p style={{ margin: 0 }}>
                  Ordering as{' '}
                  <b id="coAcctWho" style={{ color: 'var(--ink)' }}>
                    {user ? user.name + (user.id ? ' \u00B7 ' + user.id : '') : ''}
                  </b>
                  <button
                    type="button"
                    id="coSignOut"
                    style={{
                      background: 'none',
                      border: 0,
                      padding: 0,
                      font: 'inherit',
                      color: 'var(--muted)',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      marginLeft: 10,
                    }}
                    onClick={signOut}
                  >
                    Sign out
                  </button>
                </p>
              </div>
            </div>
            <div className="co-grid">
              <div style={{ display: 'grid', gap: 22 }}>
                <div className="co-card">
                  <h3>1 {'\u00B7'} Delivery details</h3>
                  <div className="cform" style={{ display: 'grid', gap: 14 }}>
                    <label>
                      Full name
                      <input
                        required
                        id="coName"
                        placeholder="e.g. Arif Rahman"
                        value={co.name}
                        onChange={(e) => co.setName(e.target.value)}
                      />
                    </label>
                    <label>
                      Mobile number
                      <input
                        required
                        id="coPhone"
                        type="tel"
                        placeholder="01XXXXXXXXX"
                        value={co.phone}
                        onChange={(e) => co.setPhone(e.target.value)}
                      />
                    </label>
                    <label>
                      Email (optional)
                      <input
                        id="coEmail"
                        type="email"
                        placeholder="you@example.com"
                        value={co.email}
                        onChange={(e) => co.setEmail(e.target.value)}
                      />
                    </label>
                    <label>
                      Full address
                      <textarea
                        required
                        id="coAddr"
                        rows={3}
                        placeholder="House, road, area, thana"
                        value={co.addr}
                        onChange={(e) => co.setAddr(e.target.value)}
                      />
                    </label>
                    <div
                      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}
                    >
                      <label>
                        District
                        <input
                          required
                          id="coCity"
                          placeholder="e.g. Dhaka"
                          value={co.city}
                          onChange={(e) => co.setCity(e.target.value)}
                        />
                      </label>
                      <label>
                        Delivery note
                        <input
                          id="coNote"
                          placeholder="Optional"
                          value={co.note}
                          onChange={(e) => co.setNote(e.target.value)}
                        />
                      </label>
                    </div>
                  </div>
                </div>
                <div className="co-card">
                  <h3>2 {'\u00B7'} Payment method</h3>
                  <div className="payopts" id="payOpts">
                    {PAY_OPTIONS.map((o) => (
                      <button
                        key={o.pay}
                        type="button"
                        className={'payopt' + (co.payMethod === o.pay ? ' on' : '')}
                        data-pay={o.pay}
                        onClick={() => co.setPayMethod(o.pay)}
                      >
                        <span className="dot"></span>
                        <span>
                          <b>{o.label}</b>
                          <span>{o.desc}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '16px 0 0' }}>
                    Payment step placeholder: on the live store this connects to the payment
                    gateway; for mobile banking you receive our number with your order
                    confirmation and use your order number as the reference.
                  </p>
                </div>
              </div>
              <div className="co-card">
                <h3>Order summary</h3>
                <div id="coItems">
                  {lines.length ? (
                    lines.map((x) => <ItemRow key={x.key} x={toPlaced(x)} />)
                  ) : (
                    <p style={{ color: 'var(--muted)' }}>Your bag is empty - add a piece first.</p>
                  )}
                </div>
                <div style={{ marginTop: 14 }}>
                  <div
                    className="row"
                    style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}
                  >
                    <span>Subtotal</span>
                    <span id="coSub">{money(totals.sub)}</span>
                  </div>
                  <div
                    className="row"
                    style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}
                  >
                    <span id="coDelLabel">
                      {zoneName ? 'Delivery \u00B7 ' + zoneName : 'Delivery'}
                    </span>
                    <span id="coDel">{delText}</span>
                  </div>
                  <div
                    className="row"
                    id="coFirstNote"
                    hidden={!(lines.length && totals.freeFirst && !totals.freeAdmin)}
                    style={{ display: 'flex', padding: '2px 0' }}
                  >
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                      Free delivery applied - first order offer
                    </span>
                  </div>
                  <div
                    className="row"
                    id="coCodRow"
                    hidden={!totals.codFee}
                    style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}
                  >
                    <span>COD charge</span>
                    <span id="coCod">{money(totals.codFee)}</span>
                  </div>
                  <div
                    className="row total"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 17,
                      color: 'var(--ink)',
                      fontWeight: 700,
                      borderTop: '1px dashed var(--line)',
                      marginTop: 10,
                      paddingTop: 14,
                    }}
                  >
                    <span>Total</span>
                    <span id="coTotal">{money(totals.total)}</span>
                  </div>
                </div>
                <button
                  className="btn block"
                  type="submit"
                  id="placeOrder"
                  style={{ marginTop: 18 }}
                  disabled={!lines.length}
                >
                  Place order
                </button>
                <div
                  className="trustrow"
                  style={{ borderTop: 0, marginTop: 16, paddingTop: 0 }}
                >
                  <span>
                    <svg className="icon" viewBox="0 0 24 24">
                      <rect x="4" y="10" width="16" height="10" rx="2" />
                      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                    </svg>
                    Secure checkout
                  </span>
                  <span>
                    <svg className="icon" viewBox="0 0 24 24">
                      <path d="M4 9a8 8 0 0 1 14-3l2 2M20 15a8 8 0 0 1 14 3l-2-2" />
                      <path d="M20 4v4h-4M4 20v-4h4" />
                    </svg>
                    Free size exchange
                  </span>
                </div>
                <div className="pdlinks">
                  <button type="button" data-nav="shipping">
                    Shipping &amp; delivery
                  </button>
                  <button type="button" data-nav="returns">
                    Returns &amp; exchanges
                  </button>
                  <button type="button" data-nav="faq">
                    FAQ
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
