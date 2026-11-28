'use client';

/* Product reviews, public side. The list, the rating summary and
   the verified badges all come from the API (GET /v1/reviews):
   nothing is averaged or counted on the client, and no static
   rating is shown in its place. States, all honest:
   - loading: a plain loading line while the API answers.
   - no reviews yet: an explicit empty state, no stars summary.
   - API unreachable or endpoint not live: an unavailable note,
     and the rest of the product page is unaffected.
   - submit: signed-in customers post with the form; the API
     enforces the verified purchase rule server-side, so a
     not-purchased answer (403 or a rejected verification) is
     shown worded as the API returned it, never hidden. Signed
     out visitors are told to sign in and where. A submitted
     review enters moderation, and the success state says so. */

import { useEffect, useState, type FormEvent } from 'react';
import type { ProductReview } from '@dostelo/types';
import { useAccount } from '../../features/account/AccountProvider';
import {
  getProductReviews,
  submitReview,
  type ReviewSummary,
} from '../../lib/publicApi';

function Stars({ n }: { n: number }) {
  return (
    <span aria-label={n + ' out of 5 stars'} style={{ letterSpacing: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} aria-hidden="true" style={{ opacity: i <= n ? 1 : 0.25 }}>
          ★
        </span>
      ))}
    </span>
  );
}

export default function ReviewsSection({ productId }: { productId: string }) {
  const { user } = useAccount();
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [items, setItems] = useState<ProductReview[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [rating, setRating] = useState(5);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getProductReviews(productId).then((r) => {
      if (!live) return;
      if (r.ok) {
        setItems(r.data.items);
        setSummary(r.data.summary);
        setState('ready');
      } else {
        setState('unavailable');
      }
    });
    return () => {
      live = false;
    };
  }, [productId]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setNotice(null);
    const r = await submitReview({
      productId,
      rating,
      title: String(f.get('title') ?? '') || undefined,
      body: String(f.get('body') ?? ''),
      orderNumber: String(f.get('orderNumber') ?? '') || undefined,
    });
    setBusy(false);
    if (r.ok) {
      setNotice(
        'Thank you. Your review was received and is waiting for moderation before it appears here.',
      );
      e.currentTarget.reset();
      setRating(5);
    } else if (r.kind === 'unauthorized') {
      setNotice('Please sign in from the account page first, then post your review.');
    } else if (r.kind === 'rate-limited') {
      setNotice('Too many attempts in a short time. Please wait a little and try again.');
    } else {
      setNotice(r.message);
    }
  }

  return (
    <section className="wrap" aria-label="Reviews" style={{ marginTop: 48 }}>
      <div className="sec-head">
        <h2>Reviews</h2>
      </div>
      {state === 'loading' ? <p>Loading reviews.</p> : null}
      {state === 'unavailable' ? (
        <p>Reviews are not available right now. The store service did not answer, so no rating is shown rather than a made up one.</p>
      ) : null}
      {state === 'ready' && summary && summary.count > 0 ? (
        <p>
          <Stars n={Math.round(summary.average)} />{' '}
          <b>{summary.average.toFixed(1)} average</b> from {summary.count}{' '}
          {summary.count === 1 ? 'review' : 'reviews'}
        </p>
      ) : null}
      {state === 'ready' && items.length === 0 ? (
        <p>No reviews yet for this piece. If you have bought it, yours can be the first.</p>
      ) : null}
      {state === 'ready'
        ? items.map((r) => (
            <article className="review" key={r.id} style={{ marginBottom: 16 }}>
              <div className="rhead">
                <Stars n={r.rating} />
                {r.verified ? <b>Verified purchase</b> : null}
              </div>
              {r.title ? <b>{r.title}</b> : null}
              <p>{r.body}</p>
              <span>{new Date(r.createdAt).toLocaleDateString('en-GB')}</span>
            </article>
          ))
        : null}

      <div className="co-card" style={{ marginTop: 24 }}>
        <h3>Write a review</h3>
        {!user ? (
          <p>
            Sign in from the account page to review a piece you have bought. Reviews are checked
            against delivered orders by the store, so only buyers can review.
          </p>
        ) : (
          <form className="cform" onSubmit={onSubmit}>
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
              Order number (helps the store verify your purchase)
              <input name="orderNumber" maxLength={40} placeholder="For example BP-123456" />
            </label>
            <label>
              Headline
              <input name="title" maxLength={160} />
            </label>
            <label>
              Your review
              <textarea name="body" required maxLength={3000} rows={4} />
            </label>
            {notice ? <p role="status">{notice}</p> : null}
            <button className="btn block" type="submit" disabled={busy}>
              {busy ? 'Sending.' : 'Post review'}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
