import type { Metadata } from 'next'

import { ContactDarkPage } from '@/components/agentos/contact-page'
import { absoluteUrl, breadcrumbSchema, jsonLd, organizationSchema } from '@/lib/seo/structured-data'

/**
 * The project-inquiry page.
 *
 * This replaces the previous light-themed contact page at the same URL. That
 * page's ContactForm component is left in place because other pages still use
 * it; the dark form here posts to the same /api/public/contact endpoint, so
 * there is exactly one lead pipeline and one set of validation rules.
 */
export const metadata: Metadata = {
  title: 'Start a Project — Talk to ALO Labs',
  description:
    'Tell ALO Labs what you are building. We reply to project enquiries within one business day with a technical response, not a sales sequence.',
  alternates: { canonical: absoluteUrl('/site/contact') },
  openGraph: {
    title: 'Start a Project — ALO Labs',
    description: 'Tell us the problem. We reply within one business day.',
    url: absoluteUrl('/site/contact'),
    siteName: 'ALO Labs',
    type: 'website',
    images: [{ url: '/brand/alo-agentos-badge.webp', width: 1254, height: 1254, alt: 'ALO Labs' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Start a Project — ALO Labs',
    description: 'Tell us the problem. We reply within one business day.',
    images: ['/brand/alo-agentos-badge.webp'],
  },
}

export default function Page() {
  const graph = [
    organizationSchema(),
    breadcrumbSchema([{ href: '/site/contact', label: 'Contact' }]),
  ]

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(graph) }} />
      <ContactDarkPage />
    </>
  )
}
