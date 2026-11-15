import type { Metadata } from 'next'
import { CareersPage } from '@/components/site/pages/careers'

export const metadata: Metadata = {
  title: 'Careers — ALO Labs',
  description:
    'Join ALO Labs — a global AI & software technology company. We publish real openings only, across engineering, AI, solutions and design.',
  alternates: {
    canonical: 'https://www.alolabs.net/site/careers',
  },
  openGraph: {
    title: 'Careers — ALO Labs',
    description: 'Join ALO Labs — real openings only, across engineering, AI, solutions and design.',
    siteName: 'ALO Labs',
    url: 'https://www.alolabs.net/site/careers',
    images: ['/brand/alo-mark.svg'],
  },
}

export default function Page() {
  return <CareersPage />
}
