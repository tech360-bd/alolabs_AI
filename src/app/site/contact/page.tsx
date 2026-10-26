import type { Metadata } from 'next'
import { ContactPage } from '@/components/site/pages/contact'

export const metadata: Metadata = {
  title: 'Contact — ALO Labs',
  description: 'Talk to the team behind AgentOS. One form, straight into our CRM — replies within one business day.',
  openGraph: {
    title: 'Contact — ALO Labs',
    description: 'Talk to the team behind AgentOS. One form, straight into our CRM — replies within one business day.',
    siteName: 'ALO Labs AgentOS',
    images: ['/brand/alo-logo-horizontal.svg'],
  },
}

export default function Page() {
  return <ContactPage />
}
