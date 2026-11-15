import { requireServerSession } from '@/lib/server-session'
import type { Metadata } from 'next'
import { PricingPage } from '@/components/site/pages/pricing'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Pricing — ALO Labs AgentOS',
  description: 'Managed pilots, enterprise agreements and self-hosted licences. Start with one department, scale to the whole workforce.',
  openGraph: {
    title: 'Pricing — ALO Labs AgentOS',
    description: 'Managed pilots, enterprise agreements and self-hosted licences. Start with one department, scale to the whole workforce.',
    siteName: 'ALO Labs AgentOS',
    images: ['/brand/alo-logo-horizontal.svg'],
  },
}

// Internal reference material: ALO Labs personnel only (see INTERNAL_PAGE_PREFIXES).
export default async function Page() {
  await requireServerSession('/site/pricing')
  return <PricingPage />
}
