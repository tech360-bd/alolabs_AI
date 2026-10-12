/**
 * Marketing Kit — the product-side surface over the imported skill library.
 *
 * Metadata only: this module is safe to import from client components. The
 * playbook bodies live in `./content`, which route handlers import server-side
 * so ~2.5MB of markdown never reaches a browser bundle.
 */

import catalog from './data/catalog.json'

export interface MarketingReference {
  path: string
  name: string
  bytes: number
  heading: string
}

export interface MarketingAsset {
  path: string
  bytes: number
}

export interface MarketingSkill {
  slug: string
  name: string
  title: string
  description: string
  version: string
  license: string
  category: string
  references: MarketingReference[]
  assets: MarketingAsset[]
  hasEvals: boolean
  bytes: number
  bodyBytes: number
}

export interface MarketingCatalog {
  source: string
  license: string
  syncedAt: string
  totalSkills: number
  categories: string[]
  skills: MarketingSkill[]
}

export const MARKETING_CATALOG = catalog as MarketingCatalog

export function allMarketingSkills(): MarketingSkill[] {
  return MARKETING_CATALOG.skills
}

export function getMarketingSkill(slug: string): MarketingSkill | undefined {
  return MARKETING_CATALOG.skills.find((s) => s.slug === slug)
}

export function marketingCategories(): { name: string; count: number }[] {
  return MARKETING_CATALOG.categories.map((name) => ({
    name,
    count: MARKETING_CATALOG.skills.filter((s) => s.category === name).length,
  }))
}

export function searchMarketingSkills(opts: { q?: string; category?: string; limit?: number } = {}): MarketingSkill[] {
  const q = (opts.q ?? '').trim().toLowerCase()
  let list = MARKETING_CATALOG.skills
  if (opts.category) list = list.filter((s) => s.category === opts.category)
  if (q) {
    list = list.filter(
      (s) =>
        s.slug.includes(q) ||
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q),
    )
  }
  return typeof opts.limit === 'number' ? list.slice(0, opts.limit) : list
}

/** Trigger phrases extracted from the description's "use when the user says" runs. */
export function skillTriggers(skill: MarketingSkill, max = 6): string[] {
  const quoted = [...skill.description.matchAll(/"([^"]{3,40})"/g)].map((m) => m[1])
  const seen = new Set<string>()
  const out: string[] = []
  for (const q of quoted) {
    const key = q.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(q)
    if (out.length >= max) break
  }
  return out
}

/** Stats for the panel header. */
export function marketingKitStats() {
  const skills = MARKETING_CATALOG.skills
  const bytes = skills.reduce((a, s) => a + s.bytes, 0)
  const references = skills.reduce((a, s) => a + s.references.length, 0)
  return {
    skills: skills.length,
    categories: MARKETING_CATALOG.categories.length,
    references,
    kilobytes: Math.round(bytes / 1024),
    syncedAt: MARKETING_CATALOG.syncedAt,
    source: MARKETING_CATALOG.source,
    license: MARKETING_CATALOG.license,
  }
}
