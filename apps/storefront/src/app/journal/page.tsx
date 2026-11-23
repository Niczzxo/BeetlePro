/* Journal route, the legacy #view-journal: the page head and
   the #journalGrid of article cards (the legacy renders the
   same jHTML() cards here as in the home teaser). Title and
   description are the legacy SEO_PAGES.journal pair. */

import type { Metadata } from 'next';
import { articles } from '../../data/products';
import JournalCard from '../../components/journal/JournalCard';
import RevealSystem from '../../components/home/RevealSystem';
import { SEO_PAGES, seoMetadata } from '../../lib/seo';

export const metadata: Metadata = seoMetadata(SEO_PAGES.journal);

export default function JournalPage() {
  return (
    <main>
      <div className="view" id="view-journal">
        <div className="wrap">
          <div className="page-head">
            <h1>From the journal</h1>
            <p>
              Notes from the workshop - on fabric, fit, and building a small wardrobe that works
              hard.
            </p>
          </div>
          <div className="jgrid" id="journalGrid" style={{ marginTop: 36 }}>
            {articles.map((a, i) => (
              <JournalCard article={a} index={i} key={a.id} />
            ))}
          </div>
        </div>
        <RevealSystem />
      </div>
    </main>
  );
}
