import type { Metadata } from 'next'
import { MarketingSite } from '@/components/site/marketing-site'

/**
 * The public website. This is what a first-time visitor sees at
 * https://alolabs.net — the product story, AI agent information, and contact.
 * The authenticated application lives at `/dashboard` and
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
    'Explore ALO Labs AgentOS: an AI agent operating system bringing agents, knowledge, workflows and human oversight together.',
  openGraph: {
    title: 'ALO Labs AgentOS — AI Agent Operating System',
    description: 'Bring AI agents, knowledge, workflows and human oversight together with ALO Labs AgentOS.',
    siteName: 'ALO Labs AgentOS',
    images: ['/brand/alo-logo-horizontal.svg'],
  },
}

export default function HomePage() {
  return <MarketingSite />
}
