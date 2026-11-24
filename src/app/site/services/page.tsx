import type { Metadata } from 'next'
import { ServicesIndexPage } from '@/components/agentos/services-index'

export const metadata: Metadata = {
  title: 'Services — AI Software, Agents & Automation | ALO Labs',
  description:
    'Twelve ALO Labs service lines: AI software development, AI agents, multi-agent systems, automation, web platforms, CRM, voice AI, integrations, analytics and cloud engineering.',
  alternates: {
    canonical: 'https://www.alolabs.net/site/services',
  },
  openGraph: {
    title: 'Services — ALO Labs',
    description:
      'Twelve ALO Labs service lines, each with its real delivery state, deliverables and technology.',
    siteName: 'ALO Labs',
    url: 'https://www.alolabs.net/site/services',
    images: ['/studio/icon-512.png'],
  },
}

export default function Page() {
  return <ServicesIndexPage />
}
