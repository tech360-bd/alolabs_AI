import { afterEach, describe, expect, it } from 'vitest'
import sitemap from '@/app/sitemap'

const originalUrl = process.env.NEXT_PUBLIC_APP_URL

afterEach(() => {
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL
  else process.env.NEXT_PUBLIC_APP_URL = originalUrl
})

describe('public sitemap', () => {
  it('lists canonical public routes once and excludes private and redirecting routes', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.com///'
    const urls = sitemap().map((entry) => entry.url)
    expect(urls).toContain('https://example.com')
    expect(urls).toContain('https://example.com/site/solutions')
    expect(urls).toContain('https://example.com/site/services')
    expect(urls).toContain('https://example.com/site/how-we-work')
    expect(urls).toContain('https://example.com/site/projects')
    expect(urls).toContain('https://example.com/site/about')
    expect(urls).toContain('https://example.com/site/careers')
    expect(urls).toContain('https://example.com/site/contact')
    expect(urls).toContain('https://example.com/site/privacy')
    expect(urls).toContain('https://example.com/site/terms')
    expect(urls).not.toContain('https://example.com/site')
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('lists every public service page exactly once', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.com'
    const urls = sitemap().map((entry) => entry.url)
    expect(urls).toContain('https://example.com/site/platform-overview')
    // One page per service line, generated from SERVICE_LINES.
    const serviceUrls = urls.filter((u) => u.includes('/site/services/'))
    expect(serviceUrls).toHaveLength(12)
    expect(new Set(serviceUrls).size).toBe(12)
    expect(serviceUrls).toContain('https://example.com/site/services/ai-agent-development')
    // The slug-less index is also present.
    expect(urls).toContain('https://example.com/site/services')
  })

  it('never advertises private or internal surfaces to search engines', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.com'
    const urls = sitemap().map((entry) => entry.url)
    for (const privatePath of [
      '/login',
      '/dashboard',
      '/portal',
      '/brand',
      '/design',
      '/invoice',
      // Internal reference pages (INTERNAL_PAGE_PREFIXES in src/lib/access/surfaces.ts).
      '/site/platform',
      '/site/pricing',
      '/site/diagrams',
      '/site/press',
      '/site/insights',
      '/site/work',
    ]) {
      expect(urls, `${privatePath} must not be in the sitemap`).not.toContain(`https://example.com${privatePath}`)
    }
  })
})
