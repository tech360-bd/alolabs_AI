/**
 * Draw.io import output spec — format × size × detail × audience
 * (ported from upstream `output-spec.md`).
 *
 * Four dials decide what an imported diagram becomes: where the file lands
 * (format), how big the canvas is and how far away the reader sits (size),
 * how much of the source survives (detail), and how technical the wording is
 * (audience). They change the deliverable, layout, type ramp, node count and
 * wording — so they are set before redrawing, never retrofitted.
 */

import type { DiagramSpec } from './spec'
import type { LedgerEntry } from './importers'

// ─── 1. Format ───────────────────────────────────────────────────────────────

export type OutputFormat = 'html' | 'svg' | 'png' | 'html+png'

export const OUTPUT_FORMATS: {
  id: OutputFormat
  deliverable: string
  keeps: string
  drops: string
}[] = [
  { id: 'html', deliverable: 'self-contained .html (default)', keeps: 'header, diagram, summary cards, footer, live fonts', drops: 'nothing' },
  { id: 'svg', deliverable: '.svg next to the source', keeps: 'the <svg> node, vector text', drops: 'editorial wrapper; fonts substitute in offline tools' },
  { id: 'png', deliverable: '.png at device_scale_factor', keeps: 'pixels exactly as the browser renders them', drops: 'vector editability' },
  { id: 'html+png', deliverable: 'both', keeps: '—', drops: '—' },
]

/** Where the file lands → the size preset that destination implies. */
export const DESTINATION_PRESETS: { destination: string; format: OutputFormat; size: SizePresetId }[] = [
  { destination: 'Blog post, README, docs site', format: 'html', size: 'doc-inline' },
  { destination: 'Keynote / PowerPoint / Google Slides', format: 'png', size: 'slide-16x9' },
  { destination: 'Figma / Illustrator / further editing', format: 'svg', size: 'fit' },
  { destination: 'X / LinkedIn / OG link card', format: 'png', size: 'social-og' },
  { destination: 'Printed handout, PDF deck', format: 'png', size: 'print-a4-landscape' },
  { destination: 'Confluence / Notion / internal wiki', format: 'png', size: 'doc-wide' },
]

// ─── 2. Size ─────────────────────────────────────────────────────────────────

export type SizePresetId =
  | 'doc-inline'
  | 'doc-wide'
  | 'slide-16x9'
  | 'slide-4x3'
  | 'social-og'
  | 'social-square'
  | 'print-a4-landscape'
  | 'print-a3-landscape'
  | 'print-letter-landscape'
  | 'fit'

export type TypeRampClass = 'standard' | 'presentation' | 'print'

export interface SizePreset {
  id: SizePresetId
  /** SVG viewBox; every value is divisible by 4. `fit` derives from content. */
  viewBox: { w: number; h: number }
  aspect: string
  /** PNG export scale factor. */
  pngScale: number
  ramp: TypeRampClass
  use: string
  /** Outer margin on every side (px). social-og keeps 64 clear. */
  safeMargin: number
  /** Keep this bottom band clear when a deck template has a footer. */
  safeBottom?: number
}

