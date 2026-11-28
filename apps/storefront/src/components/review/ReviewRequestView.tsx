'use client';

/* Review request landing: the signed link sent after delivery.
   The token is verified by the API (GET /v1/reviews/request/:token),
   which answers with the product and order the link was issued
   for; the form posts back to the same signed route, so no
   account sign-in is needed and no other order can be reviewed
   through it. Honest states: an invalid or expired link says so
   plainly, a used link is answered by the API and its message is
   shown, rate limiting is worded as such, and success explains
   the moderation step. Nothing renders until the API confirms
   the link. */

import { useEffect, useState, type FormEvent } from 'react';
import {
  getReviewRequest,
  submitReviewRequest,
  type ReviewRequestView as ReviewRequestData,
} from '../../lib/publicApi';

export default function ReviewRequestView({ token }: { token: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'invalid' | 'unavailable'>('loading');
  const [data, setData] = useState<ReviewRequestData | null>(null);
  const [rating, setRating] = useState(5);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getReviewRequest(token).then((r) => {
      if (!live) return;
      if (r.ok) {
        setData(r.data);
        setState('ready');
      } else if (r.kind === 'not-found' || r.kind === 'rejected' || r.kind === 'unauthorized') {
        setState('invalid');
      } else {
        setState('unavailable');
      }
    });
    return () => {
      live = false;
    };
  }, [token]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setNotice(null);
    const r = await submitReviewRequest(token, {
      rating,
      title: String(f.get('title') ?? '') || undefined,
      body: String(f.get('body') ?? ''),
    });
    setBusy(false);
    if (r.ok) {
      setDone(true);
    } else if (r.kind === 'rate-limited') {
      setNotice('Too many attempts in a short time. Please wait a little and try again.');
    } else {
      setNotice(r.message);
    }
  }

  return (
    <main>
      <div className="view" id="view-review-request">
        <div className="wrap">
          <div className="page-head">
            <h1>Review your purchase</h1>
            <p>Tell other families how the piece worked out.</p>
          </div>
          {state === 'loading' ? <p style={{ marginTop: 36 }}>Checking your review link.</p> : null}
          {state === 'invalid' ? (
            <p style={{ marginTop: 36 }}>
              This review link is not valid. It may have expired or already been used. You can
              also review from the product page after signing in.
            </p>
          ) : null}
          {state === 'unavailable' ? (
            <p style={{ marginTop: 36 }}>
              The store service did not answer, so your link could not be checked. Please try
              again in a little while.
            </p>
          ) : null}
          {state === 'ready' && data && !done ? (
            <div className="co-card" style={{ marginTop: 36, maxWidth: 640 }}>
              <h3>{data.productName}</h3>
              <p>
                Order {data.orderNumber} · reviewing as {data.customerName}
              </p>
              <form className="cform" onSubmit={onSubmit} style={{ marginTop: 16 }}>
                <label>
                  Your rating
                  <span>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <button
                        key={i}
                        type="button"
                        aria-label={i + ' stars'}
                        aria-pressed={rating === i}
                        onClick={() => setRating(i)}
                        style={{ opacity: rating >= i ? 1 : 0.3, fontSize: 22 }}
                      >
                        ★
                      </button>
                    ))}
                  </span>
                </label>
                <label>
                  Headline
                  <input name="title" maxLength={160} />
                </label>
                <label>
                  Your review
                  <textarea name="body" required rows={4} maxLength={3000} />
                </label>
                {notice ? <p role="status">{notice}</p> : null}
                <button className="btn block" type="submit" disabled={busy}>
                  {busy ? 'Sending.' : 'Post review'}
                </button>
              </form>
            </div>
          ) : null}
          {done ? (
            <p style={{ marginTop: 36 }} role="status">
              Thank you. Your review was received and is waiting for moderation before it appears
              on the product page.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
