/* Policy routes, the legacy help views (#view-shipping,
   #view-returns, #view-warranty, #view-faq) under
   /policies/<slug>. Each carries its legacy SEO_PAGES title
   and description. Unknown slugs 404 (dynamicParams off). */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { POLICY_SLUGS, POLICY_VIEWS, type PolicySlug } from '../../../components/policies/PolicyViews';
import { SEO_PAGES, seoMetadata } from '../../../lib/seo';

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
  const View = POLICY_VIEWS[slug];
  return <View />;
}
