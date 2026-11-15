import type { Metadata } from 'next'
import { AboutPage } from '@/components/site/pages/about'

export const metadata: Metadata = {
  title: 'About — ALO Labs',
  description: 'ALO Labs delivers AI-powered business services. Harrisonville, Missouri. Secure. Smart. Scalable. Built for the Future.',
  openGraph: {
    title: 'About — ALO Labs',
    description: 'ALO Labs delivers AI-powered business services. Harrisonville, Missouri. Secure. Smart. Scalable. Built for the Future.',
    siteName: 'ALO Labs',
    images: ['/brand/alo-logo-horizontal.svg'],
  },
}

export default function Page() {
  return <AboutPage />
}
