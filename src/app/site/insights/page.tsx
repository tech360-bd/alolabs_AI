import { requireServerSession } from '@/lib/server-session'
import type { Metadata } from 'next'
import { InsightsPage } from '@/components/site/pages/insights'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Insights — ALO Labs AgentOS',
  description: 'Field notes on running AI departments: approval gates, hybrid RAG, rollout patterns and the design systems behind the product.',
  openGraph: {
    title: 'Insights — ALO Labs AgentOS',
    description: 'Field notes on running AI departments: approval gates, hybrid RAG, rollout patterns and the design systems behind the product.',
    siteName: 'ALO Labs AgentOS',
    images: ['/brand/alo-logo-horizontal.svg'],
  },
}

// Internal reference material: ALO Labs personnel only (see INTERNAL_PAGE_PREFIXES).
export default async function Page() {
  await requireServerSession('/site/insights')
  return <InsightsPage />
}
