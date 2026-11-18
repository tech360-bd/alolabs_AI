import type { Metadata } from 'next'
import { HowWeWorkPage } from '@/components/site/pages/how-we-work'

export const metadata: Metadata = {
  title: 'How We Work — ALO Labs',
  description:
    'The ALO Labs delivery process: discovery, strategy and architecture, design and engineering, launch and delivery, and continuous improvement — with the rules we hold ourselves to.',
  alternates: {
    canonical: 'https://www.alolabs.net/site/how-we-work',
  },
  openGraph: {
    title: 'How We Work — ALO Labs',
    description:
      'Five delivery stages from discovery to continuous improvement — the ALO Labs process, explained step by step.',
    siteName: 'ALO Labs',
    url: 'https://www.alolabs.net/site/how-we-work',
    images: ['/studio/icon-512.png'],
  },
}

export default function Page() {
  return <HowWeWorkPage />
}
