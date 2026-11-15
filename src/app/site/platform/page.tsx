import { requireServerSession } from '@/lib/server-session'
import type { Metadata } from 'next'
import { PlatformPage } from '@/components/site/pages/platform'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Platform — ALO Labs AgentOS',
  description: 'One command centre for the ALO Labs AI workforce across 100+ departments: routing, memory, hybrid RAG, the approval gate and the full audit trail.',
  openGraph: {
    title: 'Platform — ALO Labs AgentOS',
    description: 'One command centre for the ALO Labs AI workforce across 100+ departments: routing, memory, hybrid RAG, the approval gate and the full audit trail.',
    siteName: 'ALO Labs AgentOS',
    images: ['/brand/alo-logo-horizontal.svg'],
  },
}

// Internal reference material: ALO Labs personnel only (see INTERNAL_PAGE_PREFIXES).
export default async function Page() {
  await requireServerSession('/site/platform')
  return <PlatformPage />
}
