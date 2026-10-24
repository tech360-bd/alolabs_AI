/**
 * Gap-closing tests — every item in docs/LINK-STATUS.md §6 plus the upstream
 * delta found this round (type-service-blueprint.md, the 45th visual type).
 *
 * Covers: service-blueprint, terminal type ramp + dot-grid, annotation margin
 * placement, the nine semantic patterns, compressed draw.io import, the
 * output-spec ladders, client profiles, and URL/skill skin onboarding.
 */

import { describe, it, expect } from 'vitest'
import * as zlib from 'node:zlib'

import { EXAMPLES, getExample } from '@/lib/diagram-design/examples'
import { renderDiagram } from '@/lib/diagram-design/render'
import { sceneToSvg } from '@/lib/diagram-design/export'
import { KINDS, KIND_MAP, TYPE_RAMP, TERMINAL_SKIN, typeRampFor, dotGridColor, resolveSkin } from '@/lib/diagram-design/tokens'
import { inflateRaw, InflateError } from '@/lib/diagram-design/inflate'
import { decodeDrawioPayload, importDiagram, parseDrawio, ImportError } from '@/lib/diagram-design/importers'
import { SEMANTIC_PATTERNS, patternById, patternTemplates } from '@/lib/diagram-design/semantic-patterns'
import {
  applyAudience,
  applyDegradeLadder,
  DEFAULT_DIALS,
  describeDials,
  detailLevel,
  fidelityLedger,
  fitViewBox,
  lintAudience,
  resolveOutputDials,
  sceneSizeFor,
  SIZE_PRESETS,
  SIZE_CLASS_RAMP,
  sizePreset,
  OUTPUT_SPEC_CHECKLIST,
} from '@/lib/diagram-design/output-spec'
import {
  MemoryProfileStore,
  RESERVED_PROFILE_SLUG,
  deleteProfile,
  isValidProfileSlug,
  listProfiles,
  loadProfileVerb,
  parseProfileHeader,
  parseProjectMarker,
  renderProfileHeader,
  resetProfile,
  resolveProfile,
  saveProfile,
  serializeProfile,
  stripProfileHeader,
  suggestProfileSlug,
  updateProfile,
} from '@/lib/diagram-design/profiles'
import {
  checkContrast,
  contrastRatio,
  extractFromCss,
  extractFromHtml,
  extractFromJson,
  extractFromMarkdown,
  proposeSkin,
  proposalToSkin,
} from '@/lib/diagram-design/onboarding'

// ─── 1. Service blueprint (the 45th visual type) ─────────────────────────────

