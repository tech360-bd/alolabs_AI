import { requireServerSession } from '@/lib/server-session'
import type { Metadata } from 'next'
import { WorkPage } from '@/components/site/pages/work'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Work — ALO Labs AgentOS',
  description: 'Deployed systems, not slideware: student operations, AI marketing CRM, communications automation and the AgentOS command centre itself.',
  openGraph: {
    title: 'Work — ALO Labs AgentOS',
    description: 'Deployed systems, not slideware: student operations, AI marketing CRM, communications automation and the AgentOS command centre itself.',
    siteName: 'ALO Labs AgentOS',
    images: ['/brand/alo-logo-horizontal.svg'],
  },
}

// Internal reference material: ALO Labs personnel only (see INTERNAL_PAGE_PREFIXES).
export default async function Page() {
  await requireServerSession('/site/work')
  return <WorkPage />
}
