'use client';

/* Orders, returns and exchanges, public side. The order list
   comes from the API (GET /v1/customers/me/orders) exactly as the
   API returns it: statuses, totals and any replacement order an
   approved exchange created are the API's words, never the
   client's. A signed-in customer opens a return or exchange from
   an order, with an optional evidence photo uploaded through the
   API upload system first, and sees each request with its status
   from GET /v1/returns/mine. Honest states throughout: signed
   out, no orders yet, no requests yet, API unavailable, and rate
   limited. The legacy per-account order count on the account
   page is a different, local record and is not presented here as
   order history. */

import { useEffect, useState, type FormEvent } from 'react';
import type { ReturnRequest } from '@dostelo/types';
import { useAccount } from '../../features/account/AccountProvider';
import {
  RETURN_STATUS_LABELS_PUBLIC,
  createReturn,
  getMyOrders,
  getMyReturns,
  uploadFile,
  type CustomerOrder,
} from '../../lib/publicApi';
import { money } from '../../lib/format';

const REASONS: { value: string; label: string }[] = [
  { value: 'wrong-size', label: 'Wrong size' },
  { value: 'defective', label: 'Defective' },
  { value: 'wrong-item', label: 'Wrong item' },
  { value: 'damaged-in-delivery', label: 'Damaged during delivery' },
  { value: 'not-as-described', label: 'Not as described' },
  { value: 'changed-mind', label: 'Changed mind' },
  { value: 'other', label: 'Other' },
];

export default function ReturnsPanel() {
  const { user } = useAccount();
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) {
      setState('idle');
      return;
    }
    let live = true;
    setState('loading');
    Promise.all([getMyOrders(), getMyReturns()]).then(([o, r]) => {
      if (!live) return;
      if (o.ok) setOrders(o.data.items);
      if (r.ok) setReturns(r.data.items);
      setState(o.ok || r.ok ? 'ready' : 'unavailable');
    });
    return () => {
      live = false;
    };
  }, [user]);

  async function onCreate(e: FormEvent<HTMLFormElement>, order: CustomerOrder) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const itemId = String(f.get('item') ?? '');
    const qty = Number(f.get('qty') ?? 1);
    if (!itemId) {
      setNotice('Choose the piece you want to send back.');
      return;
    }
    setBusy(true);
    setNotice(null);
    let evidenceUrl: string | undefined;
    const file = f.get('evidence');
    if (file instanceof File && file.size > 0) {
      const up = await uploadFile(file);
      if (!up.ok) {
        setBusy(false);
        setNotice(up.message + ' The request was not sent; please try again without the photo, or once more in a moment.');
        return;
      }
      evidenceUrl = up.data.url;
    }
    const kind = String(f.get('kind') ?? 'refund') as 'refund' | 'exchange';
    const r = await createReturn({
      orderNumber: order.orderNumber,
      kind,
      reason: String(f.get('reason') ?? '') || undefined,
      note: String(f.get('note') ?? '') || undefined,
      resolutionType: kind === 'exchange' ? 'exchange' : 'refund',
      evidenceUrl,
      items: [{ orderItemId: itemId, quantity: qty }],
    });
    setBusy(false);
    if (r.ok) {
      setReturns((prev) => [r.data, ...prev]);
      setOpenFor(null);
      setNotice('Your request was sent. Its status will update on this page as the workshop works on it.');
    } else if (r.kind === 'rate-limited') {
      setNotice('Too many attempts in a short time. Please wait a little and try again.');
    } else {
      setNotice(r.message);
    }
  }

  if (!user) {
    return (
      <div className="co-card" style={{ marginTop: 20 }}>
        <h3>Your orders</h3>
        <p>Sign in from the account page to see your orders and open a return or exchange.</p>
      </div>
    );
  }
  return (
    <div className="co-card" style={{ marginTop: 20 }}>
      <h3>Your orders</h3>
      {state === 'loading' ? <p>Loading your orders.</p> : null}
      {state === 'unavailable' ? (
        <p>
          Your orders could not be loaded because the store service did not answer. Nothing is
          shown rather than a made up history.
        </p>
      ) : null}
      {state === 'ready' && orders.length === 0 ? (
        <p>No orders are recorded for your account yet. Orders you place will appear here.</p>
      ) : null}
      {state === 'ready'
        ? orders.map((o) => (
            <div key={o.orderNumber} style={{ marginBottom: 18 }}>
              <p>
                <b>{o.orderNumber}</b> · {o.status} · {money(Math.round(o.totalMinor / 100))} ·{' '}
                {new Date(o.createdAt).toLocaleDateString('en-GB')}
              </p>
              {o.replacementOrderNumber ? (
                <p>
                  Replacement order for your approved exchange: <b>{o.replacementOrderNumber}</b>
                </p>
              ) : null}
              {o.items.map((it) => (
                <p key={it.id}>
                  {it.productName}
                  {it.variantName ? ' · ' + it.variantName : ''} · Qty {it.quantity}
                </p>
              ))}
              <button
                className="btn sm light"
                type="button"
                onClick={() => setOpenFor(openFor === o.orderNumber ? null : o.orderNumber)}
              >
                Return or exchange
              </button>
              {openFor === o.orderNumber ? (
                <form className="cform" style={{ marginTop: 14 }} onSubmit={(e) => onCreate(e, o)}>
                  <label>
                    Piece
                    <select name="item" required>
                      {o.items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.productName}
                          {it.variantName ? ' · ' + it.variantName : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Quantity
                    <input name="qty" type="number" min={1} defaultValue={1} required />
                  </label>
                  <label>
                    I want to
                    <select name="kind">
                      <option value="refund">Return it for a refund</option>
                      <option value="exchange">Exchange it</option>
                    </select>
                  </label>
                  <label>
                    Reason
                    <select name="reason">
                      {REASONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Note for the workshop
                    <textarea name="note" rows={3} maxLength={1000} />
                  </label>
                  <label>
                    Evidence photo (optional)
                    <input name="evidence" type="file" accept="image/*" />
                  </label>
                  <button className="btn block" type="submit" disabled={busy}>
                    {busy ? 'Sending.' : 'Send request'}
                  </button>
                </form>
              ) : null}
            </div>
          ))
        : null}
      {notice ? <p role="status">{notice}</p> : null}
      <h3 style={{ marginTop: 24 }}>Your return and exchange requests</h3>
      {state === 'ready' && returns.length === 0 ? (
        <p>No requests yet. When you open one from an order above, its status shows here.</p>
      ) : null}
      {returns.map((r) => (
        <p key={r.id}>
          <b>{orders.find((o) => o.orderNumber === r.orderId)?.orderNumber ?? r.orderId}</b> ·{' '}
          {r.kind === 'exchange' ? 'Exchange' : 'Return'} ·{' '}
          {RETURN_STATUS_LABELS_PUBLIC[r.status] ?? r.status} ·{' '}
          {new Date(r.createdAt).toLocaleDateString('en-GB')}
          {r.replacementOrderId ? ' · Replacement order created by the approved exchange' : ''}
        </p>
      ))}
    </div>
  );
}
