import type { Metadata } from 'next'
import { InvoicePage } from '@/components/brand/invoice-page'

export const metadata: Metadata = {
  title: 'Invoice — ALO Labs AgentOS',
  description:
    'An ALO Labs invoice printed on the company letterhead: full line-item arithmetic, a zero balance under the no-fee policy, and the cost avoided against equivalent paid APIs.',
}

export default function Page() {
  return <InvoicePage />
}
