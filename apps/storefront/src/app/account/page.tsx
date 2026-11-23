/* Account route. The legacy hash router reached the account
   view as #/account; here it is the /account route. Title and
   description are the legacy SEO_PAGES.account pair. */

import type { Metadata } from 'next';
import AccountView from '../../components/account/AccountView';

export const metadata: Metadata = {
  title: 'Your Account - Dostelo',
  description: 'Sign in to DOSTELO for faster checkout, order tracking and easy size exchanges.',
};

export default function AccountPage() {
  return <AccountView />;
}
