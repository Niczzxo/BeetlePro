/* Orders route from the public page map: customer order history
   with returns and exchanges (ReturnsPanel) and loyalty
   (LoyaltyPanel), all read from the API with honest signed-out,
   empty and unavailable states. Personal page, not indexed. */

import type { Metadata } from 'next';
import LoyaltyPanel from '../../components/account/LoyaltyPanel';
import ReturnsPanel from '../../components/account/ReturnsPanel';

export const metadata: Metadata = {
  title: 'Your Orders - Dostelo',
  description: 'Your Dostelo order history, return and exchange requests, and loyalty points.',
  robots: { index: false, follow: false },
};

export default function OrdersPage() {
  return (
    <main>
      <div className="view" id="view-orders">
        <div className="wrap">
          <div className="page-head">
            <h1>Your orders</h1>
            <p>Order history, returns and exchanges, and your loyalty points.</p>
          </div>
          <ReturnsPanel />
          <LoyaltyPanel />
        </div>
      </div>
    </main>
  );
}
