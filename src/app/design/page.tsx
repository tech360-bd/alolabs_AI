import { requireServerSession } from '@/lib/server-session'
import type { Metadata } from 'next'
import DesignSystemPage from './design-system'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Design System — ALO Labs AgentOS',
  description:
    'The editorial diagram system, button language, card patterns and semantic tokens used across ALO Labs AgentOS.',
}

// Internal reference material: ALO Labs personnel only (see INTERNAL_PAGE_PREFIXES).
export default async function Page() {
  await requireServerSession('/design')
  return <DesignSystemPage />
}