describe('service blueprint — the upstream type this repo was missing', () => {
  it('is registered as a 45th kind with exactly one example', () => {
    expect(KINDS.length).toBe(45)
    expect(KIND_MAP['service-blueprint']).toBeTruthy()
    expect(EXAMPLES.filter((e) => e.kind === 'service-blueprint')).toHaveLength(1)
  })

  it('renders the worked example with zero taste-gate findings', () => {
    const scene = renderDiagram(getExample('service-blueprint')!)
    expect(scene.items.length).toBeGreaterThan(20)
    const bad = scene.audit!.findings.filter((f) => f.level !== 'pass')
    expect(bad).toEqual([])
    expect(scene.audit!.ok).toBe(true)
  })

  it('draws the load-bearing visibility line at 2px ink @ 0.55, and the two hairlines at rule', () => {
    const scene = renderDiagram(getExample('service-blueprint')!)
    const lines = scene.items.filter((i) => i.prim.t === 'line').map((i) => i.prim as { stroke: string; strokeWidth: number })
    const visibility = lines.filter((l) => l.strokeWidth === 2)
    expect(visibility).toHaveLength(1)
    expect(visibility[0].stroke).toBe('rgba(45,49,66,0.55)')
    const hairlines = lines.filter((l) => l.strokeWidth === 1)
    expect(hairlines.length).toBe(2)
  })

  it('is a census: no connector arrows, empty required cells print an em-dash', () => {
    const spec = getExample('service-blueprint')!
    const scene = renderDiagram(spec)
    expect(scene.items.filter((i) => i.prim.t === 'path').length).toBe(0)
    const texts = scene.items.filter((i) => i.prim.t === 'text').map((i) => (i.prim as { text: string }).text)
    expect(texts).toContain('—')
    expect(texts).toContain('dunning-job timeout')
    expect(texts).toContain('dunning-job · 4h')
  })

  it('exposes exactly one focal cell and the three-key legend in upstream order', () => {
    const spec = getExample('service-blueprint')!
    expect(spec.blueprint!.cells.filter((c) => c.focal)).toHaveLength(1)
    const scene = renderDiagram(spec)
    expect(scene.legend.map((l) => l.label)).toEqual(['Line of visibility', 'Backstage layer', 'Focal cell'])
  })

  it('fails the census rules when stages or slots are wrong', () => {
    const base = getExample('service-blueprint')!
    const tooMany = renderDiagram({
      ...base,
      blueprint: { ...base.blueprint!, stages: [...base.blueprint!.stages, { id: 'x1', label: 'Extra' }, { id: 'x2', label: 'Extra 2' }] },
    })
    expect(tooMany.audit!.findings.some((f) => f.rule === '§ blueprint stages' && f.level === 'fail')).toBe(true)

    const missingSlots = renderDiagram({
      ...base,
      blueprint: { ...base.blueprint!, cells: base.blueprint!.cells.filter((c) => c.layer !== 'customer') },
    })
    expect(missingSlots.audit!.findings.some((f) => f.rule === '§ blueprint census' && f.level !== 'pass')).toBe(true)
  })
})

// ─── 2. Terminal primitive: larger ramp + dot grid ───────────────────────────

describe('terminal primitive — text ramp and dot grid', () => {
  it('runs every text role 1–2px above the default ramp', () => {
    const ramp = typeRampFor('terminal')
    for (const role of Object.keys(TYPE_RAMP) as (keyof typeof TYPE_RAMP)[]) {
      const base = TYPE_RAMP[role].size
      const boosted = ramp[role].size
      expect(boosted - base, role).toBeGreaterThanOrEqual(1)
      expect(boosted - base, role).toBeLessThanOrEqual(2)
    }
    expect(ramp.nodeName.size).toBe(TYPE_RAMP.nodeName.size + 2) // 12 → 14
    expect(ramp.sublabel.size).toBe(TYPE_RAMP.sublabel.size + 1) // 9 → 10
    // Other skins keep the default ramp.
    expect(typeRampFor('editorial')).toBe(TYPE_RAMP)
    expect(typeRampFor('alo').nodeName.size).toBe(TYPE_RAMP.nodeName.size)
  })

  it('paints terminal text on the boosted ramp and the audit accepts it', () => {
    const spec = {
      ...getExample('flowchart')!,
      skin: 'terminal' as const,
      theme: 'dark' as const,
      frame: 'terminal' as const,
    }
    const scene = renderDiagram(spec)
    const nameSize = typeRampFor('terminal').nodeName.size
    const names = scene.items.filter(
      (i) => i.prim.t === 'text' && (i.prim as { family: string }).family === 'sans' && (i.prim as { size: number }).size === nameSize,
    )
    expect(names.length).toBeGreaterThan(0)
    expect(scene.audit!.findings.some((f) => f.rule === '§9 typography' && f.level !== 'pass')).toBe(false)
  })

  it('defaults the terminal frame to the dot grid and exports it, at 0.07 white', () => {
    const spec = { ...getExample('loop')!, frame: 'terminal' as const, skin: 'terminal' as const, theme: 'dark' as const }
    const scene = renderDiagram(spec)
    expect(scene.background).toBe('dots')
    const svg = sceneToSvg(scene)
    expect(svg).toContain('<pattern')
    expect(svg).toContain('rgba(255,255,255,0.07)')
    // The dot colour stays in the 0.06–0.08 texture band.
    const c = dotGridColor(TERMINAL_SKIN, 'terminal')
    expect(c).toBe('rgba(255,255,255,0.07)')
    expect(dotGridColor(resolveSkin('editorial', 'light'), 'editorial')).toMatch(/rgba\(45,49,66,0\.08\)/)
  })

  it('keeps editorial figures on clean paper by default', () => {
    const scene = renderDiagram(getExample('bar')!)
    expect(scene.background).toBe('paper')
  })
})