export const SIZE_PRESETS: SizePreset[] = [
  { id: 'doc-inline', viewBox: { w: 960, h: 600 }, aspect: '8:5', pngScale: 2, ramp: 'standard', use: 'Body-width diagram in a post or README', safeMargin: 40 },
  { id: 'doc-wide', viewBox: { w: 1280, h: 720 }, aspect: '16:9', pngScale: 2, ramp: 'standard', use: 'Full-width docs, wiki pages', safeMargin: 40 },
  { id: 'slide-16x9', viewBox: { w: 1280, h: 720 }, aspect: '16:9', pngScale: 2, ramp: 'presentation', use: 'Deck slide, projected', safeMargin: 40, safeBottom: 80 },
  { id: 'slide-4x3', viewBox: { w: 1024, h: 768 }, aspect: '4:3', pngScale: 2, ramp: 'presentation', use: 'Legacy deck templates', safeMargin: 40, safeBottom: 80 },
  { id: 'social-og', viewBox: { w: 1200, h: 632 }, aspect: '~1.9:1', pngScale: 2, ramp: 'presentation', use: 'Link preview card', safeMargin: 64 },
  { id: 'social-square', viewBox: { w: 1080, h: 1080 }, aspect: '1:1', pngScale: 2, ramp: 'presentation', use: 'Feed post, carousel', safeMargin: 40 },
  { id: 'print-a4-landscape', viewBox: { w: 1120, h: 792 }, aspect: '~1.41:1', pngScale: 3, ramp: 'print', use: 'A4 landscape, ~10mm margins at 96dpi', safeMargin: 40 },
  { id: 'print-a3-landscape', viewBox: { w: 1584, h: 1120 }, aspect: '~1.41:1', pngScale: 3, ramp: 'print', use: 'A3 landscape, ~10mm margins at 96dpi', safeMargin: 40 },
  { id: 'print-letter-landscape', viewBox: { w: 1056, h: 816 }, aspect: '~1.29:1', pngScale: 3, ramp: 'print', use: 'US Letter landscape', safeMargin: 40 },
  { id: 'fit', viewBox: { w: 0, h: 0 }, aspect: 'any', pngScale: 2, ramp: 'standard', use: 'Vector hand-off; no fixed frame', safeMargin: 40 },
]

export function sizePreset(id: SizePresetId): SizePreset {
  return SIZE_PRESETS.find((p) => p.id === id) ?? SIZE_PRESETS[0]
}

/** Type ramp per size class — node names scale with the canvas, never shrink into it. */
export const SIZE_CLASS_RAMP: Record<TypeRampClass, {
  title: number
  nodeName: number
  sublabel: number
  arrowLabel: number
  eyebrow: number
  nodeMinH: number
  nodeGap: number
}> = {
  standard: { title: 28, nodeName: 12, sublabel: 9, arrowLabel: 8, eyebrow: 8, nodeMinH: 48, nodeGap: 24 },
  presentation: { title: 40, nodeName: 16, sublabel: 12, arrowLabel: 12, eyebrow: 8, nodeMinH: 64, nodeGap: 40 },
  print: { title: 32, nodeName: 12, sublabel: 9, arrowLabel: 8, eyebrow: 8, nodeMinH: 48, nodeGap: 24 },
}

/**
 * Derive the `fit` viewBox: round the content bounding box up to the next
 * multiple of 4, then add fixed chrome — 40px margin on every side plus 60px
 * at the bottom for the legend strip.
 */
export function fitViewBox(content: { w: number; h: number }, opts: { legend?: boolean } = {}): { w: number; h: number } {
  const roundUp4 = (n: number) => Math.ceil(n / 4) * 4
  return {
    w: roundUp4(content.w) + 80,
    h: roundUp4(content.h) + 80 + (opts.legend === false ? 0 : 60),
  }
}

// ─── 3. Detail level ─────────────────────────────────────────────────────────

export type DetailLevel = 'faithful' | 'balanced' | 'simplified'

export const DETAIL_LEVELS: {
  id: DetailLevel
  maxNodes: number
  maxEdges: number
  sublabels: string
  survives: string
}[] = [
  { id: 'faithful', maxNodes: 24, maxEdges: 32, sublabels: 'every port, protocol, version', survives: 'Every distinct component in the source. Only exact duplicates merge.' },
  { id: 'balanced', maxNodes: 12, maxEdges: 16, sublabels: 'technical sublabel on ≤4 nodes', survives: 'Components that carry the story; leaf clusters collapse to one node each.' },
  { id: 'simplified', maxNodes: 7, maxEdges: 9, sublabels: 'none', survives: 'Capabilities and their sequence. Infrastructure disappears.' },
]

