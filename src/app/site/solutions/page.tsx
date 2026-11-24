import type { Metadata } from 'next'

import { SolutionsHubPage } from '@/components/agentos/solutions-hub'
import { BUSINESS_SOLUTIONS } from '@/lib/brand/solutions'
import { absoluteUrl, breadcrumbSchema, jsonLd, organizationSchema, serviceSchema } from '@/lib/seo/structured-data'

/**
 * The solutions hub — "AI Solutions That Move Your Business Forward."
 *
 * This replaces the previous light-themed /site/solutions page. That page's
 * content (nine solution areas) is preserved in substance and superseded in
 * form: the twelve solutions here are the brief's list, each with the four
 * questions a buyer actually asks, plus an honest delivery state.
 *
 * The old component is deliberately left mounted at
 * `src/components/site/pages/solutions.tsx` rather than deleted, in case a
 * future page wants the light presentation — but nothing routes to it now.
 */
export const metadata: Metadata = {
  title: 'AI Solutions — Software, Agents & Automation | ALO Labs',
  description:
    'Twelve ALO Labs business solutions: AI software development, custom agents, multi-agent systems, process automation, web platforms, CRM and portals, marketing, media, voice AI, integrations and cloud engineering.',
  keywords: [
    'AI solutions',
    'AI software development',
    'custom AI agents',
    'business process automation',
    'enterprise CRM development',
    'AI marketing',
    'voice AI Bangladesh',
    'cloud DevOps',
  ],
  alternates: { canonical: absoluteUrl('/site/solutions') },
  openGraph: {
    title: 'AI Solutions That Move Your Business Forward — ALO Labs',
    description:
      'AI software, agents, automation, platforms and growth engineering — each labelled with what is genuinely available today.',
    url: absoluteUrl('/site/solutions'),
    siteName: 'ALO Labs',
    type: 'website',
    images: [{ url: '/brand/alo-agentos-badge.webp', width: 1254, height: 1254, alt: 'ALO Labs AgentOS' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Solutions — ALO Labs',
    description:
      'Twelve business solutions, each stating the problem it solves, what you receive, and what is real today.',
    images: ['/brand/alo-agentos-badge.webp'],
  },
}

export default function Page() {
  const graph = [
    organizationSchema(),
    breadcrumbSchema([{ href: '/site/solutions', label: 'Solutions' }]),
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': absoluteUrl('/site/solutions'),
      name: 'AI Solutions — ALO Labs',
      description:
        'Twelve business solutions delivered by ALO Labs, each with its delivery state stated plainly.',
      hasPart: BUSINESS_SOLUTIONS.map((s) => serviceSchema({ name: s.name, tagline: s.tagline, slug: s.slug })),
    },
  ]

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(graph) }} />
      <SolutionsHubPage />
    </>
  )
}
