import { requireServerSession } from '@/lib/server-session'
import type { Metadata } from 'next'
import { InvoicePage } from '@/components/brand/invoice-page'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Invoice — ALO Labs AgentOS',
  description:
    'An ALO Labs invoice printed on the company letterhead: full line-item arithmetic, a zero balance under the no-fee policy, and the cost avoided against equivalent paid APIs.',
}

// Internal reference material: ALO Labs personnel only (see INTERNAL_PAGE_PREFIXES).
export default async function Page() {
  await requireServerSession('/invoice')
  return <InvoicePage />
}
