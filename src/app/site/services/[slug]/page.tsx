import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ServiceDetailPage } from '@/components/agentos/service-detail'
import { SERVICE_LINES, serviceBySlug } from '@/lib/brand/service-lines'
import {
  absoluteUrl,
  breadcrumbSchema,
  faqPageSchema,
  jsonLd,
  serviceSchema,
} from '@/lib/seo/structured-data'

/**
 * One static page per service line. `generateStaticParams` renders all twelve at
 * build time, so a sitemap entry can never point at a slug that does not exist,
 * and an unknown slug 404s instead of rendering an empty shell.
 */
export function generateStaticParams() {
  return SERVICE_LINES.map((s) => ({ slug: s.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const service = serviceBySlug(slug)
  if (!service) return {}

  const url = absoluteUrl(`/site/services/${service.slug}`)
  const title = `${service.name} — ALO Labs`
  // Meta descriptions are trimmed to a length search results actually show.
  const description = service.tagline.slice(0, 155)

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
  const service = serviceBySlug(slug)
  if (!service) notFound()

  const graph = [
    serviceSchema({
      ...service,
      priceRange: service.engagement?.typicalRange,
    }),
    breadcrumbSchema([
      { href: '/site/services', label: 'Services' },
      { href: `/site/services/${service.slug}`, label: service.name },
    ]),
    // The FAQ rendered on the page and the FAQ in the markup come from the
    // same array, so an answer engine cannot be told about an answer the
    // reader cannot see.
    ...(service.faq ? [faqPageSchema(service.faq, `/site/services/${service.slug}`)] : []),
  ]

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(graph) }}
      />
      <ServiceDetailPage service={service} />
    </>
  )
}
