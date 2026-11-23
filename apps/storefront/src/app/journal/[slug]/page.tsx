/* Article route, the legacy #view-article as filled by
   openArticle(): the crumb with the article title, the title,
   the meta line ("<cat> · <mins> min read", plain spaces, as
   openArticle() sets it), the hero photo, and #artBody: the
   lead set as a large ink paragraph followed by the article's
   stored body HTML, verbatim. The legacy router reached it as
   #/article/<id> and fell back to the first article for an
   unknown id; a routed site 404s instead (dynamicParams off),
   as the product route does. Title and description follow the
   legacy applySEO() article rule: "<title> | Dostelo Journal"
   and the lead. */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { articles } from '../../../data/products';
import { articleSeo, seoMetadata } from '../../../lib/seo';

export function generateStaticParams() {
  return articles.map((a) => ({ slug: a.id }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const a = articles.find((x) => x.id === slug);
  if (!a) return {};
  return seoMetadata(articleSeo(a));
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const a = articles.find((x) => x.id === slug);
  if (!a) notFound();
  const bodyHtml =
    '<p style="font-size:19px;color:var(--ink)">' + a.lead + '</p>' + a.body.join('');
  return (
    <main>
      <div className="view" id="view-article">
        <div className="wrap">
          <div className="crumb">
            <button data-nav="journal">Journal</button> / <span id="artCrumb">{a.title}</span>
          </div>
          <article className="article" style={{ paddingTop: 26 }}>
            <h1 id="artTitle">{a.title}</h1>
            <div className="meta" id="artMeta">
              {a.cat + ' · ' + a.mins + ' min read'}
            </div>
            <img
              className="hero-a"
              id="artImg"
              src={a.img}
              alt={a.alt}
              loading="lazy"
              decoding="async"
            />
            <div id="artBody" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
            <button className="btn" data-nav="journal" style={{ marginTop: 14 }}>
              More from the journal
            </button>
          </article>
        </div>
      </div>
    </main>
  );
}
