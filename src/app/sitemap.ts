import type { MetadataRoute } from 'next'

/**
 * Public, canonical routes only. Private surfaces (client portal, internal
 * AgentOS pages, login) and redirecting routes are deliberately omitted so
 * search engines never see internal URL structure.
 */
const PUBLIC_PATHS: { path: string; priority: number; changeFrequency: 'weekly' | 'monthly' | 'yearly' }[] = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: '/site/solutions', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/site/services', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/site/how-we-work', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/site/projects', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/site/about', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/site/careers', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/site/contact', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/site/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/site/terms', priority: 0.3, changeFrequency: 'yearly' },
]

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.alolabs.net').replace(/\/+$/, '')
  const lastModified = new Date()
  return PUBLIC_PATHS.map(({ path, priority, changeFrequency }) => ({
    url: `${baseUrl}${path === '/' ? '' : path}`,
    lastModified,
    changeFrequency,
    priority,
  }))
}
