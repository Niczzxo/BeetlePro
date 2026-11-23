/* Collections route, the legacy #view-collections: the page
   head and the category cards rendered into #catGrid2 (the
   legacy renders the same catHTML() grid here as on the home
   view). The legacy has no per-collection view or route: its
   hash router knows only #/collections, and the cards lead to
   the shop filtered by category. So this port is the single
   collections page, with no [slug] variant invented. Title
   and description are the legacy SEO_PAGES.collections pair. */

import type { Metadata } from 'next';
import CategoryCards from '../../components/home/CategoryCards';
import RevealSystem from '../../components/home/RevealSystem';
import { SEO_PAGES, seoMetadata } from '../../lib/seo';

export const metadata: Metadata = seoMetadata(SEO_PAGES.collections);

export default function CollectionsPage() {
  return (
    <main>
      <div className="view" id="view-collections">
        <div className="wrap">
          <div className="page-head">
            <h1>Collections</h1>
            <p>
              Small collections, one idea: honest fabrics, fits that match real boys, and prices
              that stay fair in taka.
            </p>
          </div>
          <CategoryCards id="catGrid2" style={{ marginTop: 36 }} />
        </div>
        <RevealSystem />
      </div>
    </main>
  );
}
