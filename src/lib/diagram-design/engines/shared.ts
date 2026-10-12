/** Shared engine helpers: node measurement, ranking, palette helpers. */

import { measureText, snapUp } from '../geometry'
import { SERIES_TOKENS, TYPE_RAMP, type NodeKind, type NodeTreatment, type RoleTokens, nodeTreatment } from '../tokens'
import type { DiagramSpec, LegendItem, NodeSpec, SeriesSpec, StackSpec } from '../spec'
import type { SceneBuilder } from '../scene'

export const NODE_MIN_W = 112
export const NODE_MIN_H = 56
export const GAP_X = 40
export const GAP_Y = 32

/** Measure a node box from its content. Padding and rounding stay on the grid. */
export function measureNode(node: NodeSpec, opts: { minW?: number; minH?: number } = {}) {
  const nameW = measureText(node.name, { family: 'sans', size: TYPE_RAMP.nodeName.size, tracking: 0 })
  const subW = node.sublabel
    ? measureText(node.sublabel, { family: 'mono', size: TYPE_RAMP.sublabel.size })
    : 0
  const tagW = node.tag ? measureText(node.tag, { family: 'mono', size: TYPE_RAMP.tag.size, tracking: 0.08 }) + 24 : 0
  const contentW = Math.max(nameW, subW, tagW) + 32
  const w = snapUp(Math.max(node.w ?? 0, opts.minW ?? NODE_MIN_W, contentW))
  const rows = (node.sublabel ? 1 : 0) + (node.tag ? 1 : 0)
  const h = snapUp(Math.max(node.h ?? 0, opts.minH ?? NODE_MIN_H, 24 + rows * 14 + 20))
  return { w, h }
}

/**
 * Longest-path ranking with a cycle guard. Nodes with an explicit `col` pin
 * their rank; the rest follow their incoming edges.
 */
export function rankNodes(nodes: NodeSpec[], links: { from: string; to: string }[]): Map<string, number> {
  const rank = new Map<string, number>()
  for (const n of nodes) if (typeof n.col === 'number') rank.set(n.id, n.col)

  const incoming = new Map<string, string[]>()
  const outgoing = new Map<string, string[]>()
  for (const l of links) {
    if (!outgoing.has(l.from)) outgoing.set(l.from, [])
    if (!incoming.has(l.to)) incoming.set(l.to, [])
    outgoing.get(l.from)!.push(l.to)
    incoming.get(l.to)!.push(l.from)
  }

  const roots = nodes.filter((n) => (incoming.get(n.id) ?? []).length === 0)
  const queue: string[] = roots.length ? roots.map((n) => n.id) : nodes.length ? [nodes[0].id] : []
  const guard = new Set<string>()
  for (const n of nodes) if (rank.has(n.id)) queue.push(n.id)

  let steps = 0
  const maxSteps = nodes.length * 4 + 8
  while (queue.length && steps < maxSteps) {
    steps++
    const id = queue.shift()!
    const base = rank.get(id) ?? 0
    for (const next of outgoing.get(id) ?? []) {
      const candidate = base + 1
      if ((rank.get(next) ?? -Infinity) < candidate && guard.size < nodes.length * 8) {
        rank.set(next, candidate)
        queue.push(next)
      }
    }
    guard.add(id)
  }
  for (const n of nodes) if (!rank.has(n.id)) rank.set(n.id, 0)
  return rank
}

/** Order nodes inside a rank by explicit `row`, then by input order. */
export function orderWithinRank(nodes: NodeSpec[], rank: Map<string, number>): Map<number, NodeSpec[]> {
  const byRank = new Map<number, NodeSpec[]>()
  for (const n of nodes) {
    const r = rank.get(n.id) ?? 0
    if (!byRank.has(r)) byRank.set(r, [])
    byRank.get(r)!.push(n)
  }
  for (const [, list] of byRank) {
    list.sort((a, b) => {
      if (typeof a.row === 'number' && typeof b.row === 'number') return a.row - b.row
      return 0
    })
  }
  return byRank
}

export function seriesColor(index: number, focal: boolean, theme: 'light' | 'dark', tokens: RoleTokens): string {
  if (focal) return tokens.accent
  return SERIES_TOKENS[theme][index % SERIES_TOKENS[theme].length]
}

export function treatmentOf(kind: NodeKind | undefined, tokens: RoleTokens): NodeTreatment {
  return nodeTreatment(kind ?? 'backend', tokens)
}

/** Which legend entries a spec's nodes imply. */
export function legendForNodes(nodes: NodeSpec[], tokens: RoleTokens, labels?: Partial<Record<NodeKind, string>>) {
  const seen: NodeKind[] = []
  for (const n of nodes) {
    const k = n.kind ?? 'backend'
    if (!seen.includes(k)) seen.push(k)
  }
  const defaults: Partial<Record<NodeKind, string>> = {
    focal: 'Focal',
    backend: 'Service',
    store: 'Store',
    external: 'External',
    input: 'Input',
    optional: 'Optional / async',
    security: 'Trust boundary',
    accentLine: 'Focal',
    plain: 'Group',
  }
  return seen.map((k) => ({ kind: k, label: labels?.[k] ?? defaults[k] ?? String(k) }))
}

/**
 * Legend policy for node-carrying types: a legend is required only when more
 * than one node kind is in play ("covers every type used — and nothing extra").
 * `spec.legend: false` suppresses it, an array overrides it.
 */
export function autoLegend(spec: DiagramSpec, nodes: NodeSpec[], b: SceneBuilder): void {
  if (spec.legend === false) return
  if (Array.isArray(spec.legend)) {
    b.legendFromSpec(spec.legend)
    return
  }
  const kinds = new Set(nodes.map((n) => n.kind ?? 'backend'))
  if (spec.legend === true || kinds.size > 1) b.legendFromSpec(legendForNodes(nodes, b.t))
}

/**
 * Legend policy for stack-band types (layers, nested, medallion, pyramid,
 * treemap): required when the bands carry more than one treatment.
 */
export function autoLegendStacks(spec: DiagramSpec, stacks: StackSpec[], b: SceneBuilder): void {
  if (spec.legend === false) return
  if (Array.isArray(spec.legend)) {
    b.legendFromSpec(spec.legend)
    return
  }
  const kinds = new Set(stacks.map((x) => x.kind ?? 'store'))
  if (spec.legend === true || kinds.size > 1) {
    b.legendFromSpec(stacks.map((x) => ({ kind: x.kind ?? 'store', label: x.name })))
  }
}

/** Legend for types whose reference page declares one unconditionally. */
export function fixedLegend(spec: DiagramSpec, b: SceneBuilder, items: LegendItem[]): void {
  if (spec.legend === false) return
  if (Array.isArray(spec.legend)) b.legendFromSpec(spec.legend)
  else b.legendFromSpec(items)
}

export function seriesValues(spec: DiagramSpec): SeriesSpec[] {
  return spec.series ?? []
}

export function requireNodes(spec: DiagramSpec, kind: string): NodeSpec[] {
  const nodes = spec.nodes ?? []
  if (!nodes.length) throw new Error(`[diagram-design] ${kind} requires at least one node`)
  return nodes
}
