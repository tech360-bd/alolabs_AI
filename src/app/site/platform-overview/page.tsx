import type { Metadata } from 'next'

import { PlatformOverviewPage } from '@/components/agentos/platform-overview'
import { absoluteUrl, breadcrumbSchema, jsonLd, organizationSchema } from '@/lib/seo/structured-data'

/**
 * The public platform page.
 *
 * Note the deliberate asymmetry with /site/platform: that path is an internal
 * engineering reference and stays behind authentication (see
 * INTERNAL_PAGE_PREFIXES in src/lib/access/surfaces.ts). This page is the
 * public-facing statement of the same system and must never link to the
 * internal one for anything a visitor cannot already see.
 */
export const metadata: Metadata = {
  title: 'AgentOS Platform — Governed AI Agents & Orchestration | ALO Labs',
  description:
    'AgentOS is the platform ALO Labs builds on: one conversational surface, a governed agent registry, bounded provider failover and tenant isolation enforced at the data layer.',
  alternates: { canonical: absoluteUrl('/site/platform-overview') },
  openGraph: {
    title: 'AgentOS Platform — ALO Labs',
    description:
      'One conversational surface, a governed agent registry, bounded provider failover and tenant isolation enforced in the query.',
    url: absoluteUrl('/site/platform-overview'),
    siteName: 'ALO Labs',
    type: 'website',
    images: [{ url: '/brand/alo-agentos-badge.webp', width: 1254, height: 1254, alt: 'ALO Labs AgentOS' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AgentOS Platform — ALO Labs',
    description:
      'One conversational surface, a governed agent registry, bounded provider failover and tenant isolation enforced in the query.',
    images: ['/brand/alo-agentos-badge.webp'],
  },
}

export default function Page() {
  const graph = [
    organizationSchema(),
    breadcrumbSchema([{ href: '/site/platform-overview', label: 'Platform' }]),
  ]

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(graph) }} />
      <PlatformOverviewPage />
    </>
  )
}
