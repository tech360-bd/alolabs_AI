import { requireServerSession } from '@/lib/server-session'
import type { Metadata } from 'next'
import { DiagramsPage } from '@/components/site/pages/diagrams'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Diagram Gallery — ALO Labs AgentOS',
  description: '45 editorial visual types in one design language — orthogonal connectors, a 4px grid and a taste gate that runs in CI.',
  openGraph: {
    title: 'Diagram Gallery — ALO Labs AgentOS',
    description: '45 editorial visual types in one design language — orthogonal connectors, a 4px grid and a taste gate that runs in CI.',
    siteName: 'ALO Labs AgentOS',
    images: ['/brand/alo-logo-horizontal.svg'],
  },
}

// Internal reference material: ALO Labs personnel only (see INTERNAL_PAGE_PREFIXES).
export default async function Page() {
  await requireServerSession('/site/diagrams')
  return <DiagramsPage />
}
