import type { Metadata } from 'next'
import { ProjectsShowcasePage } from '@/components/agentos/projects-showcase'
import { SHOWCASE_PROJECTS } from '@/lib/brand/projects'
import { absoluteUrl, breadcrumbSchema, jsonLd, organizationSchema } from '@/lib/seo/structured-data'

/**
 * The public project showcase.
 *
 * This replaces the light-themed /site/projects page. That component is left in
 * place at `src/components/site/pages/projects.tsx` for reference, but nothing
 * routes to it: a second showcase with different status labels would let the
 * two disagree, which is precisely what this rebuild exists to prevent.
 */
export const metadata: Metadata = {
  title: 'Projects — Verified Work & Case Studies | ALO Labs',
  description:
    'ALO Labs AgentOS, the client portal and this website — case studies with their real architecture, verified capabilities, honest limits and the evidence behind each claim.',
  keywords: [
    'ALO Labs AgentOS case study',
    'AI platform case study',
    'multi-agent system architecture',
    'Next.js case study',
    'AI company Bangladesh projects',
  ],
  alternates: { canonical: absoluteUrl('/site/projects') },
  openGraph: {
    title: 'Projects — Verified Work | ALO Labs',
    description:
      'Three shipped builds with architecture, verified capabilities and honest limits. No borrowed logos, no invented metrics.',
    url: absoluteUrl('/site/projects'),
    siteName: 'ALO Labs',
    type: 'website',
    images: [{ url: '/brand/alo-agentos-badge.webp', width: 1254, height: 1254, alt: 'ALO Labs AgentOS' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Projects — ALO Labs',
    description: 'Work you can verify, not just admire.',
    images: ['/brand/alo-agentos-badge.webp'],
  },
}

export default function Page() {
  const graph = [
    organizationSchema(),
    breadcrumbSchema([{ href: '/site/projects', label: 'Projects' }]),
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': absoluteUrl('/site/projects'),
      name: 'ALO Labs — verified projects',
      hasPart: SHOWCASE_PROJECTS.map((p) => ({
        '@type': 'CreativeWork',
        name: p.name,
        description: p.summary,
        url: absoluteUrl(`/site/projects/${p.slug}`),
      })),
    },
  ]

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(graph) }} />
      <ProjectsShowcasePage />
    </>
  )
}
