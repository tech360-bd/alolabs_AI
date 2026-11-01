import type { Metadata } from 'next'
import { WorkPage } from '@/components/site/pages/work'

export const metadata: Metadata = {
  title: 'Work — ALO Labs AgentOS',
  description: 'Deployed systems, not slideware: student operations, AI marketing CRM, communications automation and the AgentOS command centre itself.',
  openGraph: {
    title: 'Work — ALO Labs AgentOS',
    description: 'Deployed systems, not slideware: student operations, AI marketing CRM, communications automation and the AgentOS command centre itself.',
    siteName: 'ALO Labs AgentOS',
    images: ['/brand/alo-logo-horizontal.svg'],
  },
}

export default function Page() {
  return <WorkPage />
}
