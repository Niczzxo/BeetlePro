import type { MetadataRoute } from 'next';
import { SITE_URL } from '../lib/seo';
import { articles, categories, products } from '../data/products';
import { collections, slugify } from '../lib/slugs';

/* Sitemap for the rebuilt storefront: every crawlable public
   route, including the per-product, per-category, per-collection
   and per-article pages. Personal routes (cart, checkout,
   account, orders, recover, review links) are excluded here and
   disallowed in robots.txt. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const routes: { path: string; priority: number }[] = [
    { path: '/', priority: 1.0 },
    { path: '/shop', priority: 0.9 },
    { path: '/collections', priority: 0.7 },
    { path: '/journal', priority: 0.6 },
    { path: '/about', priority: 0.5 },
    { path: '/contact', priority: 0.5 },
    { path: '/policies/shipping', priority: 0.3 },
    { path: '/policies/returns', priority: 0.3 },
    { path: '/policies/warranty', priority: 0.3 },
    { path: '/policies/faq', priority: 0.3 },
    { path: '/policies/privacy', priority: 0.3 },
    { path: '/policies/terms', priority: 0.3 },
    { path: '/policies/refund', priority: 0.3 },
  ];
  for (const c of categories) {
    routes.push({ path: '/category/' + slugify(c.name), priority: 0.8 });
  }
  for (const col of collections()) {
    routes.push({ path: '/collections/' + col.slug, priority: 0.6 });
  }
  for (const p of products) {
    routes.push({ path: '/product/' + p.id, priority: 0.8 });
  }
  for (const a of articles) {
    routes.push({ path: '/journal/' + a.id, priority: 0.5 });
  }
  return routes.map((r) => ({
    url: SITE_URL + r.path,
    lastModified,
    changeFrequency: 'weekly',
    priority: r.priority,
  }));
}
