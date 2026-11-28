/* Published legal documents from the API (GET /v1/legal/:slug).
   The policy routes render the published document for their slug
   when one exists and fall back to the ported static content when
   none does. Server-side only: this runs in the policy page's
   server component, reads the same NEXT_PUBLIC_API_URL the
   tracker and recovery view use, and never throws: an unreachable
   API or a 404 simply means "no published document", so the
   static fallback renders. Fetched with no-store so a publish or
   unpublish in the admin portal takes effect on the next request
   without a rebuild. */

import type { LegalDocument } from '@dostelo/types';

/** The public shape the policy pages render: the published body
   of the API's LegalDocument under the field names the previous
   build used. Contract note (fresh rebuild): the rebuilt
   @dostelo/types exports LegalDocument (with publishedBody)
   rather than a separate PublicLegalDocument, so the mapping
   happens here, in one place. */
export interface PublicLegalDocument {
  slug: string;
  title: string;
  body: string;
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function getPublishedLegalDocument(
  slug: string,
): Promise<PublicLegalDocument | null> {
  try {
    const res = await fetch(`${API_BASE}/v1/legal/${slug}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const doc = (await res.json()) as LegalDocument;
    if (!doc || typeof doc.publishedBody !== 'string' || doc.publishedBody.length === 0) {
      return null;
    }
    return { slug: doc.slug, title: doc.title, body: doc.publishedBody };
  } catch {
    return null;
  }
}
