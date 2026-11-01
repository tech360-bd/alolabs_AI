import type { Metadata } from 'next'
import { InsightsPage } from '@/components/site/pages/insights'

export const metadata: Metadata = {
  title: 'Insights — ALO Labs AgentOS',
  description: 'Field notes on running AI departments: approval gates, hybrid RAG, rollout patterns and the design systems behind the product.',
  openGraph: {
    title: 'Insights — ALO Labs AgentOS',
    description: 'Field notes on running AI departments: approval gates, hybrid RAG, rollout patterns and the design systems behind the product.',
    siteName: 'ALO Labs AgentOS',
    images: ['/brand/alo-logo-horizontal.svg'],
  },
}

export default function Page() {
  return <InsightsPage />
}
