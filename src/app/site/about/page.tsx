import type { Metadata } from 'next'
import { AboutPage } from '@/components/site/pages/about'

export const metadata: Metadata = {
  title: 'About — ALO Labs',
  description:
    'ALO Labs is a global AI & software technology company: our vision, mission, engineering philosophy, responsible AI principles and approach to long-term partnerships. Harrisonville, Missouri.',
  alternates: {
    canonical: 'https://www.alolabs.net/site/about',
  },
  openGraph: {
    title: 'About — ALO Labs',
    description:
      'A global AI & software technology company — vision, mission, engineering philosophy and responsible AI principles.',
    siteName: 'ALO Labs',
    url: 'https://www.alolabs.net/site/about',
    images: ['/brand/alo-mark.svg'],
  },
}

export default function Page() {
  return <AboutPage />
}
