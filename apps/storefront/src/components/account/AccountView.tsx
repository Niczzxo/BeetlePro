'use client';

/* Account view, a port of the legacy #view-account markup and
   renderAccount() with its sign-in, sign-up and sign-out
   handlers.

   Signed out: the tabbed forms. The legacy validation is the
   forms' own required attributes; the submits never check the
   password. Sign in builds the account from the typed
   identifier (name from the part before the @, id lowercased),
   sign up from the email when given, else the mobile number.
   Both land here, on the signed-in card, as renderAccount()
   leaves it.

   Signed in: the greeting uses the first name, the orders line
   reads the account's recorded order count from
   dostelo-orders-by-account (zero orders: the first-order free
   delivery line; otherwise the returning-customer line), and
   Back to checkout shows only while the bag has pieces, as the
   legacy hides #acctCheckout on an empty bag. The Your orders
   button keeps its data-help attribute and opens the help
   modal on the orders topic through NavSystem's delegation.

   The Store settings (admin) card renders only for the admin
   account (hello@dostelo.example), exactly as the legacy hides
   #adminCard for everyone else. Its Free delivery offer switch
   writes dostelo-free-delivery ('1' or '0', default off) and
   answers with the legacy toasts; after writing, the cart's
   totals re-read the switch so the drawer and checkout agree. */

import { useEffect, useState, type FormEvent } from 'react';
import { useAccount } from '../../features/account/AccountProvider';
import { useCart } from '../../features/cart/CartProvider';
import { useToast } from '../../features/toast/Toast';
import LoyaltyPanel from './LoyaltyPanel';
import ReturnsPanel from './ReturnsPanel';

export default function AccountView() {
  const { user, isAdmin, orderCount, signIn, signUp, signOut } = useAccount();
  const { lines, refreshFreeAdmin } = useCart();
  const { toast } = useToast();
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [fdOn, setFdOn] = useState(false);

  /* The legacy sets the switch from freeDeliveryOn() at load. */
  useEffect(() => {
    try {
      setFdOn(localStorage.getItem('dostelo-free-delivery') === '1');
    } catch {
      setFdOn(false);
    }
  }, []);

  function onSignIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    signIn(String(fd.get('siId') || ''));
  }

  function onSignUp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    signUp(String(fd.get('suName') || ''), String(fd.get('suEmail') || ''), String(fd.get('suPhone') || ''));
  }

  function onFdToggle(checked: boolean) {
    setFdOn(checked);
    try {
      localStorage.setItem('dostelo-free-delivery', checked ? '1' : '0');
    } catch {
      /* the legacy swallows storage errors here too */
    }
    refreshFreeAdmin();
    toast(
      checked
        ? 'Free delivery offer ON - all orders ship free'
        : 'Free delivery offer OFF - zone delivery charges apply',
    );
  }

  const ordersText = !user
    ? ''
    : orderCount === 0
      ? 'No orders yet with this account - your first order gets free delivery.'
      : 'You have placed ' +
        orderCount +
        (orderCount === 1 ? ' order' : ' orders') +
        ' with this account - a returning customer. The normal delivery rates apply from here.';

  return (
    <main>
      <div className="view" id="view-account">
        <div className="wrap">
          <div className="page-head">
            <h1>Your account</h1>
            <p>
              You need an account to place an order - it also gives you faster checkout, order
              tracking and size exchanges, and your first order gets free delivery.
            </p>
          </div>
          <div id="acctGuest" hidden={!!user} style={{ maxWidth: 520 }}>
            <div className="filters" style={{ marginTop: 0 }}>
              <button
                className={'fbtn' + (tab === 'signin' ? ' on' : '')}
                id="tabSignin"
                type="button"
                onClick={() => setTab('signin')}
              >
                Sign in
              </button>
              <button
                className={'fbtn' + (tab === 'signup' ? ' on' : '')}
                id="tabSignup"
                type="button"
                onClick={() => setTab('signup')}
              >
                Create account
              </button>
            </div>
            <form className="cform" id="signinForm" hidden={tab !== 'signin'} onSubmit={onSignIn}>
              <label>
                Mobile number or email
                <input required id="siId" name="siId" placeholder="01XXXXXXXXX or you@example.com" />
              </label>
              <label>
                Password
                <input required id="siPw" name="siPw" type="password" placeholder="Your password" />
              </label>
              <button className="btn block" type="submit">
                Sign in
              </button>
            </form>
            <form className="cform" id="signupForm" hidden={tab !== 'signup'} onSubmit={onSignUp}>
              <label>
                Full name
                <input required id="suName" name="suName" placeholder="e.g. Arif Rahman" />
              </label>
              <label>
                Mobile number
                <input required id="suPhone" name="suPhone" type="tel" placeholder="01XXXXXXXXX" />
              </label>
              <label>
                Email (optional)
                <input id="suEmail" name="suEmail" type="email" placeholder="you@example.com" />
              </label>
              <label>
                Password
                <input required id="suPw" name="suPw" type="password" placeholder="Choose a password" />
              </label>
              <button className="btn block" type="submit">
                Create account
              </button>
            </form>
            <p style={{ fontSize: 13.5, color: 'var(--muted)' }}>
              Accounts are kept on this device only and are never sent anywhere. Your orders are
              saved under your account, so we can tell your first order from a return visit.
            </p>
          </div>
          <div id="acctUser" hidden={!user} style={{ maxWidth: 640 }}>
            <div className="co-card">
              <h3 id="acctHello">
                {'Assalamu alaikum' + (user ? ', ' + user.name.split(' ')[0] : '')}
              </h3>
              <p style={{ margin: '0 0 8px' }}>
                You are signed in on this device. Your bag, wishlist and checkout details stay
                handy while you shop.
              </p>
              <p id="acctOrders" style={{ margin: '0 0 18px', color: 'var(--muted)' }}>
                {ordersText}
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  className="btn sm"
                  id="acctCheckout"
                  data-nav="checkout"
                  hidden={!lines.length}
                >
                  Back to checkout
                </button>
                <button className="btn sm" data-help="orders">
                  Your orders
                </button>
                <button
                  className="btn sm light"
                  style={{ border: '1px solid var(--line)' }}
                  data-nav="shop"
                >
                  Continue shopping
                </button>
                <button
                  className="btn sm light"
                  style={{ border: '1px solid var(--line)' }}
                  id="signOut"
                  onClick={signOut}
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
          <div hidden={!user} style={{ maxWidth: 640 }}>
            <ReturnsPanel />
            <LoyaltyPanel />
          </div>
          <div
            className="co-card"
            id="adminCard"
            hidden={!isAdmin}
            style={{ maxWidth: 640, marginTop: 22 }}
          >
            <h3>Store settings {'\u00B7'} admin</h3>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 18,
              }}
            >
              <span>
                <b style={{ color: 'var(--ink)', fontSize: 15 }}>Free delivery offer</b>
                <span
                  style={{
                    display: 'block',
                    fontSize: 13.5,
                    color: 'var(--muted)',
                    marginTop: 3,
                  }}
                >
                  Admin setting - when ON, all orders get free delivery, in every zone. The{' '}
                  {'\u09F3'}10 Cash on Delivery charge still applies on COD orders.
                </span>
              </span>
              <label className="switch">
                <input
                  type="checkbox"
                  id="freeDelToggle"
                  aria-label="Free delivery offer"
                  checked={fdOn}
                  onChange={(e) => onFdToggle(e.target.checked)}
                />
                <i></i>
              </label>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
