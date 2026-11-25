import type { MetadataRoute } from 'next';
import { SITE_URL } from '../lib/seo';

/* Built-in sitemap for the migrated storefront, the port
   counterpart of the live site's root sitemap.xml. The live
   file lists only its root because that site is a single-page
   app; this app has real routes, so the crawlable public
   routes are listed under the storefront's canonical origin
   (SITE_URL in lib/seo.ts, https://dostelo-one.vercel.app).
   Product and article pages are dynamic per item and are
   covered by their index routes here. */
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
  ];
  return routes.map((r) => ({
    url: SITE_URL + r.path,
    lastModified,
    changeFrequency: 'weekly',
    priority: r.priority,
  }));
}