export function detailLevel(id: DetailLevel) {
  return DETAIL_LEVELS.find((d) => d.id === id) ?? DETAIL_LEVELS[1]
}

/**
 * The degrade ladder (output-spec.md §3): cut in this order, stop as soon as
 * the level's budget is met, never cut ad hoc. Steps 2–6 are reported in the
 * fidelity ledger; step 1 (decorative cells) needs no report.
 */
export function applyDegradeLadder<
  T extends { id: string; name: string; sublabel?: string },
  E extends { from: string; to: string },
>(nodes: T[], edges: E[], level: DetailLevel): { nodes: T[]; edges: E[]; ledger: LedgerEntry[] } {
  const cap = detailLevel(level)
  const ledger: LedgerEntry[] = []
  let keptNodes = [...nodes]
  let keptEdges = [...edges]

  const dropNodes = (ids: Set<string>, why: string) => {
    const before = keptNodes.length
    keptNodes = keptNodes.filter((n) => !ids.has(n.id))
    keptEdges = keptEdges.filter((e) => !ids.has(e.from) && !ids.has(e.to))
    const dropped = before - keptNodes.length
    if (dropped) ledger.push({ action: 'dropped', detail: `${dropped} node(s) cut — ${why}` })
  }

  // 2. Exact duplicates — identical names collapse to `Name ×N`.
  if (keptNodes.length > cap.maxNodes || keptEdges.length > cap.maxEdges) {
    const byName = new Map<string, T[]>()
    for (const n of keptNodes) {
      const list = byName.get(n.name) ?? []
      list.push(n)
      byName.set(n.name, list)
    }
    for (const [name, list] of byName) {
      if (keptNodes.length <= cap.maxNodes && keptEdges.length <= cap.maxEdges) break
      if (list.length > 1) {
        const [keep, ...rest] = list
        const ids = new Set(rest.map((n) => n.id))
        dropNodes(ids, `exact duplicates merged`)
        keep.name = `${name} ×${list.length}`
        ledger.push({ action: 'merged', detail: `${list.length} × "${name}" → "${keep.name}"` })
      }
    }
  }

  // 3. Leaf clusters — containers of leaves collapse to the container.
  if (keptNodes.length > cap.maxNodes) {
    const parents = new Set(keptEdges.map((e) => e.from))
    const leaves = keptNodes.filter((n) => !parents.has(n.id) && keptEdges.some((e) => e.to === n.id))
    const clusterParents = new Set(
      keptEdges.filter((e) => leaves.some((l) => l.id === e.to)).map((e) => e.from),
    )
    if (clusterParents.size && leaves.length > 2) {
      const drop = new Set(leaves.map((l) => l.id))
      dropNodes(drop, 'leaf cluster collapsed to its container')
    }
  }

  // 4. Degree-1 sinks that don't change the story.
  if (keptNodes.length > cap.maxNodes) {
    const degree = new Map<string, number>()
    for (const e of keptEdges) {
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1)
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1)
    }
    const sinks = keptNodes.filter((n) => (degree.get(n.id) ?? 0) <= 1)
    if (sinks.length) dropNodes(new Set(sinks.map((n) => n.id)), 'degree-1 sink removed')
  }

  // 5. Cross-cutting infrastructure — unconditionally at simplified.
  if (level === 'simplified' || keptNodes.length > cap.maxNodes) {
    const CROSS = /log|metric|monitor|secret|telemetry|ci\b|grafana|prometheus|sentry/i
    const cross = keptNodes.filter((n) => CROSS.test(n.name) || CROSS.test(n.sublabel ?? ''))
    const budget = level === 'simplified' ? cross.length : Math.max(0, cross.length - 1)
    if (budget > 0) dropNodes(new Set(cross.slice(0, budget).map((n) => n.id)), 'cross-cutting infrastructure')
  }

  // 6. Still over? The caller splits; we clamp hard so a single canvas never
  //    ships above the level's ceiling and say so in the ledger.
  if (keptNodes.length > cap.maxNodes) {
    const excess = keptNodes.slice(cap.maxNodes)
    dropNodes(new Set(excess.map((n) => n.id)), `over the ${level} node ceiling — split into overview + detail`)
    ledger.push({ action: 'simplified', detail: `splitting beats shrinking: ship an overview plus one detail figure per zone` })
  }
  if (keptEdges.length > cap.maxEdges) {
    keptEdges = keptEdges.slice(0, cap.maxEdges)
    ledger.push({ action: 'simplified', detail: `edge count clamped to the ${level} ceiling (${cap.maxEdges})` })
  }

  // Sublabel policy per level.
  if (level === 'simplified') {
    for (const n of keptNodes) {
      if (n.sublabel) {
        delete n.sublabel
        ledger.push({ action: 'simplified', detail: `sublabel dropped from "${n.name}" (simplified shows capabilities only)` })
      }
    }
  } else if (level === 'balanced') {
    let technical = 0
    for (const n of keptNodes) {
      if (n.sublabel && ++technical > 4) {
        delete n.sublabel
        ledger.push({ action: 'simplified', detail: `sublabel dropped from "${n.name}" (balanced keeps ≤4)` })
      }
    }
  }

  return { nodes: keptNodes, edges: keptEdges, ledger }
}

