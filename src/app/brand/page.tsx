import { requireServerSession } from '@/lib/server-session'
import type { Metadata } from 'next'
import { BrandBook } from '@/components/brand/brand-book'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Brand & System Guideline — ALO Labs AgentOS',
  description:
    'The ALO Labs AgentOS brand book: official lockups, the orange and blue colour system with its gradients, Inter and Poppins typography, the system flow, the mobile command centre, the agent specification cards and the letterhead.',
}

// Internal reference material: ALO Labs personnel only (see INTERNAL_PAGE_PREFIXES).
export default async function BrandPage() {
  await requireServerSession('/brand')
  return <BrandBook />
}
