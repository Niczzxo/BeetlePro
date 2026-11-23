/* Recovery link route (Phase 6, architecture addition: the
   legacy site has no recovery links). The token in the path is
   the credential for the API's public recovery read; the page
   itself is not indexed, since the link is personal. */

import type { Metadata } from 'next';
import RecoverView from '../../../components/recover/RecoverView';

export const metadata: Metadata = {
  title: 'Your saved bag | DOSTELO',
  description:
    'The pieces you left behind, kept for you at current prices.',
  robots: { index: false, follow: false },
};

export default async function RecoverPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <RecoverView token={token} />;
}
