import type { Metadata } from 'next'
import { SolutionsPage } from '@/components/site/pages/solutions'

export const metadata: Metadata = {
  title: 'Solutions — ALO Labs AgentOS',
  description: 'AI agents & automation, CRM & marketing, education operations, voice & SMS, knowledge systems and custom AI products — one accountable team.',
  openGraph: {
    title: 'Solutions — ALO Labs AgentOS',
    description: 'AI agents & automation, CRM & marketing, education operations, voice & SMS, knowledge systems and custom AI products — one accountable team.',
    siteName: 'ALO Labs AgentOS',
    images: ['/brand/alo-logo-horizontal.svg'],
  },
}

export default function Page() {
  return <SolutionsPage />
}
