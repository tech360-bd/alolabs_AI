import type { Metadata } from 'next'

import { ConversionPage } from '@/components/agentos/conversion-page'
import { absoluteUrl, breadcrumbSchema, jsonLd, organizationSchema } from '@/lib/seo/structured-data'

/**
 * Start a Project — the primary conversion page.
 *
 * The form posts to POST /api/public/contact, the endpoint that already
 * validates, honeypots, rate-limits per IP and persists a CRM lead. There is
 * exactly one lead pipeline on this site; adding a second one would mean two
 * sets of validation rules and two places for a lead to be lost.
 */
export const metadata: Metadata = {
  title: 'Start a Project — ALO Labs',
  description:
    'Tell ALO Labs what you are building. We reply to project enquiries within one business day with a technical response, a question, or an honest no.',
  alternates: { canonical: absoluteUrl('/site/start-a-project') },
  openGraph: {
    title: 'Start a Project — ALO Labs',
    description: 'Describe the problem. We reply within one business day.',
    url: absoluteUrl('/site/start-a-project'),
    siteName: 'ALO Labs',
    type: 'website',
    images: [{ url: '/brand/alo-agentos-badge.webp', width: 1254, height: 1254, alt: 'ALO Labs' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Start a Project — ALO Labs',
    description: 'Describe the problem. We reply within one business day.',
    images: ['/brand/alo-agentos-badge.webp'],
  },
}

export default function Page() {
  const graph = [
    organizationSchema(),
    breadcrumbSchema([{ href: '/site/start-a-project', label: 'Start a project' }]),
  ]
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(graph) }} />
      <ConversionPage kind="project" />
    </>
  )
}
