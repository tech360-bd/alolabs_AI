import type { Metadata } from 'next'
import { SolutionsPage } from '@/components/site/pages/solutions'

export const metadata: Metadata = {
  title: 'Solutions — ALO Labs',
  description:
    'Nine solution areas: AI & automation, custom software, web platforms, mobile apps, business systems & CRM, integrations, portals & SaaS, cloud, and AI-assisted customer experience.',
  alternates: {
    canonical: 'https://www.alolabs.net/site/solutions',
  },
  openGraph: {
    title: 'Solutions — ALO Labs',
    description:
      'Nine ways ALO Labs solves real business problems — each with the problem, our approach, key capabilities and expected value.',
    siteName: 'ALO Labs',
    url: 'https://www.alolabs.net/site/solutions',
    images: ['/studio/icon-512.png'],
  },
}

export default function Page() {
  return <SolutionsPage />
}
