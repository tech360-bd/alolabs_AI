import type { Metadata } from 'next'
import { VoiceContactCenterPage } from '@/components/site/pages/voice-contact-center'

export const metadata: Metadata = {
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

export default function Page() {
  return <VoiceContactCenterPage />
}
