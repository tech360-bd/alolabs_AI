import { sceneToSvg } from '@/lib/diagram-design/export'
/**
 * Diagram motion, importers and sketchy/terminal wiring — behavioural tests.
 */

import { describe, it, expect } from 'vitest'
import {
  MOTION_CLOCK,
  announceFor,
  clampStep,
  isVisibleAt,
  keyToIntent,
  parseMotionQuery,
  stepOfId,
  totalDurationMs,
  validateMotion,
  type MotionStep,
} from '@/lib/diagram-design/motion'
import { MOTION_EXAMPLES } from '@/lib/diagram-design/motion-examples'
import { renderDiagram } from '@/lib/diagram-design/render'
import {
  ImportError,
  importDiagram,
  mermaidBlocks,
  parseDrawio,
  parseExcalidraw,
  parseMermaid,
} from '@/lib/diagram-design/importers'
import { IMPORT_SAMPLES } from '@/lib/diagram-design/import-samples'

const STEPS: MotionStep[] = [
  { label: 'First', ids: ['a'] },
  { label: 'Second', ids: ['b', 'c'] },
  { label: 'Third', ids: ['d'] },
]

describe('motion — timing and step model', () => {
  it('keeps one clock and the 8s budget', () => {
    expect(MOTION_CLOCK.hold).toBe(720)
    expect(MOTION_CLOCK.step).toBe(480)
    expect(MOTION_CLOCK.fast).toBe(160)
    expect(totalDurationMs(3)).toBe(2160)
    expect(totalDurationMs(MOTION_CLOCK.maxSteps)).toBeLessThanOrEqual(MOTION_CLOCK.totalBudget)
  })

  it('maps ids to 1-based steps and leaves unmarked items always visible', () => {
    expect(stepOfId(STEPS, 'a')).toBe(1)
    expect(stepOfId(STEPS, 'c')).toBe(2)
    expect(stepOfId(STEPS, 'zzz')).toBeNull()
    expect(isVisibleAt(STEPS, 'zzz', 0)).toBe(true)
    expect(isVisibleAt(STEPS, 'd', 2)).toBe(false)
    expect(isVisibleAt(STEPS, 'd', 3)).toBe(true)
    expect(isVisibleAt(STEPS, 'b', 1)).toBe(false)
  })

  it('clamps steps and announces in the documented form', () => {
    expect(clampStep(-4, 3)).toBe(0)
    expect(clampStep(9, 3)).toBe(3)
    expect(clampStep(1.7, 3)).toBe(1)
    expect(clampStep(Number.NaN, 3)).toBe(0)
    expect(announceFor(STEPS, 2, 3)).toBe('Step 2 of 3: Second')
    expect(announceFor(STEPS, 0, 3)).toBe('Step 0 of 3: Ready')
  })
})

describe('motion — capture overrides', () => {
  it('honours static and exact-step overrides only when valid', () => {
    expect(parseMotionQuery('?motion=static', 3)).toEqual({ forceStatic: true, exactStep: null })
    expect(parseMotionQuery('?motion=step&step=2', 3)).toEqual({ forceStatic: false, exactStep: 2 })
    expect(parseMotionQuery('?motion=step&step=2.5', 3).exactStep).toBeNull()
    expect(parseMotionQuery('?motion=step&step=-1', 3).exactStep).toBeNull()
    expect(parseMotionQuery('?motion=step&step=4', 3).exactStep).toBeNull()
    expect(parseMotionQuery('?motion=step&step=abc', 3).exactStep).toBeNull()
    expect(parseMotionQuery('?step=1', 3).exactStep).toBeNull()
  })
})

