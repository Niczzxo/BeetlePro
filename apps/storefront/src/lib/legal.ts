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

import type { PublicLegalDocument } from '@dostelo/types';

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
    const doc = (await res.json()) as PublicLegalDocument;
    if (!doc || typeof doc.body !== 'string' || doc.body.length === 0) {
      return null;
    }
    return doc;
  } catch {
    return null;
  }
}
