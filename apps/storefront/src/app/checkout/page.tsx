/* Checkout route. The legacy hash router reached the checkout
   view as #/checkout; here it is the /checkout route. Title and
   description are the legacy SEO_PAGES.checkout pair. Placing an
   order swaps the view to the legacy confirmation in place, the
   way the legacy go('confirmation') did. */

import type { Metadata } from 'next';
import CheckoutView from '../../components/checkout/CheckoutView';

export const metadata: Metadata = {
  title: 'Checkout - Dostelo',
  description:
    'Checkout at DOSTELO: delivery anywhere in Bangladesh, pay with Cash on Delivery, bKash, Nagad, Rocket, Upay or card.',
};

export default function CheckoutPage() {
  return <CheckoutView />;
}