// ─── 3. Annotation margins ───────────────────────────────────────────────────

describe('annotation callouts — margin placement', () => {
  it('places notes in the top-right and bottom-left margins', () => {
    const spec = {
      ...getExample('loop')!,
      callouts: [
        { text: 'structure IS the index', at: 'top-right' as const },
        { text: 'no imports, no configuration', at: 'bottom-left' as const },
      ],
    }
    const scene = renderDiagram(spec)
    const texts = scene.items
      .filter((i) => i.prim.t === 'text' && (i.prim as { family: string }).family === 'serif')
      .map((i) => i.prim as { x: number; y: number; text: string })
    const topRight = texts.find((t) => t.text === 'structure IS the index')!
    const bottomLeft = texts.find((t) => t.text === 'no imports, no configuration')!
    expect(topRight.x).toBeGreaterThan(scene.width / 2)
    expect(topRight.y).toBeLessThan(scene.height / 3)
    expect(bottomLeft.x).toBeLessThan(scene.width / 2)
    expect(bottomLeft.y).toBeGreaterThan((scene.height * 2) / 3)
    expect(scene.audit!.ok).toBe(true)
  })

  it('still supports the legacy bottom anchors and drops the rule when a leader is present', () => {
    const spec = {
      ...getExample('architecture')!,
      callouts: [{ text: 'one aside', at: 'start' as const, target: 'gw' }],
    }
    const scene = renderDiagram(spec)
    const rules = scene.items.filter((i) => i.prim.t === 'line' && i.layer === 50)
    expect(rules).toHaveLength(0)
    const leader = scene.items.find((i) => i.prim.t === 'path' && (i.prim as { dash?: string }).dash === '4,3')
    expect(leader).toBeDefined()
  })
})

// ─── 4. Semantic patterns ────────────────────────────────────────────────────

describe('semantic patterns — the nine named routing patterns', () => {
  it('encodes all nine patterns with routing metadata and a template', () => {
    expect(SEMANTIC_PATTERNS).toHaveLength(9)
    const names = SEMANTIC_PATTERNS.map((p) => p.name)
    expect(names).toContain('Fan-in queue / bottleneck')
    expect(names).toContain('Stage framework with semantic slots')
    expect(names).toContain('Paired policy-evaluation traces')
    expect(names).toContain('Secure paved road')
    expect(names).toContain('Lifecycle phase map')
    for (const p of SEMANTIC_PATTERNS) {
      expect(p.routing.length).toBeGreaterThan(10)
      expect(p.requiredPrimitives.length).toBeGreaterThanOrEqual(4)
      expect(KIND_MAP[p.nearestKind], p.id).toBeTruthy()
      expect(patternById(p.id)).toBe(p)
    }
  })

  it('every template renders and passes the taste gate with zero fails and zero warns', () => {
    const failures: string[] = []
    for (const spec of patternTemplates()) {
      const scene = renderDiagram(spec)
      for (const f of scene.audit!.findings) {
        if (f.level !== 'pass') failures.push(`${spec.slug} [${f.level}] ${f.rule}: ${f.message}`)
      }
    }
    expect(failures).toEqual([])
  })

  it('carries the pattern-specific primitives in the worked templates', () => {
    const queue = patternById('fan-in-queue')!.template
    expect(queue.nodes!.some((n) => /3 slots/.test(n.sublabel ?? ''))).toBe(true)
    expect(queue.nodes!.some((n) => /8\/hour/.test(n.sublabel ?? ''))).toBe(true)

    const traces = patternById('paired-traces')!.template
    const subs = traces.nodes!.map((n) => n.sublabel)
    expect(subs).toContain('SKIPPED')
    expect(subs).toContain('NOT REACHED')
    expect(traces.callouts![0].at).toBe('top-right')

    const road = patternById('secure-paved-road')!.template
    expect(road.zones!.some((z) => z.kind === 'trust-boundary')).toBe(true)
    expect(road.links!.some((l) => l.role === 'security')).toBe(true)

    const blocks = patternById('block-decomposition')!.template
    expect(blocks.nodes!.every((n) => /^PAY-\d/.test(n.tag ?? ''))).toBe(true)

    const lifecycle = patternById('lifecycle-phases')!.template
    expect(lifecycle.zones!.map((z) => z.id)).toEqual(['progress', 'interruption', 'terminal'])
    expect(lifecycle.nodes!.filter((n) => n.sublabel === 'TERMINAL')).toHaveLength(2)
    expect(lifecycle.links!.some((l) => l.label === 're-enter')).toBe(true)
  })
})

