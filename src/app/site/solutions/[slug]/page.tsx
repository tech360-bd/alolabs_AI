import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { SolutionDetailPage } from '@/components/agentos/solution-detail'
import { BUSINESS_SOLUTIONS, solutionBySlug } from '@/lib/brand/solutions'
import { serviceBySlug } from '@/lib/brand/service-lines'
import { absoluteUrl, breadcrumbSchema, jsonLd, serviceSchema } from '@/lib/seo/structured-data'

/**
 * One static page per business solution.
 *
 * `generateStaticParams` renders all twelve at build time, so the sitemap entry
 * is generated from the same source the pages render from and cannot point at
 * a slug that 404s. An unknown slug 404s rather than rendering an empty shell.
 */
export function generateStaticParams() {
  return BUSINESS_SOLUTIONS.map((s) => ({ slug: s.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const solution = solutionBySlug(slug)
  if (!solution) return {}

  const url = absoluteUrl(`/site/solutions/${solution.slug}`)
  const title = `${solution.name} — ALO Labs`
  // Meta descriptions are trimmed to a length search results actually show.
  const description = solution.tagline.slice(0, 155)

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: 'ALO Labs',
      type: 'website',
      images: [{ url: '/brand/alo-agentos-badge.webp', width: 1254, height: 1254, alt: 'ALO Labs' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/brand/alo-agentos-badge.webp'],
    },
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const solution = solutionBySlug(slug)
  if (!solution) notFound()

  const service = serviceBySlug(solution.service)

  const graph = [
    serviceSchema({
      name: solution.name,
      tagline: solution.tagline,
      slug: solution.slug,
      urlPath: `/site/solutions/${solution.slug}`,
    }),
    breadcrumbSchema([
      { href: '/site/solutions', label: 'Solutions' },
      { href: `/site/solutions/${solution.slug}`, label: solution.name },
    ]),
    // The delivery capability, as a distinct thing from the commercial offer.
    ...(service
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'Service',
            name: service.name,
            description: service.tagline,
            url: absoluteUrl(`/site/services/${service.slug}`),
            provider: { '@id': `${absoluteUrl('/')}#organization` },
            serviceType: service.name,
          },
        ]
      : []),
  ]

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(graph) }} />
      <SolutionDetailPage solution={solution} />
    </>
  )
}
