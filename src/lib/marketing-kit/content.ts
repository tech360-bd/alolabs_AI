/**
 * Marketing Kit — playbook content (server only).
 *
 * Imports the generated body modules. Route handlers import this file; client
 * components must use `./index` instead so the 2.5MB of markdown stays on the
 * server.
 */

import { SKILL_BODIES } from './data/skills.generated'
import { REFERENCE_BODIES } from './data/references.generated'
import { ASSET_BODIES } from './data/assets.generated'
import { getMarketingSkill, type MarketingSkill } from './index'

export function skillBody(slug: string): string | undefined {
  return SKILL_BODIES[slug]
}

export interface ReferenceDoc {
  key: string
  heading: string
  content: string
}

export function referenceDoc(slug: string, path: string): ReferenceDoc | undefined {
  const key = `${slug}/${path.startsWith('references/') ? path : `references/${path}`}`
  const doc = REFERENCE_BODIES[key] ?? REFERENCE_BODIES[key.replace(/\.md$/, '')]
  if (!doc) return undefined
  return { key, heading: doc.heading, content: doc.content }
}

export function allReferenceDocs(slug: string): ReferenceDoc[] {
  return Object.entries(REFERENCE_BODIES)
    .filter(([key]) => key.startsWith(`${slug}/`))
    .map(([key, v]) => ({ key, heading: v.heading, content: v.content }))
}

export interface AssetDoc {
  key: string
  path: string
  contentType: string
  content: string
}

const CONTENT_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  json: 'application/json; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  svg: 'image/svg+xml',
  yml: 'text/yaml; charset=utf-8',
  yaml: 'text/yaml; charset=utf-8',
}

/** A text asset (template, sample, config) shipped with a skill. Path is `assets/<file>`. */
export function assetDoc(slug: string, path: string): AssetDoc | undefined {
  const normal = path.startsWith('assets/') ? path : `assets/${path}`
  // Reject traversal: assets are keyed by exact relative path, never resolved on disk.
  if (normal.includes('..')) return undefined
  const key = `${slug}/${normal}`
  const content = ASSET_BODIES[key]
  if (content === undefined) return undefined
  const ext = normal.split('.').pop()?.toLowerCase() ?? 'txt'
  return { key, path: normal, contentType: CONTENT_TYPES[ext] ?? 'text/plain; charset=utf-8', content }
}

export function assetsFor(slug: string): AssetDoc[] {
  return Object.keys(ASSET_BODIES)
    .filter((k) => k.startsWith(`${slug}/`))
    .map((k) => assetDoc(slug, k.slice(slug.length + 1)))
    .filter((d): d is AssetDoc => Boolean(d))
}

/** A skill plus its body — the shape the detail API returns. */
export function skillWithBody(slug: string): (MarketingSkill & { body: string }) | undefined {
  const skill = getMarketingSkill(slug)
  const body = skillBody(slug)
  if (!skill || !body) return undefined
  return { ...skill, body }
}

export function contentStats() {
  return {
    skills: Object.keys(SKILL_BODIES).length,
    references: Object.keys(REFERENCE_BODIES).length,
    characters: Object.values(SKILL_BODIES).reduce((a, b) => a + b.length, 0),
  }
}
