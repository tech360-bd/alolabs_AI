import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { CaseStudyPage } from '@/components/agentos/case-study'
import { SHOWCASE_PROJECTS, projectBySlug } from '@/lib/brand/projects'
import { absoluteUrl, breadcrumbSchema, jsonLd } from '@/lib/seo/structured-data'

/** One static page per verified project; unknown slugs 404. */
export function generateStaticParams() {
  return SHOWCASE_PROJECTS.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const project = projectBySlug(slug)
  if (!project) return {}

  const url = absoluteUrl(`/site/projects/${project.slug}`)
  const title = `${project.name} — Case Study | ALO Labs`
  const description = project.summary.slice(0, 155)

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: 'ALO Labs',
      type: 'article',
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
  const project = projectBySlug(slug)
  if (!project) notFound()

  const url = absoluteUrl(`/site/projects/${project.slug}`)
  const graph = [
    {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      '@id': url,
      headline: project.name,
      description: project.summary,
      url,
      about: project.stack,
      author: { '@id': `${absoluteUrl('/')}#organization` },
      publisher: { '@id': `${absoluteUrl('/')}#organization` },
      inLanguage: 'en',
    },
    breadcrumbSchema([
      { href: '/site/projects', label: 'Projects' },
      { href: `/site/projects/${project.slug}`, label: project.name },
    ]),
  ]

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(graph) }} />
      <CaseStudyPage project={project} />
    </>
  )
}
