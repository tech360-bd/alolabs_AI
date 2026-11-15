import type { Metadata } from 'next'
import { ServicesPage } from '@/components/site/pages/services'

export const metadata: Metadata = {
  title: 'Services — ALO Labs',
  description:
    'How ALO Labs delivers: clear scopes, engineered deliverables, engagement models (project, retainer, partnership) and working standards for every client.',
  alternates: {
    canonical: 'https://www.alolabs.net/site/services',
  },
  openGraph: {
    title: 'Services — ALO Labs',
    description:
      'How ALO Labs delivers: clear scopes, engineered deliverables, engagement models and working standards for every client.',
    siteName: 'ALO Labs',
    url: 'https://www.alolabs.net/site/services',
    images: ['/brand/alo-mark.svg'],
  },
}

export default function Page() {
  return <ServicesPage />
}