describe('motion — validation', () => {
  const known = new Set(['a', 'b', 'c', 'd'])
  it('passes a well-formed step declaration', () => {
    expect(validateMotion({ mode: 'step', steps: STEPS }, known).filter((i) => i.level === 'error')).toEqual([])
  })
  it('rejects unknown ids, duplicate marks, too many steps and missing labels', () => {
    const issues = validateMotion(
      {
        mode: 'step',
        steps: [
          { label: 'x', ids: ['a', 'ghost'] },
          { label: '', ids: ['a'] },
          ...Array.from({ length: 8 }, (_, i) => ({ label: `s${i}`, ids: [] as string[] })),
        ],
      },
      known,
    )
    const messages = issues.map((i) => i.message).join(' | ')
    expect(messages).toMatch(/unknown item "ghost"/)
    expect(messages).toMatch(/marked in step 1 and step 2/)
    expect(messages).toMatch(/has no label/)
    expect(messages).toMatch(/exceed the 8-step limit/)
  })
  it('requires at least one step for step and reveal modes, and none for none/loop', () => {
    expect(validateMotion({ mode: 'step', steps: [] }, known)[0]?.level).toBe('error')
    expect(validateMotion({ mode: 'reveal' }, known)[0]?.level).toBe('error')
    expect(validateMotion({ mode: 'none' }, known)).toEqual([])
    expect(validateMotion({ mode: 'loop' }, known)).toEqual([])
  })
})

describe('motion — keyboard contract', () => {
  const none = {}
  it('maps arrows, Home, End, Space and R as documented', () => {
    expect(keyToIntent('ArrowRight', 'ArrowRight', none, false)).toEqual({ kind: 'step', to: 'next' })
    expect(keyToIntent('ArrowLeft', 'ArrowLeft', none, false)).toEqual({ kind: 'step', to: 'prev' })
    expect(keyToIntent('Home', 'Home', none, false)).toEqual({ kind: 'step', to: 'start' })
    expect(keyToIntent('End', 'End', none, false)).toEqual({ kind: 'step', to: 'end' })
    expect(keyToIntent(' ', 'Space', none, false)).toEqual({ kind: 'toggle' })
    expect(keyToIntent('r', 'KeyR', none, false)).toEqual({ kind: 'replay' })
    expect(keyToIntent('R', 'KeyR', none, false)).toEqual({ kind: 'replay' })
  })
  it('leaves Space to native controls and never intercepts R with modifiers', () => {
    expect(keyToIntent(' ', 'Space', none, true)).toBeNull()
    expect(keyToIntent('r', 'KeyR', { ctrl: true }, false)).toBeNull()
    expect(keyToIntent('r', 'KeyR', { meta: true }, false)).toBeNull()
    expect(keyToIntent('r', 'KeyR', { alt: true }, false)).toBeNull()
    expect(keyToIntent('a', 'KeyA', none, false)).toBeNull()
  })
})

describe('motion — example figures', () => {
  it('builds step, reveal and loop variants whose marks all resolve to real items', () => {
    expect(MOTION_EXAMPLES.map((m) => m.id)).toEqual(['step', 'reveal', 'loop'])
    for (const m of MOTION_EXAMPLES) {
      const scene = renderDiagram(m.spec)
      const known = new Set(scene.items.flatMap((i) => [i.id, i.group]).filter((x): x is string => Boolean(x)))
      const errors = validateMotion(m.spec.motion, known).filter((i) => i.level === 'error')
      expect(errors, `${m.id} motion errors`).toEqual([])
      // Every marked step resolves to at least one primitive, so nothing is marked in name only.
      for (const step of m.spec.motion?.steps ?? []) {
        for (const id of step.ids) expect(scene.items.some((i) => i.group === id || i.id === id), id).toBe(true)
      }
    }
  })

  it('keeps the static export complete and script-free regardless of motion', () => {
    const step = MOTION_EXAMPLES.find((m) => m.id === 'step')!
    const withMotion = sceneToSvg(renderDiagram(step.spec))
    const plain = sceneToSvg(renderDiagram({ ...step.spec, motion: undefined }))
    expect(withMotion).toBe(plain)
    expect(withMotion).not.toMatch(/<script|data-motion/)
  })

  it('sketchy export wraps shapes in one filter and keeps text outside it', () => {
    const base = MOTION_EXAMPLES.find((m) => m.id === 'step')!.spec
    const svg = sceneToSvg(renderDiagram({ ...base, motion: undefined }), { sketchy: true })
    expect(svg).toMatch(/<filter id="[^"]+sketchy"/)
    const filtered = svg.slice(svg.indexOf('<g filter='), svg.indexOf('</g>', svg.indexOf('<g filter=')))
    expect(filtered).not.toMatch(/<text/)
  })
})

