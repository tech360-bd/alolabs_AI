import type { Metadata } from 'next'
import { AboutPage } from '@/components/site/pages/about'

export const metadata: Metadata = {
  title: 'About — ALO Labs',
  description: 'ALO Labs builds AgentOS, the AI Agent Operating System. Harrisonville, Missouri. Secure. Smart. Scalable. Built for the Future.',
  openGraph: {
    title: 'About — ALO Labs',
    description: 'ALO Labs builds AgentOS, the AI Agent Operating System. Harrisonville, Missouri. Secure. Smart. Scalable. Built for the Future.',
    siteName: 'ALO Labs AgentOS',
    images: ['/brand/alo-logo-horizontal.svg'],
  },
}

export default function Page() {
  return <AboutPage />
}
