'use client';

/* Loyalty, public side. Balance, tier, referral code, recent
   transactions and redemption options all come from the API
   (GET /v1/loyalty/me); nothing is computed or promised on the
   client. Honest states: signed out (sign in first), no points
   yet (empty state), redemption not configured (the API returns
   no options, and the panel says so), API unavailable (a plain
   note, no invented balance), and rate limited on redeem. */

import { useEffect, useState } from 'react';
import { useAccount } from '../../features/account/AccountProvider';
import { getMyLoyalty, redeemReward, type LoyaltyView } from '../../lib/publicApi';
import { money } from '../../lib/format';

export default function LoyaltyPanel() {
  const { user } = useAccount();
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const [view, setView] = useState<LoyaltyView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) {
      setState('idle');
      setView(null);
      return;
    }
    let live = true;
    setState('loading');
    getMyLoyalty().then((r) => {
      if (!live) return;
      if (r.ok) {
        setView(r.data);
        setState('ready');
      } else {
        setState('unavailable');
      }
    });
    return () => {
      live = false;
    };
  }, [user]);

  async function redeem(rewardId: string) {
    setBusy(true);
    setNotice(null);
    const r = await redeemReward(rewardId);
    setBusy(false);
    if (r.ok) {
      setNotice('Reward redeemed. Your redemption code is ' + r.data.code + '.');
      const again = await getMyLoyalty();
      if (again.ok) setView(again.data);
    } else if (r.kind === 'rate-limited') {
      setNotice('Too many attempts in a short time. Please wait a little and try again.');
    } else {
      setNotice(r.message);
    }
  }

  if (!user) {
    return (
      <div className="co-card" style={{ marginTop: 20 }}>
        <h3>Loyalty points</h3>
        <p>Sign in to see your points balance, tier and referral code.</p>
      </div>
    );
  }
  return (
    <div className="co-card" style={{ marginTop: 20 }}>
      <h3>Loyalty points</h3>
      {state === 'loading' ? <p>Loading your points.</p> : null}
      {state === 'unavailable' ? (
        <p>
          Your points could not be loaded because the store service did not answer. No balance is
          shown rather than a made up one.
        </p>
      ) : null}
      {state === 'ready' && view ? (
        <>
          <p>
            <b>{view.account.balance} points</b>
            {' · Lifetime earned: '}
            {view.account.lifetimePoints}
            {' · Tier: '}
            {view.account.tier.name}
          </p>
          {view.account.balance === 0 ? (
            <p>Points appear here after a delivered order earns them.</p>
          ) : null}
          {view.account.referralCode ? (
            <p>
              Your referral code: <b>{view.account.referralCode}</b>. Share it with a friend;
              when their first order is delivered, the points the store rules give are added
              here.
            </p>
          ) : (
            <p>No referral code has been issued for your account yet.</p>
          )}
          {view.account.transactions.length > 0 ? (
            <>
              <b>Recent activity</b>
              {view.account.transactions.slice(0, 8).map((t) => (
                <p key={t.id}>
                  {t.points > 0 ? '+' : ''}
                  {t.points} points · {t.reason} ·{' '}
                  {new Date(t.createdAt).toLocaleDateString('en-GB')}
                </p>
              ))}
            </>
          ) : null}
          <b>Redeem</b>
          {view.rewards.length === 0 ? (
            <p>Redemption is not open on the store right now, so points cannot be spent yet.</p>
          ) : (
            view.rewards.map((o) => (
              <p key={o.id}>
                {o.name}: {o.pointsCost} points
                {o.discountMinor > 0 ? ' for ' + money(Math.round(o.discountMinor / 100)) + ' off' : ''}
                {'. '}
                <button
                  className="btn sm"
                  type="button"
                  disabled={busy || view.account.balance < o.pointsCost}
                  onClick={() => redeem(o.id)}
                >
                  Redeem
                </button>
              </p>
            ))
          )}
          {notice ? <p role="status">{notice}</p> : null}
        </>
      ) : null}
    </div>
  );
}