// ─── 4. Audience ─────────────────────────────────────────────────────────────

export type Audience = 'engineer' | 'mixed' | 'executive'

export const AUDIENCES: {
  id: Audience
  names: string
  sublabels: string
  edges: string
  never: string
}[] = [
  { id: 'engineer', names: 'exact service / component names', sublabels: 'protocol, port, version, image tag', edges: 'POST /v2/orders, SQL, gRPC', never: 'Vague verbs like "connects to"' },
  { id: 'mixed', names: 'component names, expanded acronyms', sublabels: 'technology only where it changes a decision', edges: 'plain verbs — verifies, writes, notifies', never: 'Ports, versions, internal codenames' },
  { id: 'executive', names: 'capabilities and outcomes', sublabels: 'none', edges: 'business verbs — approves, pays out', never: 'Vendor names, infrastructure, protocols' },
]

/** Worked example — the same node through all three levels. */
export const AUDIENCE_EXAMPLE: Record<Audience, { name: string; sublabel?: string }> = {
  engineer: { name: 'Auth Service', sublabel: 'JWT · RS256 · :8443' },
  mixed: { name: 'Auth Service', sublabel: 'token check' },
  executive: { name: 'Sign-in' },
}

const TECHNICAL_SUBLABEL = /(:\d{2,5}\b|\/v\d+\b|·\s*(RS256|HS256|TLS|TCP|UDP|HTTP\/\d)|https?:\/\/|\bv\d+\.\d+)/i

/**
 * Audience lint: detail sets *how many* survive; audience sets *what they are
 * called*. Renaming is semantic and never invented here — the lint names what
 * the wording pass still has to do, and `executive` drops sublabels outright
 * (the table allows none).
 */
export function lintAudience(spec: Pick<DiagramSpec, 'nodes' | 'links'>, audience: Audience): LedgerEntry[] {
  const ledger: LedgerEntry[] = []
  const nodes = spec.nodes ?? []
  if (audience === 'executive') {
    const withSub = nodes.filter((n) => n.sublabel)
    if (withSub.length) {
      ledger.push({
        action: 'simplified',
        detail: `executive audience: ${withSub.length} technical sublabel(s) to remove — names become capabilities and outcomes`,
      })
    }
  } else if (audience === 'mixed') {
    const technical = nodes.filter((n) => n.sublabel && TECHNICAL_SUBLABEL.test(n.sublabel))
    for (const n of technical) {
      ledger.push({ action: 'simplified', detail: `"${n.name}" sublabel "${n.sublabel}" is engineer-level — mixed keeps technology only where it changes a decision` })
    }
  }
  return ledger
}

