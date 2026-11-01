import type { Metadata } from 'next'
import { CareersPage } from '@/components/site/pages/careers'

export const metadata: Metadata = {
  title: 'Careers — ALO Labs',
  description: 'Build the operating system for AI work. Remote-first roles in engineering, AI automation, solutions and design.',
  openGraph: {
    title: 'Careers — ALO Labs',
    description: 'Build the operating system for AI work. Remote-first roles in engineering, AI automation, solutions and design.',
    siteName: 'ALO Labs AgentOS',
    images: ['/brand/alo-logo-horizontal.svg'],
  },
}

export default function Page() {
  return <CareersPage />
}
