import { describe, expect, it } from 'vitest'

import {
  absoluteUrl,
  breadcrumbSchema,
  jsonLd,
  organizationSchema,
  serviceCatalogSchema,
  serviceSchema,
  websiteSchema,
} from '@/lib/seo/structured-data'
import { PUBLIC_ORIGIN } from '@/lib/brand/agentos-3d'
import { SERVICE_LINES, serviceBySlug } from '@/lib/brand/service-lines'

describe('service lines', () => {
  it('has exactly twelve, with unique slugs', () => {
    expect(SERVICE_LINES).toHaveLength(12)
    const slugs = SERVICE_LINES.map((s) => s.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('gives every line a real delivery state and a reason for it', () => {
    // The brief forbids claiming a service is operational unless delivery is
    // verified, so no entry may omit its state note.
    for (const s of SERVICE_LINES) {
      expect(['delivered', 'available', 'project']).toContain(s.state)
      expect(s.stateNote.length).toBeGreaterThan(30)
    }
  })

  it('never marks a line delivered without saying why', () => {
    const delivered = SERVICE_LINES.filter((s) => s.state === 'delivered')
    expect(delivered.length).toBeGreaterThan(0)
    for (const s of delivered) {
      expect(s.stateNote.toLowerCase()).toMatch(/own|running|live|shipped|platform/)
    }
  })

  it('fills every content field a detail page renders', () => {
    for (const s of SERVICE_LINES) {
      expect(s.name.length).toBeGreaterThan(3)
      expect(s.tagline.length).toBeGreaterThan(20)
      expect(s.problem.length).toBeGreaterThan(40)
      expect(s.description.length).toBeGreaterThan(60)
      expect(s.deliverables.length).toBeGreaterThanOrEqual(3)
      expect(s.stack.length).toBeGreaterThanOrEqual(3)
      expect(s.outcomes.length).toBeGreaterThanOrEqual(2)
      expect(['Build', 'Intelligence', 'Operations']).toContain(s.category)
    }
  })

  it('groups the twelve into the three index sections without gaps', () => {
    const counts = { Build: 0, Intelligence: 0, Operations: 0 }
    for (const s of SERVICE_LINES) counts[s.category] += 1
    expect(counts.Build + counts.Intelligence + counts.Operations).toBe(12)
  })

  it('resolves by slug and returns undefined for junk', () => {
    expect(serviceBySlug('ai-agent-development')?.name).toBe('AI Agent Development')
    expect(serviceBySlug('not-a-service')).toBeUndefined()
    expect(serviceBySlug('')).toBeUndefined()
  })

  it('covers all twelve services named in the brief', () => {
    const required = [
      'AI Software Development',
      'AI Agent Development',
      'Multi-Agent AI Systems',
      'Business Process Automation',
      'Websites & Web Applications',
      'Enterprise CRM & Business Platforms',
      'AI Marketing & SEO',
      'AI Image & Video Production',
      'Voice & Conversational AI',
      'API & System Integration',
      'Data Intelligence & Analytics',
      'Cloud & DevOps Engineering',
    ]
    const names = SERVICE_LINES.map((s) => s.name)
    for (const name of required) expect(names).toContain(name)
  })
})

describe('absoluteUrl', () => {
  it('builds canonical URLs on the public origin', () => {
    expect(absoluteUrl('/site/services')).toBe(`${PUBLIC_ORIGIN}/site/services`)
    expect(absoluteUrl('site/services')).toBe(`${PUBLIC_ORIGIN}/site/services`)
  })

  it('leaves an absolute URL alone', () => {
    expect(absoluteUrl('https://example.com/x')).toBe('https://example.com/x')
  })
})

describe('organisation schema', () => {
  const org = organizationSchema()

  it('identifies the organisation and its public contact point', () => {
    expect(org['@type']).toBe('Organization')
    expect(org.name).toBe('ALO Labs')
    expect(org.url).toBe(PUBLIC_ORIGIN)
    expect(org.email).toContain('@alolabs.net')
    expect(org.logo).toContain('/brand/')
  })

  it('lists the services the pages actually offer', () => {
    expect(org.knowsAbout).toHaveLength(SERVICE_LINES.length)
    for (const s of SERVICE_LINES) expect(org.knowsAbout).toContain(s.name)
  })

  it('does not claim ratings, awards or founding dates we cannot evidence', () => {
    // Guard against the usual schema padding that invents trust signals.
    for (const key of ['aggregateRating', 'review', 'award', 'numberOfEmployees', 'revenue']) {
      expect(org).not.toHaveProperty(key)
    }
  })
})

describe('website schema', () => {
  it('points at the organisation as publisher', () => {
    const site = websiteSchema()
    expect(site['@type']).toBe('WebSite')
    expect(site.url).toBe(PUBLIC_ORIGIN)
    expect(site.publisher).toEqual({ '@id': `${PUBLIC_ORIGIN}/#organization` })
  })
})

describe('service schema', () => {
  it('describes a single line with the org as provider', () => {
    const line = SERVICE_LINES[0]
    const schema = serviceSchema(line)
    expect(schema['@type']).toBe('Service')
    expect(schema.name).toBe(line.name)
    expect(schema.url).toBe(`${PUBLIC_ORIGIN}/site/services/${line.slug}`)
    expect(schema.provider).toEqual({ '@id': `${PUBLIC_ORIGIN}/#organization` })
  })

  it('enumerates every line in the catalogue', () => {
    const cat = serviceCatalogSchema()
    expect(cat['@type']).toBe('ItemList')
    expect(cat.numberOfItems).toBe(12)
    expect(cat.itemListElement).toHaveLength(12)
    expect(cat.itemListElement[0].position).toBe(1)
    expect(cat.itemListElement[11].position).toBe(12)
  })
})

describe('breadcrumbs', () => {
  it('numbers the trail in order from one', () => {
    const bc = breadcrumbSchema([
      { href: '/site/services', label: 'Services' },
      { href: '/site/services/ai-agent-development', label: 'AI Agent Development' },
    ])
    expect(bc['@type']).toBe('BreadcrumbList')
    expect(bc.itemListElement.map((i) => i.position)).toEqual([1, 2])
    expect(bc.itemListElement[1].item).toBe(`${PUBLIC_ORIGIN}/site/services/ai-agent-development`)
  })
})

describe('jsonLd serialisation', () => {
  it('produces valid JSON', () => {
    const out = jsonLd(organizationSchema())
    expect(() => JSON.parse(out)).not.toThrow()
  })

  it('escapes < so copy cannot close the script block', () => {
    // A stored "</script>" in any rendered field would be an XSS vector on a
    // public page if it were serialised raw.
    const payload = jsonLd({ '@type': 'Thing', name: '</script><img src=x onerror=alert(1)>' })
    expect(payload).not.toContain('</script>')
    expect(payload).toContain('\\u003c')
    expect(JSON.parse(payload).name).toContain('</script>')
  })

  it('accepts a graph array', () => {
    const out = jsonLd([organizationSchema(), websiteSchema()])
    const parsed = JSON.parse(out) as unknown[]
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(2)
  })
})
