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
  ]

  return publicPaths.map(({ path, priority, changeFrequency }) => ({
    url: `${baseUrl}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }))
}