describe('importers — Mermaid', () => {
  it('redraws a flowchart with shapes, labels and dashed branches', () => {
    const ir = parseMermaid(IMPORT_SAMPLES.mermaid.source)
    expect(ir.kind).toBe('flowchart')
    expect(ir.direction).toBe('vertical')
    const ids = ir.nodes.map((n) => n.id)
    expect(ids).toEqual(expect.arrayContaining(['A', 'B', 'C', 'D', 'E', 'F']))
    expect(ir.nodes.find((n) => n.id === 'B')?.shape).toBe('decision')
    expect(ir.nodes.find((n) => n.id === 'C')?.kind).toBe('store')
    expect(ir.edges.find((e) => e.from === 'B' && e.to === 'C')?.label).toBe('low')
    expect(ir.edges.find((e) => e.from === 'B' && e.to === 'D')?.label).toBe('high')
    expect(ir.ledger.some((l) => /click/.test(l.detail))).toBe(true)
    expect(ir.ledger.some((l) => /styling/.test(l.detail))).toBe(true)
  })

  it('splits chained and &-joined edges and keeps case-distinct ids apart', () => {
    const ir = parseMermaid('flowchart LR\n  A & B --> C --> D\n  a --> d')
    expect(ir.direction).toBe('horizontal')
    expect(ir.edges.map((e) => `${e.from}>${e.to}`)).toEqual(['A>C', 'B>C', 'C>D', 'a>d'])
  })

  it('handles compact and spaced labels and the <--> operator', () => {
    const ir = parseMermaid('graph TD\n  A--yes-->B\n  B-- "no, retry" -->C\n  C<-->D')
    expect(ir.edges.find((e) => e.from === 'A')?.label).toBe('yes')
    expect(ir.edges.find((e) => e.from === 'B' && e.to === 'C')?.label).toMatch(/^no, ret/)
    expect(ir.edges.some((e) => e.from === 'C' && e.to === 'D')).toBe(true)
  })

  it('reports malformed edges with the line number instead of guessing', () => {
    expect(() => parseMermaid('flowchart TD\n  A -->\n  B --> C')).toThrow(/malformed edge at line 2/)
  })

  it('parses sequence diagrams into actors and messages', () => {
    const ir = parseMermaid('sequenceDiagram\n  participant U as User\n  U->>API: POST /skills\n  API-->>U: 201 created\n  Note over U: done')
    expect(ir.kind).toBe('sequence')
    expect(ir.nodes.find((n) => n.id === 'U')?.name).toBe('User')
    expect(ir.edges).toHaveLength(2)
    expect(ir.edges[1].dashed).toBe(true)
    expect(ir.ledger.some((l) => /note/.test(l.detail))).toBe(true)
  })

  it('parses state diagrams with start and end markers', () => {
    const ir = parseMermaid('stateDiagram-v2\n  [*] --> Draft\n  Draft --> Review : submit\n  Review --> [*]')
    expect(ir.kind).toBe('state')
    expect(ir.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['start', 'Draft', 'Review', 'end']))
    expect(ir.edges.find((e) => e.from === 'Draft')?.label).toBe('submit')
  })

  it('parses ER entities, columns and cardinality', () => {
    const ir = parseMermaid(
      'erDiagram\n  CUSTOMER {\n    string name PK\n    int id\n  }\n  CUSTOMER ||--o{ ORDER : places',
    )
    expect(ir.kind).toBe('er')
    const cust = ir.tables?.find((t) => t.name === 'CUSTOMER')
    expect(cust?.columns[0]).toMatchObject({ name: 'name', type: 'string', pk: true })
    expect(ir.edges[0]).toMatchObject({ from: 'CUSTOMER', to: 'ORDER' })
    expect(ir.edges[0].label).toBe('places')
  })

  it('selects one block from Markdown and rejects unsupported kinds verbatim', () => {
    const md = '```mermaid\npie title x\n```\n\n```mermaid\nflowchart TD\n  A --> B\n```'
    expect(mermaidBlocks(md)).toHaveLength(2)
    expect(() => parseMermaid(md, { diagram: 0 })).toThrow(ImportError)
    expect(parseMermaid(md, { diagram: 1 }).edges).toHaveLength(1)
  })

  it('enforces the source and node limits', () => {
    const many = ['flowchart TD', ...Array.from({ length: 90 }, (_, i) => `  N${i} --> N${i + 1}`)].join('\n')
    expect(() => parseMermaid(many)).toThrow(/node limit/)
  })
})

