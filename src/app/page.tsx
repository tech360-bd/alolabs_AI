import type { Metadata, Viewport } from 'next'
import { AgentosHome } from '@/components/agentos/agentos-home'
import { BRAND, publicSiteIcons } from '@/lib/brand/public'
import './public-design.css'
import './agentos-3d.css'

/**
 * The public website — the AgentOS landing page. This is what a first-time
 * visitor sees at https://alolabs.net: a 3D product surface built on the
 * supplied brand artwork (orange #FC5400 / blue #00309C, sampled from the logo
 * rather than chosen by hand).
 *
 * The previous marketing site is preserved and still mounted at `/site`
 * (`HomeExperience`), and is also reachable from the internal brand panel, so
 * nothing was deleted when this route changed.
 *
 * The authenticated application lives at `/dashboard` and is not reachable
 * without a session.
 *
 * Previously this route mounted the dashboard shell directly, which is why the
 * private application was visible to anonymous visitors. The dashboard was also
 * the *only* thing at `/`, so the public marketing site that already existed at
 * `/site` was effectively unreachable from the root domain.
 */

export const viewport: Viewport = { themeColor: BRAND.blue }

export const metadata: Metadata = {
  icons: publicSiteIcons,
  title: 'ALO Labs — AI Software, Intelligent Agents & Automation',
  description:
    'ALO Labs engineers AI-native software, intelligent agents and business automation — from conversational systems to enterprise platforms. Built to run in production.',
  keywords: [
    'ALO Labs',
    'AI software development',
    'AI agents',
    'multi-agent systems',
    'business process automation',
    'Bangla voice AI',
    'enterprise CRM',
    'AI software Bangladesh',
  ],
  alternates: {
    canonical: 'https://www.alolabs.net/',
  },
  openGraph: {
    title: 'ALO Labs — AI Software, Intelligent Agents & Automation',
    description:
      'Intelligence that builds the future: AI agents, enterprise software and automation engineered to turn ambitious ideas into working systems.',
    siteName: 'ALO Labs',
    url: 'https://www.alolabs.net/',
    type: 'website',
    locale: 'en_US',
    images: [
      {
        url: '/brand/alo-agentos-badge.webp',
        width: 1254,
        height: 1254,
        alt: 'ALO Labs — AI Agent Operating System',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ALO Labs — AI Software, Intelligent Agents & Automation',
    description:
      'AI agents, enterprise software and automation engineered to turn ambitious ideas into working systems.',
    images: ['/brand/alo-agentos-badge.webp'],
  },
}

export default function HomePage() {
  return <AgentosHome />
}
