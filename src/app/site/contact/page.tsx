import type { Metadata } from 'next'
import { ContactPage } from '@/components/site/pages/contact'

export const metadata: Metadata = {
  title: 'Contact — ALO Labs',
  description: 'Talk to the ALO Labs team. One form — replies within one business day.',
  openGraph: {
    title: 'Contact — ALO Labs',
    description: 'Talk to the ALO Labs team. One form — replies within one business day.',
    siteName: 'ALO Labs',
    images: ['/brand/alo-logo-horizontal.svg'],
  },
}

export default function Page() {
  return <ContactPage />
}
