import { requireServerSession } from '@/lib/server-session'
import type { Metadata } from 'next'
import { VoiceContactCenterPage } from '@/components/site/pages/voice-contact-center'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'AI Voice & Contact Center — ALO Labs',
  description:
    'Cloud business phone system, AI voice agents, Bangla-first text-to-speech, human contact center, CRM and omnichannel messaging — one multi-tenant platform on ALO Labs AgentOS.',
  openGraph: {
    title: 'AI Voice & Contact Center — ALO Labs',
    description:
      'CallHippo-style cloud telephony + AI voice agents + Bangla voice studio, built on ALO Labs AgentOS.',
    siteName: 'ALO Labs AgentOS',
    images: ['/brand/alo-logo-horizontal.svg'],
  },
}

// Internal reference material: ALO Labs personnel only (see INTERNAL_PAGE_PREFIXES).
export default async function Page() {
  await requireServerSession('/site/platform/voice-contact-center')
  return <VoiceContactCenterPage />
}
