/* Product route. The legacy router reached the product view as
   #/product/<id>; here each of the 22 catalogue products gets a
   static route. Unknown ids 404 (dynamicParams is off): the
   legacy openProduct() fell back to the first product because
   its hash router had no 404, which a routed site should not
   copy. The related row follows the legacy rule: the rest of
   the product's own category first, then everything else,
   four pieces. The detail component remounts per product, the
   way openProduct() reset quantity, colour and size on every
   open. Metadata follows the legacy applySEO() product rule:
   "<name> - <money(price)> | Dostelo" with the product
   description (see src/lib/seo.ts). */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ProductDetail from '../../../components/product/ProductDetail';
import { byId, products } from '../../../data/products';
import { SITE_URL, productSeo, seoMetadata } from '../../../lib/seo';
import { slugify } from '../../../lib/slugs';

export function generateStaticParams() {
  return products.map((p) => ({ id: p.id }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const p = byId(id);
  if (!p) return {};
  return seoMetadata(productSeo(p), '/product/' + p.id);
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const p = byId(id);
  if (!p) notFound();
  const related = products
    .filter((x) => x.id !== p.id && x.cat === p.cat)
    .concat(products.filter((x) => x.id !== p.id && x.cat !== p.cat))
    .slice(0, 4);
  /* Product and breadcrumb structured data, from the catalogue
     record itself: price in taka, stock as availability, the
     product photo (seed path or an uploaded API URL, both render
     through the same src). No aggregateRating is emitted: ratings
     come from the reviews API at runtime and a static rating here
     would be invented. */
  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: p.desc,
    image: [p.img.startsWith('http') ? p.img : SITE_URL + p.img],
    category: p.cat,
    offers: {
      '@type': 'Offer',
      url: SITE_URL + '/product/' + p.id,
      priceCurrency: 'BDT',
      price: p.price,
      availability:
        p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  };
  const crumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL + '/' },
      {
        '@type': 'ListItem',
        position: 2,
        name: p.cat,
        item: SITE_URL + '/category/' + slugify(p.cat),
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: p.name,
        item: SITE_URL + '/product/' + p.id,
      },
    ],
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbLd) }}
      />
      <ProductDetail key={p.id} product={p} related={related} />
    </>
  );
}
