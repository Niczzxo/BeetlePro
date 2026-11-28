/* Collection detail route from the public page map
   (docs/PUBLIC_STOREFRONT.md). Collections are real slices of the
   catalogue computed in lib/slugs.ts (on offer, new in,
   bestsellers, and one per category); the page carries the same
   page head and product grid as the rest of the store, with
   loading-free static rendering, an honest empty state, and a
   real 404 for an unknown slug. */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ProductCard from '../../../components/home/ProductCard';
import RevealSystem from '../../../components/home/RevealSystem';
import { collectionBySlug, collections } from '../../../lib/slugs';
import { SITE_URL, seoMetadata } from '../../../lib/seo';

export function generateStaticParams() {
  return collections().map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const col = collectionBySlug(slug);
  if (!col) return {};
  const meta = seoMetadata({
    title: col.title + ' - Dostelo',
    desc: col.blurb + ' Delivery across Bangladesh and free size exchange within 7 days.',
  });
  meta.alternates = { canonical: SITE_URL + '/collections/' + col.slug };
  return meta;
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const col = collectionBySlug(slug);
  if (!col) notFound();
  return (
    <main>
      <div className="view" id="view-collection">
        <div className="wrap">
          <div className="page-head">
            <h1>{col.title}</h1>
            <p>{col.blurb}</p>
          </div>
          {col.items.length === 0 ? (
            <p style={{ marginTop: 36 }}>
              Nothing is in this collection right now. Please look at the full shop instead.
            </p>
          ) : (
            <div className="grid" style={{ marginTop: 36 }}>
              {col.items.map((p) => (
                <ProductCard product={p} key={p.id} />
              ))}
            </div>
          )}
        </div>
        <RevealSystem />
      </div>
    </main>
  );
}
