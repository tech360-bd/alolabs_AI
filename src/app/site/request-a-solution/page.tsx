import type { Metadata } from 'next'

import { ConversionPage } from '@/components/agentos/conversion-page'
import { absoluteUrl, breadcrumbSchema, jsonLd, organizationSchema } from '@/lib/seo/structured-data'

/**
 * Request an AI Solution.
 *
 * Deliberately a separate page from Start a Project: the person who has a
 * business problem and suspects AI is a different visitor from the person who
 * knows what to build, and the questions that get a useful first reply are
 * different. Both persist to the same table with a different `subject`.
 */
export const metadata: Metadata = {
  title: 'Request an AI Solution — ALO Labs',
  description:
    'Describe the business problem and ALO Labs will tell you whether AI is the right answer, what we would build, and what it would take.',
  alternates: { canonical: absoluteUrl('/site/request-a-solution') },
  openGraph: {
    title: 'Request an AI Solution — ALO Labs',
    description: 'Describe the outcome you need. We will tell you if AI is the right tool.',
    url: absoluteUrl('/site/request-a-solution'),
    siteName: 'ALO Labs',
    type: 'website',
    images: [{ url: '/brand/alo-agentos-badge.webp', width: 1254, height: 1254, alt: 'ALO Labs' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Request an AI Solution — ALO Labs',
    description: 'Describe the outcome you need. We will tell you if AI is the right tool.',
    images: ['/brand/alo-agentos-badge.webp'],
  },
}

export default function Page() {
  const graph = [
    organizationSchema(),
    breadcrumbSchema([{ href: '/site/request-a-solution', label: 'Request an AI solution' }]),
  ]
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(graph) }} />
      <ConversionPage kind="solution" />
    </>
  )
}
