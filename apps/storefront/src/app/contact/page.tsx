/* Contact route. The legacy hash router reached the contact
   view as #/contact; here it is the /contact route. Title and
   description are the legacy SEO_PAGES.contact pair. */

import type { Metadata } from 'next';
import ContactView from '../../components/contact/ContactView';
import { SEO_PAGES, seoMetadata } from '../../lib/seo';

export const metadata: Metadata = seoMetadata(SEO_PAGES.contact);

export default function ContactPage() {
  return <ContactView />;
}
