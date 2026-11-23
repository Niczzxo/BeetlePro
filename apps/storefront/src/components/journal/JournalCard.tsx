/* Journal card, the legacy jHTML() rendered into both
   #homeJournal (home teaser) and #journalGrid (journal page):
   a button carrying data-article, the photo, the meta line
   with the legacy &nbsp;·&nbsp; separators, the title and the
   lead, with the transition-delay pattern ((i % 3) * 80ms).
   Clicks route through NavSystem's [data-article] delegation
   to the article route, as the legacy listener routed them to
   the article view. */

import type { StorefrontArticle } from '../../data/products';

export default function JournalCard({ article, index }: { article: StorefrontArticle; index: number }) {
  const a = article;
  return (
    <button
      className="jcard reveal"
      style={{ transitionDelay: ((index % 3) * 80) + 'ms' }}
      data-article={a.id}
    >
      <span className="ph" style={{ display: 'block' }}>
        <img src={a.img} alt={a.alt} loading="lazy" decoding="async" />
      </span>
      <div className="meta">
        {a.cat} {'\u00A0·\u00A0'} {a.mins} min read
      </div>
      <h3>{a.title}</h3>
      <p>{a.lead}</p>
    </button>
  );
}
