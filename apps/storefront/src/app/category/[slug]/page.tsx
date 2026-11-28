/* Category route from the public page map
   (docs/PUBLIC_STOREFRONT.md). It renders the shop view locked to
   the one category, with the legacy applySEO() category rule for
   its metadata and breadcrumb structured data. An unknown slug
   is a real 404, never a silent fallback to All. */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ShopView from '../../../components/shop/ShopView';
import { categories } from '../../../data/products';
import { categoryBySlug, slugify } from '../../../lib/slugs';
import { SITE_URL, seoMetadata, shopSeo } from '../../../lib/seo';

export function generateStaticParams() {
  return categories.map((c) => ({ slug: slugify(c.name) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const cat = categoryBySlug(slug);
  if (!cat) return {};
  const meta = seoMetadata(shopSeo(cat, ''));
  meta.alternates = { canonical: SITE_URL + '/category/' + slugify(cat) };
  return meta;
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cat = categoryBySlug(slug);
  if (!cat) notFound();
  const crumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL + '/' },
      { '@type': 'ListItem', position: 2, name: 'Shop', item: SITE_URL + '/shop' },
      {
        '@type': 'ListItem',
        position: 3,
        name: cat,
        item: SITE_URL + '/category/' + slugify(cat),
      },
    ],
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(crumb) }}
      />
      <ShopView key={cat} initialCat={cat} initialQuery="" />
    </>
  );
}
