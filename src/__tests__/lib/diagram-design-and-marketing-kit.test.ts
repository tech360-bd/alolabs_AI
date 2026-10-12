/**
 * Diagram Design + Marketing Kit — integrity tests.
 *
 * These are the executable form of the design system's taste gate against the
 * shipped example set, plus provenance checks for the imported marketing kit.
 */

import { describe, it, expect } from 'vitest'
import { EXAMPLES } from '@/lib/diagram-design/examples'
import { renderDiagram } from '@/lib/diagram-design/render'
import { sceneToHtml, sceneToSvg } from '@/lib/diagram-design/export'
import { KINDS, KIND_MAP, UNIVERSAL_BUDGET } from '@/lib/diagram-design/tokens'
import { pathHasDiagonal } from '@/lib/diagram-design/geometry'
import {
  MARKETING_CATALOG,
  allMarketingSkills,
  marketingCategories,
  getMarketingSkill,
  searchMarketingSkills,
  marketingKitStats,
} from '@/lib/marketing-kit'
import { contentStats, referenceDoc, skillBody } from '@/lib/marketing-kit/content'

describe('diagram design — catalogue', () => {
  it('covers every visual type with an implementation and exactly one example', () => {
    expect(KINDS.length).toBe(44)
    expect(EXAMPLES.length).toBe(44)
    for (const meta of KINDS) {
      expect(KIND_MAP[meta.kind], `${meta.kind} missing from KIND_MAP`).toBeTruthy()
      const examples = EXAMPLES.filter((e) => e.kind === meta.kind)
      expect(examples.length, `${meta.kind} has ${examples.length} examples`).toBe(1)
    }
  })

  it('uses unique slugs', () => {
    const slugs = EXAMPLES.map((e) => e.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})

describe('diagram design — rendering every type', () => {
  it.each(EXAMPLES.map((e) => [e.kind, e] as const))('renders %s without throwing', (_kind, spec) => {
    const scene = renderDiagram(spec)
    expect(scene.items.length).toBeGreaterThan(0)
    expect(scene.aria.title).toBe(spec.title)
    expect(scene.aria.desc.length).toBeGreaterThan(20)
  })

  it('keeps every example inside its complexity budget', () => {
    const failures: string[] = []
    for (const spec of EXAMPLES) {
      const scene = renderDiagram(spec)
      const audit = scene.audit!
      const budgetFail = audit.findings.filter((f) => f.level === 'fail' && f.rule.startsWith('§7'))
      if (budgetFail.length) failures.push(`${spec.kind}: ${budgetFail.map((f) => f.message).join('; ')}`)
    }
    expect(failures).toEqual([])
  })

  it('passes the full taste gate for every example — no fails, no warnings', () => {
    const findings: string[] = []
    for (const spec of EXAMPLES) {
      const audit = renderDiagram(spec).audit!
      for (const f of audit.findings) {
        if (f.level !== 'pass') findings.push(`${spec.kind} [${f.level}] ${f.rule}: ${f.message}`)
      }
    }
    expect(findings).toEqual([])
  })

  it('emits a legend whenever more than one node treatment is in play', () => {
    const missing: string[] = []
    for (const spec of EXAMPLES) {
      const audit = renderDiagram(spec).audit!
      const legendFinding = audit.findings.find((f) => f.rule === '§9 legend')
      if (legendFinding?.level !== 'pass') missing.push(`${spec.kind}: ${legendFinding?.message}`)
    }
    expect(missing).toEqual([])
  })

  it('ships no diagonal connectors anywhere in the example set', () => {
    // A connector is a path that carries an arrow marker. Data series carry no
    // marker; flywheel and radial types legitimately use `A` arc commands.
    const offenders: string[] = []
    for (const spec of EXAMPLES) {
      const scene = renderDiagram(spec)
      for (const item of scene.items) {
        if (item.prim.t !== 'path') continue
        const prim = item.prim as { d: string; marker?: string }
        if (!prim.marker || /A\s/.test(prim.d)) continue
        if (pathHasDiagonal(prim.d)) offenders.push(`${spec.kind}:${item.id ?? '?'}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('honours the universal budget on focal elements and callouts', () => {
    for (const spec of EXAMPLES) {
      const scene = renderDiagram(spec)
      expect(scene.audit!.counts.focal).toBeLessThanOrEqual(UNIVERSAL_BUDGET.maxFocal)
      expect(scene.audit!.counts.callouts).toBeLessThanOrEqual(UNIVERSAL_BUDGET.maxCallouts)
    }
  })

  it('keeps node geometry on the 4px grid', () => {
    for (const spec of EXAMPLES) {
      const scene = renderDiagram(spec)
      const boxes = scene.items
        .filter((i) => i.prim.t === 'rect' && i.layer === 41)
        .map((i) => i.prim as { x: number; y: number; w: number; h: number })
      for (const b of boxes) {
        expect(b.x % 4, `${spec.kind} x=${b.x}`).toBe(0)
        expect(b.y % 4, `${spec.kind} y=${b.y}`).toBe(0)
      }
    }
  })

  it('renders each type in all three variants without throwing', () => {
    const sample = EXAMPLES.filter((e) =>
      ['architecture', 'flowchart', 'bar', 'quadrant', 'sequence', 'kanban'].includes(e.kind),
    )
    for (const spec of sample) {
      for (const variant of ['minimal', 'editorial'] as const) {
        for (const theme of ['light', 'dark'] as const) {
          const scene = renderDiagram({ ...spec, variant, theme, slug: `${spec.slug}-${variant}-${theme}` })
          expect(scene.items.length).toBeGreaterThan(0)
        }
      }
    }
  })
})

describe('diagram design — export contract', () => {
  it('emits an accessible, script-free standalone SVG', () => {
    const spec = EXAMPLES[0]
    const svg = sceneToSvg(renderDiagram(spec))
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain(`id="${spec.slug}-title"`)
    expect(svg).toContain(`id="${spec.slug}-desc"`)
    // <title> must be the first child after the opening tag.
    const afterOpen = svg.slice(svg.indexOf('>') + 1).trimStart()
    expect(afterOpen.startsWith('<title')).toBe(true)
    expect(svg).not.toContain('<script')
    expect(svg).toContain('arrow-accent')
  })

  it('emits a self-contained HTML document with the font link and no build step', () => {
    const html = sceneToHtml(renderDiagram(EXAMPLES[1]))
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('fonts.googleapis.com')
    expect(html).not.toContain('<script')
    expect(html).toContain('</html>')
  })
})

describe('marketing kit — provenance and coverage', () => {
  it('imported the full library with MIT provenance', () => {
    expect(MARKETING_CATALOG.totalSkills).toBe(50)
    expect(MARKETING_CATALOG.license).toBe('MIT')
    expect(MARKETING_CATALOG.source).toContain('marketingskills')
  })

  it('categorises every skill', () => {
    const uncategorised = allMarketingSkills().filter((s) => s.category === 'Uncategorised')
    expect(uncategorised.map((s) => s.slug)).toEqual([])
    const counts = marketingCategories().reduce((a, c) => a + c.count, 0)
    expect(counts).toBe(allMarketingSkills().length)
  })

  it('has a playbook body, version and reference index for every skill', () => {
    // Upstream ships no reference documents for four playbooks; they are listed
    // here explicitly so a regression (a body silently disappearing) still fails.
    const noReferencesUpstream = ['marketing-psychology', 'popups', 'product-marketing', 'signup']
    const withoutRefs: string[] = []
    for (const skill of allMarketingSkills()) {
      const body = skillBody(skill.slug)
      expect(body, `${skill.slug} has no body`).toBeTruthy()
      expect(body!.length).toBeGreaterThan(500)
      expect(skill.version).toMatch(/^\d+\.\d+\.\d+$/)
      expect(skill.description.length).toBeGreaterThan(50)
      if (skill.references.length === 0) withoutRefs.push(skill.slug)
    }
    expect(withoutRefs.sort()).toEqual(noReferencesUpstream.sort())
    const withRefs = allMarketingSkills().filter((s) => s.references.length > 0).length
    expect(withRefs).toBeGreaterThanOrEqual(45)
  })

  it('serves reference documents on demand', () => {
    const skill = getMarketingSkill('cro')
    expect(skill).toBeTruthy()
    const ref = skill!.references[0]
    const doc = referenceDoc('cro', ref.path)
    expect(doc, 'reference body missing').toBeTruthy()
    expect(doc!.content.length).toBeGreaterThan(100)
  })

  it('searches across title, description and category', () => {
    expect(searchMarketingSkills({ q: 'paywall' }).length).toBeGreaterThan(0)
    expect(searchMarketingSkills({ category: 'Paid & Measurement' }).length).toBeGreaterThan(3)
    expect(searchMarketingSkills({ q: 'zzzz-no-match' })).toEqual([])
  })

  it('reports sane statistics', () => {
    const stats = marketingKitStats()
    const content = contentStats()
    expect(stats.skills).toBe(50)
    expect(stats.references).toBeGreaterThan(150)
    expect(stats.categories).toBe(7)
    expect(content.characters).toBeGreaterThan(500_000)
  })
})
