import type { Metadata } from 'next'
import { MarketingSite } from '@/components/site/marketing-site'

/**
 * The public website. This is what a first-time visitor sees at
 * https://alolabs.net — the product story, the agent cards, the departments and
 * the contact details. The authenticated application lives at `/dashboard` and
 * is not reachable without a session.
 *
 * Previously this route mounted the dashboard shell directly, which is why the
 * private application was visible to anonymous visitors. The dashboard was also
 * the *only* thing at `/`, so the public marketing site that already existed at
 * `/site` was effectively unreachable from the root domain.
 */

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

export default function HomePage() {
  return <MarketingSite />
}
