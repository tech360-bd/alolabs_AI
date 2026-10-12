import type { Metadata } from 'next'
import { MarketingSite } from '@/components/site/marketing-site'

export const metadata: Metadata = {
  title: 'ALO Labs AgentOS — AI Agent Operating System',
  description:
    'One command centre for 1020 AI agents across 100+ departments. See the system flow, the agent specification cards, the mobile command centre and how to reach the team.',
  openGraph: {
    title: 'ALO Labs AgentOS — AI Agent Operating System',
    description: 'One command centre for 1020 AI agents across 100+ departments.',
    siteName: 'ALO Labs AgentOS',
    images: ['/brand/alo-logo-horizontal.svg'],
  },
}

export default function SitePage() {
  return <MarketingSite />
}