/** Apply the mechanical part of the audience dial (sublabel policy). */
export function applyAudience<T extends { name: string; sublabel?: string }>(nodes: T[], audience: Audience): T[] {
  if (audience !== 'executive') return nodes
  return nodes.map((n) => (n.sublabel ? { ...n, sublabel: undefined } : n))
}

// ─── 5. Fidelity ledger ──────────────────────────────────────────────────────

export interface FidelityReport {
  detail: DetailLevel
  sourceNodes: number
  drawnNodes: number
  entries: LedgerEntry[]
  keptInFull: string[]
}

/**
 * Any time output is smaller than input — every balanced and simplified run,
 * and most faithful ones — report what was cut. The reader of the diagram
 * can't see what's missing; the person who asked for it needs to.
 */
export function fidelityLedger(report: FidelityReport): string {
  const lines = [
    `Detail: ${report.detail} · ${report.sourceNodes} source nodes → ${report.drawnNodes} drawn`,
    ...report.entries.map((e) => `${e.action === 'merged' ? 'Merged' : e.action === 'dropped' ? 'Dropped' : e.action === 'simplified' ? 'Simplified' : 'Kept'}: ${e.detail}`),
  ]
  if (report.keptInFull.length) lines.push(`Kept in full: ${report.keptInFull.join(', ')}`)
  return lines.join('\n')
}

// ─── The four dials together ─────────────────────────────────────────────────

export interface OutputDials {
  format: OutputFormat
  size: SizePresetId
  detail: DetailLevel
  audience: Audience
}

export const DEFAULT_DIALS: OutputDials = { format: 'html', size: 'doc-inline', detail: 'balanced', audience: 'mixed' }

/** Infer what the destination makes obvious; leave the rest at its default. */
export function resolveOutputDials(
  partial: Partial<OutputDials> = {},
  destination?: string,
): OutputDials {
  const inferred = destination
    ? DESTINATION_PRESETS.find((d) => d.destination.toLowerCase() === destination.toLowerCase())
    : undefined
  return {
    format: partial.format ?? inferred?.format ?? DEFAULT_DIALS.format,
    size: partial.size ?? inferred?.size ?? DEFAULT_DIALS.size,
    detail: partial.detail ?? DEFAULT_DIALS.detail,
    audience: partial.audience ?? DEFAULT_DIALS.audience,
  }
}

/** One-line statement of the dials used, for the delivery note. */
export function describeDials(dials: OutputDials): string {
  return `format=${dials.format} · size=${dials.size} · detail=${dials.detail} · audience=${dials.audience}`
}

/** Size preset → the scene size an engine should lay out inside. */
export function sceneSizeFor(size: SizePresetId, content?: { w: number; h: number }): { w: number; h: number } {
  const preset = sizePreset(size)
  if (preset.id === 'fit') return content ? fitViewBox(content) : { w: 960, h: 600 }
  return preset.viewBox
}

/**
 * The output-spec checklist (§6), as data so the studio can render it beside
 * the taste gate.
 */
export const OUTPUT_SPEC_CHECKLIST: string[] = [
  'All four dials set — explicitly requested, inferred from the destination, or defaulted and stated',
  'viewBox matches the size preset exactly, values divisible by 4',
  'min-width equals the preset viewBox width, inside a local overflow-x: auto wrapper',
  '@media print releases min-width and overflow-x, after the svg rule',
  'Type ramp matches the size class — not the standard ramp on a slide',
  '40px outer margin honoured (64px for social-og)',
  'Node count inside the detail level’s ceiling',
  'faithful above 9 nodes → zoned, and split above 24',
  'Node names, sublabels and edge labels all at the same audience level',
  'CJK labels given a font fallback',
  'Fidelity ledger reported for anything cut',
  'Diagram <svg> carries role="img", aria-labelledby, first-child <title>, <desc>, prefixed IDs',
  'Requested non-HTML formats produced via export.md, not hand-authored',
]
