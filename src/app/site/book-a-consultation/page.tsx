import type { Metadata } from 'next'

import { ConversionPage } from '@/components/agentos/conversion-page'
import { absoluteUrl, breadcrumbSchema, jsonLd, organizationSchema } from '@/lib/seo/structured-data'

/**
 * Book a Consultation.
 *
 * No calendar integration is claimed. The brief requires real, validated
 * endpoints and honest feedback — inventing a booking widget that posts nowhere
 * would fail both. The request is persisted as a lead, and the reply proposes
 * times once a human has read the context in the message.
 */
export const metadata: Metadata = {
  title: 'Book a Consultation — ALO Labs',
  description:
    'A working session with an ALO Labs engineer: bring the process and the constraints, leave with an architecture opinion and an honest view of whether the work is worth doing.',
  alternates: { canonical: absoluteUrl('/site/book-a-consultation') },
  openGraph: {
    title: 'Book a Consultation — ALO Labs',
    description: 'A working session with an engineer, not a sales call.',
    url: absoluteUrl('/site/book-a-consultation'),
    siteName: 'ALO Labs',
    type: 'website',
    images: [{ url: '/brand/alo-agentos-badge.webp', width: 1254, height: 1254, alt: 'ALO Labs' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Book a Consultation — ALO Labs',
    description: 'A working session with an engineer, not a sales call.',
    images: ['/brand/alo-agentos-badge.webp'],
  },
}

export default function Page() {
  const graph = [
    organizationSchema(),
    breadcrumbSchema([{ href: '/site/book-a-consultation', label: 'Book a consultation' }]),
  ]
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(graph) }} />
      <ConversionPage kind="consultation" />
    </>
  )
}
