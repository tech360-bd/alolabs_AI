/**
 * Graph engine — ranked node/connection layouts.
 *
 * Serves: architecture, architecture-delta, IT current-state, flowchart,
 * state machine, high-level, process, data-flow, dependency, deployment,
 * dp-integration.
 *
 * Layout rules: ranks come from longest-path ranking, every coordinate and gap
 * lands on the 4px grid, connectors are orthogonal elbows with fanned attach
 * points on shared edges, and return links render dashed (passive / return /
 * async) rather than crossing a forward path.
 */

import { GAP_X, GAP_Y, autoLegend, measureNode, orderWithinRank, rankNodes } from './shared'
import { snap, snapUp } from '../geometry'
import { RADIUS, STROKE, alpha } from '../tokens'
import type { Rect, Side } from '../geometry'
import type { DiagramSpec, LinkSpec, NodeSpec, ZoneSpec } from '../spec'
import { SceneBuilder } from '../scene'

export interface GraphOptions {
  direction?: 'horizontal' | 'vertical'
  /** Render tagged decision nodes as diamonds (flowchart). */
  decisions?: boolean
  /** Draw zone containers around member nodes. */
  zones?: boolean
  rankGap?: number
  nodeGap?: number
  minW?: number
  minH?: number
  /** Route links that travel backwards below the layout, dashed. */
  backwardDashed?: boolean
  padding?: { top: number; right: number; bottom: number; left: number }
}

const DEFAULT_PAD = { top: 48, right: 40, bottom: 96, left: 40 }

export function renderGraph(spec: DiagramSpec, b: SceneBuilder, opts: GraphOptions = {}): Map<string, Rect> {
  const nodes = spec.nodes ?? []
  const links = (spec.links ?? []).filter((l) =>
    nodes.some((n) => n.id === l.from) && nodes.some((n) => n.id === l.to),
  )
  const direction = opts.direction ?? spec.direction ?? 'horizontal'
  const rankGap = opts.rankGap ?? (direction === 'horizontal' ? GAP_X : 56)
  const nodeGap = opts.nodeGap ?? (direction === 'horizontal' ? GAP_Y : GAP_X)
  const pad = { ...DEFAULT_PAD, ...(opts.padding ?? {}) }

  const zones = spec.zones ?? []
  const useZones = (opts.zones ?? zones.length > 0) && zones.length > 0

  const rects = new Map<string, Rect>()
  const sizes = new Map<string, { w: number; h: number }>()
  for (const n of nodes) sizes.set(n.id, measureNode(n, { minW: opts.minW, minH: opts.minH }))

  if (useZones) {
    layoutWithZones(spec, b, nodes, links, zones, rects, sizes, { direction, rankGap, nodeGap, pad })
  } else {
    layoutPlain(spec, b, nodes, links, rects, sizes, { direction, rankGap, nodeGap, pad })
  }

  drawLinks(b, nodes, links, rects, { backwardDashed: opts.backwardDashed ?? true })
  drawNodes(b, spec, nodes, rects, opts)

  autoLegend(spec, nodes, b)
  return rects
}

// ─── Layout strategies ───────────────────────────────────────────────────────

interface LayoutCtx {
  direction: 'horizontal' | 'vertical'
  rankGap: number
  nodeGap: number
  pad: { top: number; right: number; bottom: number; left: number }
}

function layoutPlain(
  _spec: DiagramSpec,
  _b: SceneBuilder,
  nodes: NodeSpec[],
  links: LinkSpec[],
  rects: Map<string, Rect>,
  sizes: Map<string, { w: number; h: number }>,
  ctx: LayoutCtx,
) {
  const rank = rankNodes(nodes, links)
  const byRank = orderWithinRank(nodes, rank)

  if (ctx.direction === 'horizontal') {
    let x = ctx.pad.left
    for (const r of [...byRank.keys()].sort((a, b) => a - b)) {
      const list = byRank.get(r)!
      const rankW = Math.max(...list.map((n) => sizes.get(n.id)!.w))
      let y = ctx.pad.top
      for (const n of list) {
        const s = sizes.get(n.id)!
        rects.set(n.id, { x: snap(x + (rankW - s.w) / 2), y: snap(y), w: s.w, h: s.h })
        y += s.h + ctx.nodeGap
      }
      x += rankW + ctx.rankGap
    }
  } else {
    let y = ctx.pad.top
    for (const r of [...byRank.keys()].sort((a, b) => a - b)) {
      const list = byRank.get(r)!
      const rankH = Math.max(...list.map((n) => sizes.get(n.id)!.h))
      let x = ctx.pad.left
      for (const n of list) {
        const s = sizes.get(n.id)!
        rects.set(n.id, { x: snap(x), y: snap(y + (rankH - s.h) / 2), w: s.w, h: s.h })
        x += s.w + ctx.nodeGap
      }
      y += rankH + ctx.rankGap
    }
  }
}

