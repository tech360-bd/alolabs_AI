import type { Metadata } from 'next'
import { TermsPage } from '@/components/site/pages/terms'

export const metadata: Metadata = {
  title: 'Terms of Service — ALO Labs',
  description:
    'The terms that govern working with ALO Labs — engagements, deliverables, ownership, confidentiality and support.',
  alternates: {
    canonical: 'https://www.alolabs.net/site/terms',
  },
  openGraph: {
    title: 'Terms of Service — ALO Labs',
    description: 'The terms that govern working with ALO Labs.',
    siteName: 'ALO Labs',
    url: 'https://www.alolabs.net/site/terms',
    images: ['/brand/alo-mark.svg'],
  },
}

export default function Page() {
  return <TermsPage />
}
