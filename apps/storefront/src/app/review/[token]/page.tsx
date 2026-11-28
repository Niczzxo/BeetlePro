/* Signed review request route: the link sent to a customer
   after delivery lands here. Personal and signed, so it is never
   indexed. The view verifies the token with the API before
   showing any form. */

import type { Metadata } from 'next';
import ReviewRequestView from '../../../components/review/ReviewRequestView';

export const metadata: Metadata = {
  title: 'Review Your Purchase - Dostelo',
  description: 'Review a Dostelo piece you bought, through your personal review link.',
  robots: { index: false, follow: false },
};

export default async function ReviewRequestPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ReviewRequestView token={token} />;
}
