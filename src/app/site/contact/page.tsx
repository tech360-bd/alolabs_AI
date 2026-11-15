import type { Metadata } from 'next'
import { ContactPage } from '@/components/site/pages/contact'

export const metadata: Metadata = {
  title: 'Contact — ALO Labs',
  description:
    'Start a project with ALO Labs. Tell us about your business and what you want to achieve — we reply within one business day with a real conversation.',
  alternates: {
    canonical: 'https://www.alolabs.net/site/contact',
  },
  openGraph: {
    title: 'Contact — ALO Labs',
    description: 'Start a project with ALO Labs — replies within one business day.',
    siteName: 'ALO Labs',
    url: 'https://www.alolabs.net/site/contact',
    images: ['/brand/alo-mark.svg'],
  },
}

export default function Page() {
  return <ContactPage />
}
