/* Cart route from the public page map. Personal page, so it is
   not indexed and carries no catalogue metadata beyond its title. */

import type { Metadata } from 'next';
import CartView from '../../components/cart/CartView';

export const metadata: Metadata = {
  title: 'Your Bag - Dostelo',
  description: 'Your Dostelo bag: pieces, quantities and totals before checkout.',
  robots: { index: false, follow: false },
};

export default function CartPage() {
  return <CartView />;
}
