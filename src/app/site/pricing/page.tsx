import type { Metadata } from 'next'
import { PricingPage } from '@/components/site/pages/pricing'

export const metadata: Metadata = {
  title: 'Pricing — ALO Labs AgentOS',
  description: 'Managed pilots, enterprise agreements and self-hosted licences. Start with one department, scale to the whole workforce.',
  openGraph: {
    title: 'Pricing — ALO Labs AgentOS',
    description: 'Managed pilots, enterprise agreements and self-hosted licences. Start with one department, scale to the whole workforce.',
    siteName: 'ALO Labs AgentOS',
    images: ['/brand/alo-logo-horizontal.svg'],
  },
}

export default function Page() {
  return <PricingPage />
}
