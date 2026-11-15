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
  title: 'ALO Labs — Global AI & Software Technology Company',
  description:
    'ALO Labs designs and builds software, AI-powered solutions and connected digital platforms that help businesses work smarter, scale confidently and create better experiences.',
  alternates: {
    canonical: 'https://www.alolabs.net/',
  },
  openGraph: {
    title: 'ALO Labs — Global AI & Software Technology Company',
    description:
      'Software, AI-powered solutions and connected digital platforms — designed and built for businesses that take technology seriously.',
    siteName: 'ALO Labs',
    url: 'https://www.alolabs.net/',
    images: ['/brand/alo-mark.svg'],
  },
}

export default function HomePage() {
  return <HomeExperience />
}