describe('importers — draw.io and Excalidraw', () => {
  it('redraws draw.io cells, shapes and connectors with labels', () => {
    const ir = parseDrawio(IMPORT_SAMPLES.drawio.source)
    expect(ir.nodes.map((n) => n.name)).toEqual(['Request', 'Policy', 'Audit log'])
    expect(ir.nodes.find((n) => n.name === 'Policy')?.shape).toBe('decision')
    expect(ir.nodes.find((n) => n.name === 'Audit log')?.kind).toBe('store')
    expect(ir.edges).toHaveLength(2)
    expect(ir.edges[0].label).toBe('checked')
  })

  it('refuses compressed pages and non-draw.io input with clear messages', () => {
    expect(() => parseDrawio('<mxfile><diagram name="p">AAAAbase64==</diagram></mxfile>')).toThrow(/uncompressed/)
    expect(() => parseDrawio('<html></html>')).toThrow(/not a draw.io file/)
  })

  it('redraws Excalidraw shapes with bound labels and bound arrows', () => {
    const ir = parseExcalidraw(IMPORT_SAMPLES.excalidraw.source)
    expect(ir.nodes.map((n) => n.name).sort()).toEqual(['Accepted', 'Request', 'Valid?'])
    expect(ir.nodes.find((n) => n.name === 'Valid?')?.shape).toBe('decision')
    expect(ir.edges).toHaveLength(2)
  })

  it('reports invalid Excalidraw JSON and drops unbound arrows into the ledger', () => {
    expect(() => parseExcalidraw('{nope')).toThrow(/not valid Excalidraw JSON/)
    const src = JSON.stringify({ elements: [{ id: 'r', type: 'rectangle', boundElements: [] }, { id: 'rt', type: 'text', text: 'Only', containerId: 'r' }, { id: 'x', type: 'arrow' }] })
    const ir = parseExcalidraw(src)
    expect(ir.edges).toHaveLength(0)
    expect(ir.ledger.some((l) => /arrow\(s\) dropped/.test(l.detail))).toBe(true)
  })
})

describe('importers — end to end', () => {
  it('produces a renderable, audited figure and a ledger for every sample', () => {
    for (const format of ['mermaid', 'drawio', 'excalidraw'] as const) {
      const result = importDiagram(format, IMPORT_SAMPLES[format].source, { slug: `t-${format}` })
      const scene = renderDiagram(result.spec)
      expect(scene.items.length, format).toBeGreaterThan(0)
      expect(result.ledger[0].detail).toMatch(/source node/)
      expect(sceneToSvg(scene)).toMatch(/^<svg/)
    }
  })
})

// ─── Marketing kit — upstream refresh and template assets ───────────────────

import { assetDoc, assetsFor, referenceDoc } from '@/lib/marketing-kit/content'
import { MARKETING_CATALOG, getMarketingSkill } from '@/lib/marketing-kit'

describe('marketing kit — upstream currency and assets', () => {
  it('matches the upstream reference count and current versions', () => {
    const refs = MARKETING_CATALOG.skills.reduce((n, s) => n + s.references.length, 0)
    expect(refs).toBe(220)
    expect(getMarketingSkill('ad-creative')?.version).toBe('2.10.0')
    expect(getMarketingSkill('referrals')?.version).toBe('2.2.0')
  })

  it('serves the creative review template as a text asset with its content type', () => {
    const doc = assetDoc('ad-creative', 'creative-review-template.html')
    expect(doc?.path).toBe('assets/creative-review-template.html')
    expect(doc?.contentType).toMatch(/^text\/html/)
    expect(doc?.content).toMatch(/<!DOCTYPE html>/i)
    expect(assetsFor('ad-creative').map((a) => a.path)).toContain('assets/creative-review-template.html')
  })

  it('refuses traversal and unknown assets', () => {
    expect(assetDoc('ad-creative', '../../etc/passwd')).toBeUndefined()
    expect(assetDoc('ad-creative', 'assets/../../package.json')).toBeUndefined()
    expect(assetDoc('ad-creative', 'assets/missing.html')).toBeUndefined()
    expect(assetDoc('cro', 'assets/creative-review-template.html')).toBeUndefined()
  })

  it('still serves reference documents for refreshed skills', () => {
    expect(referenceDoc('ad-creative', 'references/awareness-headlines.md')?.heading).toBeTruthy()
  })
})

