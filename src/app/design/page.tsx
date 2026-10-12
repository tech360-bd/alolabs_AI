import type { Metadata } from 'next'
import DesignSystemPage from './design-system'

export const metadata: Metadata = {
  title: 'Design System — ALO Labs AgentOS',
  description:
    'The editorial diagram system, button language, card patterns and semantic tokens used across ALO Labs AgentOS.',
}

export default function Page() {
  return <DesignSystemPage />
}
