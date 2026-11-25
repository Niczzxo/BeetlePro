/* Policy routes, the legacy help views (#view-shipping,
   #view-returns, #view-warranty, #view-faq) plus the privacy,
   #view-terms and #view-refund routes added with the legal
   wiring, all under /policies/<slug>. Each carries its legacy
   SEO_PAGES title and description. Unknown slugs 404
   (dynamicParams off).
   Legal wiring: every slug except faq maps to a legal
   document in the API (POLICY_LEGAL_SLUGS). The page renders
   the published document when one exists and the static port
   content otherwise. Pages render per request (force-dynamic)
   and the document is fetched with no-store, so publishing or
   unpublishing in the admin portal takes effect on the next
   request with no rebuild. This applies only to this Next.js
   storefront; the static GitHub Pages site never reads the
   API and keeps its built-in policy text. */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  POLICY_LEGAL_SLUGS,
  POLICY_SLUGS,
  POLICY_VIEWS,
  PublishedPolicyView,
  type PolicySlug,
} from '../../../components/policies/PolicyViews';
import { getPublishedLegalDocument } from '../../../lib/legal';
import { SEO_PAGES, seoMetadata } from '../../../lib/seo';

export const dynamic = 'force-dynamic';

export function generateStaticParams() {
  return POLICY_SLUGS.map((slug) => ({ slug }));
}

export const dynamicParams = false;

function isPolicySlug(slug: string): slug is PolicySlug {
  return (POLICY_SLUGS as readonly string[]).includes(slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!isPolicySlug(slug)) return {};
  return seoMetadata(SEO_PAGES[slug]);
}

export default async function PolicyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isPolicySlug(slug)) notFound();
  const legalSlug = POLICY_LEGAL_SLUGS[slug];
  if (legalSlug) {
    const doc = await getPublishedLegalDocument(legalSlug);
    if (doc) return <PublishedPolicyView slug={slug} doc={doc} />;
  }
  const View = POLICY_VIEWS[slug];
  return <View />;
}
