import { requireServerSession } from '@/lib/server-session'
import type { Metadata } from 'next'
import { PressPage } from '@/components/site/pages/press'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Marketing & Press Kit — ALO Labs',
  description: 'Official logos, colours, typography, boilerplate copy, the fact sheet and the marketing kit: 50 playbooks installable as agents.',
  openGraph: {
    title: 'Marketing & Press Kit — ALO Labs',
    description: 'Official logos, colours, typography, boilerplate copy, the fact sheet and the marketing kit: 50 playbooks installable as agents.',
    siteName: 'ALO Labs AgentOS',
    images: ['/brand/alo-logo-horizontal.svg'],
  },
}

// Internal reference material: ALO Labs personnel only (see INTERNAL_PAGE_PREFIXES).
export default async function Page() {
  await requireServerSession('/site/press')
  return <PressPage />
}