// ─── Icons, terminal skin ───────────────────────────────────────────────────

import { DIAGRAM_ICONS } from '@/lib/diagram-design/icons.generated'
import { getIcon, hasIcon, iconMarkup } from '@/lib/diagram-design/icons'
import { ICON_SHOWCASE } from '@/lib/diagram-design/icon-examples'
import { resolveSkin, TERMINAL_SKIN } from '@/lib/diagram-design/tokens'

describe('icons — the primitive and the set', () => {
  it('carries the full upstream set across all categories', () => {
    expect(DIAGRAM_ICONS.length).toBe(87)
    const categories = new Set(DIAGRAM_ICONS.map((i) => i.category))
    for (const c of ['Compute', 'People', 'Network', 'Data', 'Kubernetes', 'DevOps', 'Brand']) {
      expect(categories.has(c)).toBe(true)
    }
    expect(new Set(DIAGRAM_ICONS.map((i) => i.name)).size).toBe(87)
  })

  it('keeps each icon on its own viewBox and carries no fixed width or height', () => {
    for (const icon of DIAGRAM_ICONS) {
      expect(icon.markup).toMatch(/^<svg\b[^>]*\sviewBox="[^"]+"/)
      expect(icon.markup.slice(0, icon.markup.indexOf('>'))).not.toMatch(/\swidth=|\sheight=/)
    }
  })

  it('places a known icon and ignores an unknown name rather than guessing', () => {
    expect(hasIcon('server')).toBe(true)
    expect(getIcon('server')?.category).toBeTruthy()
    expect(iconMarkup('server', 4, 6, 16)).toMatch(/^<svg x="4" y="6" width="16" height="16" data-icon="server"/)
    expect(iconMarkup('not-an-icon', 0, 0, 16)).toBe('')
    expect(hasIcon('postgresql')).toBe(false)
  })

  it('every icon used by the showcase resolves, and the figure passes the taste gate', () => {
    const used = ICON_SHOWCASE.nodes.map((n) => n.icon).filter((x): x is string => Boolean(x))
    expect(used.length).toBeGreaterThanOrEqual(4)
    for (const name of used) expect(hasIcon(name)).toBe(true)
    const scene = renderDiagram(ICON_SHOWCASE)
    expect(scene.items.filter((i) => i.prim.t === 'icon').length).toBe(used.length)
    const bad = scene.audit!.findings.filter((f) => f.level !== 'pass')
    expect(bad).toEqual([])
  })

  it('exports icons into standalone SVG with their own namespace-free markup', () => {
    const svg = sceneToSvg(renderDiagram(ICON_SHOWCASE), { sketchy: false })
    expect(svg).toContain('data-icon="user"')
    expect(svg).not.toContain('<script')
  })
})

describe('terminal skin', () => {
  it('uses the fixed terminal palette regardless of theme, with one accent', () => {
    expect(resolveSkin('terminal', 'light')).toBe(TERMINAL_SKIN)
    expect(resolveSkin('terminal', 'dark').accent).toBe('#ff5a36')
    expect(TERMINAL_SKIN.paper).toBe('#141414')
    expect(TERMINAL_SKIN.link).toBe(TERMINAL_SKIN.ink) // no second hue
    expect(TERMINAL_SKIN.paper).not.toBe('#000000') // never pure black
  })
})

describe('annotation leaders', () => {
  it('draws a dashed leader that lands on the target node and nowhere else', () => {
    const scene = renderDiagram(ICON_SHOWCASE)
    const gateway = scene.items.find((i) => i.id === 'gateway' && i.prim.t === 'rect')!.prim as { x: number; y: number; w: number; h: number }
    const dot = scene.items.find((i) => i.prim.t === 'circle')!.prim as { cx: number; cy: number }
    expect(dot.cx).toBe(gateway.x + gateway.w / 2)
    expect(dot.cy).toBe(gateway.y + gateway.h + 3)
    const leader = scene.items.find((i) => i.prim.t === 'path' && (i.prim as { dash?: string }).dash === '4,3')
    expect(leader).toBeDefined()
    // The note with a leader drops the hairline rule: the leader is the pointer.
    const rules = scene.items.filter((i) => i.prim.t === 'line' && i.layer === 50)
    expect(rules.length).toBe(0)
  })
})