function layoutWithZones(
  spec: DiagramSpec,
  b: SceneBuilder,
  nodes: NodeSpec[],
  links: LinkSpec[],
  zones: ZoneSpec[],
  rects: Map<string, Rect>,
  sizes: Map<string, { w: number; h: number }>,
  ctx: LayoutCtx,
) {
  const members = new Map<string, NodeSpec[]>()
  for (const z of zones) members.set(z.id, [])
  const unzoned: NodeSpec[] = []
  for (const n of nodes) {
    if (n.zone && members.has(n.zone)) members.get(n.zone)!.push(n)
    else unzoned.push(n)
  }

  // Zones flow in the primary direction; members stack across it.
  let cursor = ctx.direction === 'horizontal' ? ctx.pad.left : ctx.pad.top
  const zoneRects: { zone: ZoneSpec; rect: Rect }[] = []

  for (const z of zones) {
    const list = members.get(z.id) ?? []
    if (!list.length) continue
    const memberRank = rankNodes(list, links)
    const byRank = orderWithinRank(list, memberRank)
    const ranks = [...byRank.keys()].sort((a, b) => a - b)

    // Measure the zone from its members (rank-major).
    let spanPrimary = 0
    let spanCross = 0
    const local = new Map<string, Rect>()
    if (ctx.direction === 'horizontal') {
      for (const r of ranks) {
        const list2 = byRank.get(r)!
        const rankW = Math.max(...list2.map((n) => sizes.get(n.id)!.w))
        let y = 0
        for (const n of list2) {
          const s = sizes.get(n.id)!
          local.set(n.id, { x: spanPrimary, y, w: s.w, h: s.h })
          y += s.h + ctx.nodeGap
        }
        spanPrimary += rankW + ctx.rankGap
        spanCross = Math.max(spanCross, y - ctx.nodeGap)
      }
    } else {
      for (const r of ranks) {
        const list2 = byRank.get(r)!
        const rankH = Math.max(...list2.map((n) => sizes.get(n.id)!.h))
        let x = 0
        for (const n of list2) {
          const s = sizes.get(n.id)!
          local.set(n.id, { x, y: spanPrimary, w: s.w, h: s.h })
          x += s.w + ctx.nodeGap
        }
        spanPrimary += rankH + ctx.rankGap
        spanCross = Math.max(spanCross, x - ctx.nodeGap)
      }
    }

    const zoneW = snapUp(spanPrimary - ctx.rankGap + 48)
    const zoneH = snapUp(spanCross + 56)
    const zoneRect: Rect =
      ctx.direction === 'horizontal'
        ? { x: snap(cursor), y: snap(ctx.pad.top), w: zoneW, h: zoneH }
        : { x: snap(ctx.pad.left), y: snap(cursor), w: zoneW, h: zoneH }

    zoneRects.push({ zone: z, rect: zoneRect })
    for (const [id, r] of local) {
      rects.set(id, {
        x: snap(zoneRect.x + 24 + r.x),
        y: snap(zoneRect.y + 28 + r.y),
        w: r.w,
        h: r.h,
      })
    }
    cursor += (ctx.direction === 'horizontal' ? zoneW : zoneH) + 40
  }

  // Unzoned nodes flow after the zones, in the same band.
  if (unzoned.length) {
    const rank = rankNodes(unzoned, links)
    const byRank = orderWithinRank(unzoned, rank)
    if (ctx.direction === 'horizontal') {
      let x = cursor
      for (const r of [...byRank.keys()].sort((a, b) => a - b)) {
        const list = byRank.get(r)!
        const rankW = Math.max(...list.map((n) => sizes.get(n.id)!.w))
        let y = ctx.pad.top
        for (const n of list) {
          const s = sizes.get(n.id)!
          rects.set(n.id, { x: snap(x + (rankW - s.w) / 2), y: snap(y), w: s.w, h: s.h })
          y += s.h + ctx.nodeGap
        }
        x += rankW + ctx.rankGap
      }
    } else {
      let y = cursor
      for (const r of [...byRank.keys()].sort((a, b) => a - b)) {
        const list = byRank.get(r)!
        const rankH = Math.max(...list.map((n) => sizes.get(n.id)!.h))
        let x = ctx.pad.left
        for (const n of list) {
          const s = sizes.get(n.id)!
          rects.set(n.id, { x: snap(x), y: snap(y + (rankH - s.h) / 2), w: s.w, h: s.h })
          x += s.w + ctx.nodeGap
        }
        y += rankH + ctx.rankGap
      }
    }
  }

  // Zones paint first, so they sit behind every connector and node.
  for (const { zone, rect } of zoneRects) {
    b.zone(rect, zone.label, { kind: zone.kind === 'trust-boundary' ? 'trust-boundary' : 'zone', id: zone.id })
    if (zone.kind === 'trust-boundary') {
      b.text(rect.x + 12, rect.y + rect.h - 12, 'TRUST BOUNDARY', {
        role: 'eyebrow',
        fill: alpha(b.t.accent, 0.8),
        layer: 12,
      })
    }
  }
  void spec
}

