import type { Metadata } from 'next'
import { HomeExperience } from '@/components/site/home-experience'
import './home.css'

/**
 * The public website. This is what a first-time visitor sees at
 * https://alolabs.net — the services we offer, how we deliver them, and contact.
 * The authenticated application lives at `/dashboard` and
 * is not reachable without a session.
 *
 * Previously this route mounted the dashboard shell directly, which is why the
 * private application was visible to anonymous visitors. The dashboard was also
 * the *only* thing at `/`, so the public marketing site that already existed at
 * `/site` was effectively unreachable from the root domain.
 */

export const metadata: Metadata = {
  title: 'ALO Labs — AI-Powered Business Services',
  description:
    'ALO Labs delivers AI-powered business services — automation, CRM, communications, content and custom software — with a client portal to follow every project.',
  openGraph: {
    title: 'ALO Labs — AI-Powered Business Services',
    description: 'AI-powered business services, delivered by an accountable team and followed in your client portal.',
    siteName: 'ALO Labs',
    images: ['/brand/alo-logo-horizontal.svg'],
  },
}

export default function HomePage() {
  return <HomeExperience />
}