// ─── 5. Compressed draw.io import + inflate ─────────────────────────────────

function encodeDrawioPage(xml: string): string {
  const percent = encodeURIComponent(xml)
  const compressed = zlib.deflateRawSync(Buffer.from(percent, 'latin1'))
  return Buffer.from(compressed).toString('base64')
}

describe('inflate + compressed draw.io pages', () => {
  it('inflates exactly what zlib deflateRaw produces, at every level', () => {
    const cases = ['hello hello hello', 'x'.repeat(50_000), JSON.stringify({ a: [1, 2, 3], s: 'ünïcödé 漢字' })]
    for (const c of cases) {
      for (const level of [0, 1, 6, 9]) {
        const comp = zlib.deflateRawSync(Buffer.from(c, 'utf8'), { level })
        expect(Buffer.from(inflateRaw(new Uint8Array(comp))).toString('utf8')).toBe(c)
      }
    }
  })

  it('throws InflateError on malformed streams rather than guessing', () => {
    expect(() => inflateRaw(Uint8Array.from([0xff, 0xff, 0xff]))).toThrow(InflateError)
  })

  it('decodes a real compressed draw.io page payload', () => {
    const xml = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="Gateway" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60"/></mxCell></root></mxGraphModel>'
    const payload = encodeDrawioPage(xml)
    expect(decodeDrawioPayload(payload)).toBe(xml)
    const ir = parseDrawio(`<mxfile><diagram name="Page 1">${payload}</diagram></mxfile>`)
    expect(ir.nodes.map((n) => n.name)).toEqual(['Gateway'])
    expect(ir.ledger.some((l) => /inflated/.test(l.detail))).toBe(true)
  })

  it('accepts URL-safe base64 variants and bare payloads', () => {
    const xml = '<mxGraphModel><root><mxCell id="2" value="Svc" vertex="1"><mxGeometry x="0" y="0" width="80" height="40"/></mxCell></root></mxGraphModel>'
    const payload = encodeDrawioPage(xml).replace(/\+/g, '-').replace(/\//g, '_')
    const ir = parseDrawio(payload)
    expect(ir.nodes.map((n) => n.name)).toEqual(['Svc'])
  })

  it('still refuses non-draw.io input and undecodable compressed pages with clear messages', () => {
    expect(() => parseDrawio('<html></html>')).toThrow(/not a draw.io file/)
    expect(() => parseDrawio('<mxfile><diagram name="p">AAAAbase64==</diagram></mxfile>')).toThrow(ImportError)
    expect(() => parseDrawio('<mxfile><diagram name="p">AAAAbase64==</diagram></mxfile>')).toThrow(/uncompressed/)
  })

  it('runs a compressed page end-to-end into a renderable figure', () => {
    const xml =
      '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
      '<mxCell id="2" value="Ingest" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60"/></mxCell>' +
      '<mxCell id="3" value="Store" vertex="1" parent="1"><mxGeometry x="240" y="40" width="120" height="60"/></mxCell>' +
      '<mxCell id="4" edge="1" parent="1" source="2" target="3"><mxGeometry relative="1"/></mxCell>' +
      '</root></mxGraphModel>'
    const result = importDiagram('drawio', `<mxfile><diagram>${encodeDrawioPage(xml)}</diagram></mxfile>`, {
      slug: 'compressed-page',
      output: { audience: 'engineer' },
    })
    const scene = renderDiagram(result.spec)
    expect(scene.items.length).toBeGreaterThan(0)
    expect(result.output.audience).toBe('engineer')
  })
})

// ─── 6. Output-spec ladders ─────────────────────────────────────────────────

describe('output spec — format × size × detail × audience', () => {
  it('every size preset carries a viewBox divisible by 4 and a ramp class', () => {
    for (const p of SIZE_PRESETS) {
      if (p.id === 'fit') continue
      expect(p.viewBox.w % 4, p.id).toBe(0)
      expect(p.viewBox.h % 4, p.id).toBe(0)
      expect(SIZE_CLASS_RAMP[p.ramp]).toBeTruthy()
    }
    expect(sizePreset('slide-16x9').ramp).toBe('presentation')
    expect(sizePreset('print-a4-landscape').pngScale).toBe(3)
    expect(sizePreset('social-og').safeMargin).toBe(64)
  })

  it('defaults the four dials and states them', () => {
    const dials = resolveOutputDials()
    expect(dials).toEqual(DEFAULT_DIALS)
    expect(describeDials(dials)).toBe('format=html · size=doc-inline · detail=balanced · audience=mixed')
    const slide = resolveOutputDials({}, 'Keynote / PowerPoint / Google Slides')
    expect(slide.format).toBe('png')
    expect(slide.size).toBe('slide-16x9')
  })

  it('derives fit viewBox from content with fixed chrome', () => {
    const box = fitViewBox({ w: 813, h: 401 }, { legend: true })
    expect(box.w).toBe(816 + 80)
    expect(box.h).toBe(404 + 80 + 60)
  })

  it('walks the degrade ladder in order and reports every cut', () => {
    const nodes = Array.from({ length: 20 }, (_, i) => ({
      id: i < 6 ? `w${i}` : `n${i}`,
      name: i < 6 ? 'Worker' : i >= 16 ? `Log sink ${i}` : `Service ${i}`,
    }))
    const edges = nodes.slice(1).map((n, i) => ({ from: nodes[i].id, to: n.id }))
    const out = applyDegradeLadder(nodes, edges, 'balanced')
    expect(out.nodes.length).toBeLessThanOrEqual(detailLevel('balanced').maxNodes)
    expect(out.ledger.some((l) => l.action === 'merged')).toBe(true) // duplicates
    expect(out.ledger.length).toBeGreaterThan(0)
    const report = fidelityLedger({
      detail: 'balanced',
      sourceNodes: 20,
      drawnNodes: out.nodes.length,
      entries: out.ledger,
      keptInFull: ['the request path'],
    })
    expect(report).toMatch(/Detail: balanced · 20 source nodes → \d+ drawn/)
    expect(report).toMatch(/Kept in full: the request path/)
  })

  it('simplified drops sublabels; executive drops them through the audience dial', () => {
    const nodes = [
      { id: 'a', name: 'Auth Service', sublabel: 'JWT · RS256 · :8443' },
      { id: 'b', name: 'Gateway', sublabel: 'token check' },
    ]
    expect(applyDegradeLadder(nodes, [], 'simplified').nodes.every((n) => !n.sublabel)).toBe(true)
    const exec = applyAudience(nodes, 'executive')
    expect(exec.every((n) => !n.sublabel)).toBe(true)
    const notes = lintAudience({ nodes: [{ id: 'a', name: 'Auth Service', sublabel: 'JWT · RS256 · :8443' }] }, 'executive')
    expect(notes[0].detail).toMatch(/executive audience/)
    const mixed = lintAudience({ nodes: [{ id: 'a', name: 'Auth Service', sublabel: 'JWT · RS256 · :8443' }] }, 'mixed')
    expect(mixed[0].detail).toMatch(/engineer-level/)
  })

  it('sets the scene size from the preset and carries the dials on the import', () => {
    expect(sceneSizeFor('slide-16x9')).toEqual({ w: 1280, h: 720 })
    const result = importDiagram('mermaid', 'flowchart TD\n  A[Ingest] --> B[Store]', {
      slug: 'dial-test',
      output: { size: 'social-square', detail: 'simplified' },
    })
    expect(result.spec.size).toEqual({ w: 1080, h: 1080 })
    expect(result.spec.footer).toBe('format=html · size=social-square · detail=simplified · audience=mixed')
    expect(result.output.size).toBe('social-square')
  })

  it('exposes the delivery checklist', () => {
    expect(OUTPUT_SPEC_CHECKLIST.length).toBeGreaterThanOrEqual(12)
    expect(OUTPUT_SPEC_CHECKLIST.some((c) => /fidelity ledger/i.test(c))).toBe(true)
  })
})

// ─── 7. Client profiles ─────────────────────────────────────────────────────

describe('client profiles — save / load / update / reset / delete', () => {
  const BODY = '# Style Guide\n\n| accent | #eb6c36 |\n'
  const meta = { name: 'Acme Corporation', slug: 'acme', sourceUrl: 'https://acme.example', notes: 'Primary web brand' }

  it('validates slugs strictly and reserves default', () => {
    expect(isValidProfileSlug('acme-2')).toBe(true)
    expect(isValidProfileSlug('Acme')).toBe(false)
    expect(isValidProfileSlug('a/b')).toBe(false)
    expect(isValidProfileSlug('a'.repeat(65))).toBe(false)
    expect(isValidProfileSlug('.hidden')).toBe(false)
    expect(suggestProfileSlug('Acme Corporation!')).toBe('acme-corporation')
    const store = new MemoryProfileStore()
    expect(saveProfile(store, { ...meta, slug: RESERVED_PROFILE_SLUG }, BODY).ok).toBe(false)
    expect(deleteProfile(store, RESERVED_PROFILE_SLUG).ok).toBe(false)
  })

  it('strips then prepends exactly one header — save → load → save never stacks', () => {
    const once = serializeProfile({ ...meta, created: '2026-08-14', updated: '2026-08-14' }, BODY)
    const twice = serializeProfile({ ...meta, created: '2026-08-14', updated: '2026-08-15' }, once)
    expect(twice.match(/diagram-design-profile/g)).toHaveLength(1)
    expect(stripProfileHeader(twice)).toBe(BODY)
    const parsed = parseProfileHeader(twice)!
    expect(parsed.slug).toBe('acme')
    expect(parsed.name).toBe('Acme Corporation')
    expect(parsed.sourceUrl).toBe('https://acme.example')
  })

  it('runs the verb procedures over a store', () => {
    const store = new MemoryProfileStore()
    expect(saveProfile(store, meta, BODY).ok).toBe(true)
    expect(saveProfile(store, meta, BODY).ok).toBe(false) // exists — no silent overwrite
    expect(saveProfile(store, meta, 'new body', { overwrite: true }).ok).toBe(true)
    expect(listProfiles(store)).toEqual(['acme'])
    expect(loadProfileVerb(store, 'acme').ok).toBe(true)
    expect(loadProfileVerb(store, 'missing').ok).toBe(false)
    expect(updateProfile(store, 'acme', 'updated body').ok).toBe(true)
    expect(loadProfileVerb(store, 'acme').profile!.body).toBe('updated body')
    expect(resetProfile(store, BODY).ok).toBe(true)
    expect(listProfiles(store)).toContain(RESERVED_PROFILE_SLUG)
    expect(deleteProfile(store, 'acme').ok).toBe(true)
  })

  it('resolves marker-first and never falls back silently', () => {
    const store = new MemoryProfileStore()
    saveProfile(store, meta, BODY)
    expect(parseProjectMarker('profile: acme\n')).toEqual({ ok: true, slug: 'acme' })
    expect(parseProjectMarker('profile: acme\nprofile: evil\n').ok).toBe(false)
    expect(parseProjectMarker('profile: ../etc/passwd\n').ok).toBe(false)
    expect(parseProjectMarker('# comment\nprofile: acme\n').ok).toBe(false)

    const viaMarker = resolveProfile(store, 'profile: acme\n', BODY)
    expect(viaMarker.via).toBe('marker')
    expect(viaMarker.profile!.meta.slug).toBe('acme')

    const missing = resolveProfile(store, 'profile: ghost\n', BODY)
    expect(missing.profile).toBeNull()
    expect(missing.warning).toMatch(/ghost/)

    const ignored = resolveProfile(store, 'rm -rf /\n', BODY)
    expect(ignored.via).toBe('working-copy')
    expect(ignored.warning).toMatch(/ignored/)
  })
})

// ─── 8. Skin onboarding ─────────────────────────────────────────────────────

describe('skin onboarding — URL / skill / folder token extraction', () => {
  it('maps CSS custom properties to roles by name heuristic', () => {
    const css = `
      :root {
        --color-background: #f5f5f5;
        --color-text: #2d3142;
        --color-muted: #4f5d75;
        --color-accent: #eb6c36;
        --color-border: #bfc0c0;
        --font-mono: 'Geist Mono', monospace;
      }
    `
    const out = extractFromCss(css)
    expect(out.values).toEqual({ paper: '#f5f5f5', ink: '#2d3142', muted: '#4f5d75', accent: '#eb6c36', rule: '#bfc0c0' })
    expect(out.fonts.some((f) => f.family === 'Geist Mono' && f.kind === 'mono')).toBe(true)
  })

  it('reads Style Dictionary JSON, markdown tables and HTML style blocks', () => {
    const json = JSON.stringify({
      color: { brand: { primary: { value: '#003abc' } }, background: { value: 'rgb(248, 250, 252)' } },
    })
    const fromJson = extractFromJson(json)
    expect(fromJson.values.accent).toBe('#003abc')
    expect(fromJson.values.paper).toBe('#f8fafc')

    const fromMd = extractFromMarkdown('| Accent | #eb6c36 |\n| Paper | #f5f5f5 |\n')
    expect(fromMd.values.accent).toBe('#eb6c36')
    expect(fromMd.values.paper).toBe('#f5f5f5')

    const fromHtml = extractFromHtml('<html><style>body{background:#111111;color:#eeeeee}</style></html>')
    expect(fromHtml.values.paper).toBe('#111111')
    expect(fromHtml.values.ink).toBe('#eeeeee')
  })

  it('emits a brand fidelity receipt with exact/fallback font roles and never guesses unmapped values', () => {
    const proposal = proposeSkin({
      url: 'https://acme.example',
      css: ':root{--bg:#101010;--ink:#f2f2f2;--brand:#ff6a00;--neon-cyan:#00fff0}',
    })
    expect(proposal.tokens).toEqual({ paper: '#101010', ink: '#f2f2f2', accent: '#ff6a00' })
    expect(proposal.unmapped).toContain('neon-cyan')
    expect(proposal.receipt.sampled).toEqual(['https://acme.example'])
    expect(proposal.receipt.detected.accent).toBe('#ff6a00')
    const title = proposal.fonts.find((f) => f.role === 'title')!
    expect(title.match).toBe('fallback') // no brand font found — default, marked
    const body = proposal.fonts.find((f) => f.role === 'body')!
    expect(['exact', 'fallback']).toContain(body.match)
    const merged = proposalToSkin(proposal, resolveSkin('editorial', 'light') as never)
    expect(merged.paper).toBe('#101010')
    expect(merged.inkStrong).toBeTruthy() // untouched roles survive from the base skin
  })

  it('checks contrast on the receipt path (visibility line clears 3:1)', () => {
    expect(checkContrast('#2d3142', '#f5f5f5', 3).pass).toBe(true)
    expect(checkContrast('#aaaaaa', '#f5f5f5', 3).pass).toBe(false)
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0)
  })
})
