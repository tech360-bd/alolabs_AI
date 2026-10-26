import type { Metadata } from 'next'
import { PlatformPage } from '@/components/site/pages/platform'

export const metadata: Metadata = {
  title: 'Platform — ALO Labs AgentOS',
  description: 'One command centre for 1020 AI agents across 100+ departments: routing, memory, hybrid RAG, the approval gate and the full audit trail.',
  openGraph: {
    title: 'Platform — ALO Labs AgentOS',
    description: 'One command centre for 1020 AI agents across 100+ departments: routing, memory, hybrid RAG, the approval gate and the full audit trail.',
    siteName: 'ALO Labs AgentOS',
    images: ['/brand/alo-logo-horizontal.svg'],
  },
}

export default function Page() {
  return <PlatformPage />
}