// ─── Painting ────────────────────────────────────────────────────────────────

function sideToward(from: Rect, to: Rect, dir: 'horizontal' | 'vertical'): { fromSide: Side; toSide: Side } {
  const dx = to.x + to.w / 2 - (from.x + from.w / 2)
  const dy = to.y + to.h / 2 - (from.y + from.h / 2)
  if (dir === 'vertical' && Math.abs(dy) >= Math.abs(dx)) {
    return dy >= 0 ? { fromSide: 'bottom', toSide: 'top' } : { fromSide: 'top', toSide: 'bottom' }
  }
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { fromSide: 'right', toSide: 'left' } : { fromSide: 'left', toSide: 'right' }
  }
  return dy >= 0 ? { fromSide: 'bottom', toSide: 'top' } : { fromSide: 'top', toSide: 'bottom' }
}

function drawLinks(
  b: SceneBuilder,
  nodes: NodeSpec[],
  links: LinkSpec[],
  rects: Map<string, Rect>,
  opts: { backwardDashed: boolean },
) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  // Rule 4 — count connectors per (node, side) so each gets its own attach point.
  const counters = new Map<string, { total: number; next: number }>()
  const route = links.map((l) => {
    const a = rects.get(l.from)!
    const c = rects.get(l.to)!
    const sides = { fromSide: l.fromSide, toSide: l.toSide }
    const auto = sideToward(a, c, 'horizontal')
    const fromSide = sides.fromSide ?? auto.fromSide
    const toSide = sides.toSide ?? auto.toSide
    const backward = !sides.fromSide && (toSide === 'left' ? c.x + c.w < a.x : false)
    return { link: l, a, c, fromSide, toSide, backward }
  })

  // Rank the ports so parallel connectors never share a point.
  const portOrder = new Map<string, string[]>()
  for (const r of route) {
    const key = `${r.link.from}:${r.fromSide}`
    if (!portOrder.has(key)) portOrder.set(key, [])
    portOrder.get(key)!.push(r.link.id ?? `${r.link.from}->${r.link.to}`)
    const key2 = `${r.link.to}:${r.toSide}`
    if (!portOrder.has(key2)) portOrder.set(key2, [])
    portOrder.get(key2)!.push(r.link.id ?? `${r.link.from}->${r.link.to}`)
  }

  for (const r of route) {
    const linkId = r.link.id ?? `${r.link.from}->${r.link.to}`
    const fromKey = `${r.link.from}:${r.fromSide}`
    const toKey = `${r.link.to}:${r.toSide}`
    const fromList = portOrder.get(fromKey)!
    const toList = portOrder.get(toKey)!
    const fromIdx: [number, number] = [fromList.indexOf(linkId) + 1, fromList.length]
    const toIdx: [number, number] = [toList.indexOf(linkId) + 1, toList.length]

    const isBackward = r.c.x + r.c.w / 2 < r.a.x + r.a.w / 2 && Math.abs(r.c.y - r.a.y) < 8
    const dashed = r.link.dashed || (opts.backwardDashed && isBackward)

    b.link(r.a, r.c, {
      id: linkId,
      avoid: [...rects.values()],
      fromSide: r.fromSide,
      toSide: r.toSide,
      role: r.link.role ?? 'default',
      label: r.link.label,
      fromIndex: fromIdx,
      toIndex: toIdx,
      dashed,
      lane: fromIdx[0] - 1,
      labelOrientation: r.fromSide === 'left' || r.fromSide === 'right' ? 'h' : 'v',
    })
    void byId
  }
}

function drawNodes(
  b: SceneBuilder,
  spec: DiagramSpec,
  nodes: NodeSpec[],
  rects: Map<string, Rect>,
  opts: GraphOptions,
) {
  for (const n of nodes) {
    const r = rects.get(n.id)
    if (!r) continue
    const isDecision =
      (opts.decisions ?? spec.kind === 'flowchart') &&
      (n.tag?.toUpperCase() === 'DECIDE' || n.shape === 'decision')
    if (isDecision) {
      b.decision({ x: r.x, y: r.y - 8, w: r.w, h: r.h + 16 }, { name: n.name, sublabel: n.sublabel, id: n.id })
    } else {
      b.node(r, { id: n.id, name: n.name, sublabel: n.sublabel, tag: n.tag, kind: n.kind, icon: n.icon })
    }
  }
}

/** Helper for engines that need a lane band behind a row of nodes. */
export function laneBand(r: Rect, label: string, b: SceneBuilder) {
  b.rect(r, { fill: alpha(b.t.ink, 0.015), stroke: b.t.rule, width: STROKE.thin, rx: RADIUS.lg, layer: 10 })
  b.text(r.x + 12, r.y + 16, label.toUpperCase(), { role: 'zoneLabel', fill: b.t.soft, layer: 11 })
}
