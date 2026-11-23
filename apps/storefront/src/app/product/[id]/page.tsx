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
import { productSeo, seoMetadata } from '../../../lib/seo';

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
  return seoMetadata(productSeo(p));
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
  return <ProductDetail key={p.id} product={p} related={related} />;
}
