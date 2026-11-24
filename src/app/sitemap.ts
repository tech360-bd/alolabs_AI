import type { MetadataRoute } from 'next'

import { SERVICE_LINES } from '@/lib/brand/service-lines'
import { BUSINESS_SOLUTIONS } from '@/lib/brand/solutions'
import { SHOWCASE_PROJECTS } from '@/lib/brand/projects'

/**
 * Public, canonical routes only. Private surfaces (client portal, internal
 * AgentOS pages, login) and redirecting routes are deliberately omitted so
 * search engines never see internal URL structure.
 */
const PUBLIC_PATHS: { path: string; priority: number; changeFrequency: 'weekly' | 'monthly' | 'yearly' }[] = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: '/site/services', priority: 0.95, changeFrequency: 'weekly' },
  { path: '/site/platform-overview', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/site/solutions', priority: 0.85, changeFrequency: 'weekly' },
  { path: '/site/how-we-work', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/site/projects', priority: 0.8, changeFrequency: 'monthly' },
  // Conversion pages. These are the routes the site exists to drive traffic to,
  // so they are crawlable rather than excluded as "utility" pages.
  { path: '/site/start-a-project', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/site/request-a-solution', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/site/book-a-consultation', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/site/about', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/site/careers', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/site/contact', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/site/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/site/terms', priority: 0.3, changeFrequency: 'yearly' },
]

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.alolabs.net').replace(/\/+$/, '')
  const lastModified = new Date()
  const pages = PUBLIC_PATHS.map(({ path, priority, changeFrequency }) => ({
    url: `${baseUrl}${path === '/' ? '' : path}`,
    lastModified,
    changeFrequency,
    priority,
  }))

  // One entry per service line, generated from the same data the pages render,
  // so the sitemap cannot list a slug that 404s.
  const services = SERVICE_LINES.map((s) => ({
    url: `${baseUrl}/site/services/${s.slug}`,
    lastModified,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }))

  // One entry per business solution — generated from the same data the pages
  // render, so the sitemap cannot list a slug that 404s.
  const solutions = BUSINESS_SOLUTIONS.map((s) => ({
    url: `${baseUrl}/site/solutions/${s.slug}`,
    lastModified,
    changeFrequency: 'monthly' as const,
    priority: 0.85,
  }))

  // One entry per published case study.
  const projects = SHOWCASE_PROJECTS.map((p) => ({
    url: `${baseUrl}/site/projects/${p.slug}`,
    lastModified,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }))

  return [...pages, ...services, ...solutions, ...projects]
}
