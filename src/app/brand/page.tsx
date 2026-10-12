import type { Metadata } from 'next'
import { BrandBook } from '@/components/brand/brand-book'

export const metadata: Metadata = {
  title: 'Brand & System Guideline — ALO Labs AgentOS',
  description:
    'The ALO Labs AgentOS brand book: official lockups, the orange and blue colour system with its gradients, Inter and Poppins typography, the system flow, the mobile command centre, the agent specification cards and the letterhead.',
}

export default function BrandPage() {
  return <BrandBook />
}
