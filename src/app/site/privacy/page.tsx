import type { Metadata } from 'next'
import { PrivacyPage } from '@/components/site/pages/privacy'

export const metadata: Metadata = {
  title: 'Privacy Policy — ALO Labs',
  description:
    'How ALO Labs collects, uses and protects personal information across the website, client portal and services — in plain language.',
  alternates: {
    canonical: 'https://www.alolabs.net/site/privacy',
  },
  openGraph: {
    title: 'Privacy Policy — ALO Labs',
    description: 'How ALO Labs handles personal information — clearly explained.',
    siteName: 'ALO Labs',
    url: 'https://www.alolabs.net/site/privacy',
    images: ['/brand/alo-mark.svg'],
  },
}

export default function Page() {
  return <PrivacyPage />
}
