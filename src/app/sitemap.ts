import type { MetadataRoute } from 'next'

/**
 * Sitemap — public pages only.
 *
 * `/dashboard` is deliberately absent: it is a private, noindex application and
 * listing it would advertise the login wall to crawlers. `/login` is absent for
 * the same reason.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // Canonical public origin. Falls back to the production domain rather than a
  // placeholder — a wrong hostname here produces a sitemap of dead links.
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://alolabs.net').replace(/\/+$/, '')
  const lastModified = new Date()

  const publicPaths: { path: string; priority: number; changeFrequency: 'weekly' | 'monthly' }[] = [
    { path: '/', priority: 1, changeFrequency: 'weekly' },
    { path: '/brand', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/design', priority: 0.5, changeFrequency: 'monthly' },
    { path: '/invoice', priority: 0.3, changeFrequency: 'monthly' },
const SITE_PAGES: { path: string; priority: number; changeFrequency: 'weekly' | 'monthly' }[] = [
  { path: '/site', priority: 1, changeFrequency: 'weekly' },
  { path: '/site/platform', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/site/solutions', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/site/work', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/site/pricing', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/site/insights', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/site/about', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/site/careers', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/site/contact', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/site/press', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/site/diagrams', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/design', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/brand', priority: 0.6, changeFrequency: 'monthly' },
]

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.alolabs.net').replace(/\/$/, '')
  const now = new Date()
  return [
    { url: baseUrl, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    ...SITE_PAGES.map((page) => ({
      url: `${baseUrl}${page.path}`,
      lastModified: now,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    })),
  ]

  return publicPaths.map(({ path, priority, changeFrequency }) => ({
    url: `${baseUrl}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }))
}
