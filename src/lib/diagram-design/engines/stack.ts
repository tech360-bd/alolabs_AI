/**
 * Stack engine — containers, bands and grids.
 *
 * Serves: layer stack, nested, medallion, pyramid/funnel, kanban, treemap,
 * heatmap, tree, org-chart, story map, DP security matrix.
 *
 * Shared rule: bands are weighted rather than equal (a 1.1 / 1 / 0.9 rhythm),
 * everything snaps to the grid, and containment is expressed with hairlines
 * instead of shadows.
 */

import { autoLegend, autoLegendStacks, fixedLegend, measureNode } from './shared'
import { measureText, snap, snapUp } from '../geometry'
import { RADIUS, STROKE, TYPE_RAMP, alpha, nodeTreatment } from '../tokens'
import type { Rect } from '../geometry'
import type { DiagramSpec, NodeSpec, StackSpec } from '../spec'
import { SceneBuilder } from '../scene'

const PAD = { top: 40, right: 40, bottom: 40, left: 40 }

/** Normalised weights → band sizes covering `total` with `gap` between bands. */
export function weightedBands(total: number, weights: number[], gap: number): { size: number; start: number }[] {
  const usable = total - gap * (weights.length - 1)
  const sum = weights.reduce((a, w) => a + w, 0) || weights.length
  const out: { size: number; start: number }[] = []
  let cursor = 0
  weights.forEach((w, i) => {
    const raw = (usable * w) / sum
    const size = i === weights.length - 1 ? snap(usable - cursor) : snap(raw)
    out.push({ size, start: snap(cursor) })
    cursor += size + gap
  })
  return out
}

// ─── Layer stack ─────────────────────────────────────────────────────────────

export function renderLayers(spec: DiagramSpec, b: SceneBuilder): void {
  const stacks = spec.stacks ?? []
  const width = b.width - PAD.left - PAD.right
  const gap = 12
  const bands = weightedBands(b.height - PAD.top - PAD.bottom, stacks.map((s) => s.weight ?? 1), gap)
  stacks.forEach((s, i) => {
    const r: Rect = { x: PAD.left, y: PAD.top + bands[i].start, w: width, h: bands[i].size }
    const treat = nodeTreatment(s.kind ?? 'store', b.t)
    b.rect(r, { fill: treat.fill, stroke: treat.stroke, dash: treat.dash, rx: RADIUS.md, width: treat.strokeWidth })
    b.text(r.x + 16, r.y + 20, s.name, {
      role: 'nodeName',
      fill: b.t.ink,
      layer: 45,
    })
    if (s.sublabel) {
      b.text(r.x + 16, r.y + r.h - 12, s.sublabel, { role: 'sublabel', fill: b.t.muted, layer: 45 })
    }
    if (s.tag) {
      b.text(r.x + r.w - 16, r.y + 20, s.tag.toUpperCase(), {
        role: 'eyebrow',
        fill: b.t.soft,
        anchor: 'end',
        layer: 45,
      })
    }
    b.legendItem(s.kind ?? 'store', s.name)
  })
  autoLegendStacks(spec, stacks, b)
}

// ─── Nested ──────────────────────────────────────────────────────────────────

export function renderNested(spec: DiagramSpec, b: SceneBuilder): void {
  const stacks = spec.stacks ?? []
  const depths = new Map<string, number>()
  const byId = new Map(stacks.map((s) => [s.id, s]))
  const depthOf = (s: StackSpec): number => {
    if (depths.has(s.id)) return depths.get(s.id)!
    const d = s.parent && byId.has(s.parent) ? depthOf(byId.get(s.parent)!) + 1 : 0
    depths.set(s.id, d)
    return d
  }
  for (const s of stacks) depthOf(s)
  const maxDepth = Math.max(0, ...[...depths.values()])

  const inset = 32
  const gap = 20
  const render = (s: StackSpec, r: Rect) => {
    const treat = nodeTreatment(s.kind ?? 'plain', b.t)
    b.rect(r, { fill: treat.fill, stroke: treat.stroke, rx: RADIUS.lg, width: treat.strokeWidth })
    b.text(r.x + 16, r.y + 20, s.name, { role: 'nodeName', fill: b.t.ink, layer: 45 })
    if (s.sublabel) b.text(r.x + 16, r.y + r.h - 12, s.sublabel, { role: 'sublabel', fill: b.t.muted, layer: 45 })
    const children = stacks.filter((c) => c.parent === s.id)
    if (children.length) {
      const childY = r.y + 36
      const childH = r.h - 36 - inset
      const inner = r.w - inset * 2
      const bands = weightedBands(inner, children.map((c) => c.weight ?? 1), gap)
      children.forEach((c, i) => {
        render(c, { x: snap(r.x + inset + bands[i].start), y: snap(childY), w: bands[i].size, h: snapUp(childH) })
      })
    }
  }

  const roots = stacks.filter((s) => !s.parent)
  const gapV = 16
  const totalH = b.height - PAD.top - PAD.bottom
  const each = snap((totalH - gapV * (roots.length - 1)) / Math.max(roots.length, 1))
  roots.forEach((s, i) => {
    const r: Rect = { x: PAD.left, y: PAD.top + i * (each + gapV), w: b.width - PAD.left - PAD.right, h: each }
    if (maxDepth >= 0) render(s, r)
  })
  autoLegendStacks(spec, stacks, b)
}

// ─── Medallion ───────────────────────────────────────────────────────────────

export function renderMedallion(spec: DiagramSpec, b: SceneBuilder): void {
  const stacks = spec.stacks ?? []
  const gap = 24
  const bands = weightedBands(b.width - PAD.left - PAD.right, stacks.map((s) => s.weight ?? 1), gap)
  const top = PAD.top + 16
  const h = b.height - top - PAD.bottom

  stacks.forEach((s, i) => {
    const r: Rect = { x: PAD.left + bands[i].start, y: snap(top), w: bands[i].size, h: snapUp(h) }
    const treat = nodeTreatment(s.kind ?? 'store', b.t)
    b.rect(r, { fill: treat.fill, stroke: treat.stroke, rx: RADIUS.md, width: treat.strokeWidth })
    b.text(r.x + r.w / 2, r.y + 24, s.name, { role: 'nodeName', fill: b.t.ink, anchor: 'middle', layer: 45 })
    if (s.tag) b.text(r.x + r.w / 2, r.y + 40, s.tag.toUpperCase(), { role: 'eyebrow', fill: b.t.soft, anchor: 'middle', layer: 45 })
    if (s.sublabel) {
      const lines = s.sublabel.split('\n')
      lines.forEach((line, li) =>
        b.text(r.x + r.w / 2, r.y + 64 + li * 16, line, { role: 'sublabel', fill: b.t.muted, anchor: 'middle', layer: 45 }),
      )
    }
    if (i < stacks.length - 1) {
      const x = r.x + r.w + gap / 2
      b.text(x, r.y + r.h / 2, '›', { size: 16, fill: b.t.soft, anchor: 'middle', layer: 45 })
    }
    b.legendItem(s.kind ?? 'store', s.name)
  })
  autoLegendStacks(spec, stacks, b)
}

// ─── Pyramid / funnel ────────────────────────────────────────────────────────

export function renderPyramid(spec: DiagramSpec, b: SceneBuilder): void {
  const stacks = spec.stacks ?? []
  const funnel = spec.direction === 'vertical' && Boolean(spec.axis?.y?.label?.toLowerCase().includes('funnel'))
  const width = b.width - PAD.left - PAD.right
  const gap = 8
  const bands = weightedBands(b.height - PAD.top - PAD.bottom, stacks.map((s) => s.weight ?? 1), gap)
  const maxW = width

  stacks.forEach((s, i) => {
    const band = bands[i]
    const t = (i + 1) / stacks.length // 0 at the apex, 1 at the base
    const topW = funnel ? maxW * (1 - (i / stacks.length) * 0.72) : maxW * (0.28 + t * 0.72)
    const bottomW = funnel ? maxW * (1 - ((i + 1) / stacks.length) * 0.72) : maxW * (0.28 + ((i + 1) / stacks.length) * 0.72)
    const cx = PAD.left + width / 2
    const y0 = PAD.top + band.start
    const y1 = y0 + band.size
    const points = [
      `${snap(cx - topW / 2)},${snap(y0)}`,
      `${snap(cx + topW / 2)},${snap(y0)}`,
      `${snap(cx + bottomW / 2)},${snap(y1)}`,
      `${snap(cx - bottomW / 2)},${snap(y1)}`,
    ].join(' ')
    const treat = nodeTreatment(s.kind ?? (i === 0 ? 'focal' : 'store'), b.t)
    b.polygon(points, { fill: treat.fill, stroke: treat.stroke, width: treat.strokeWidth, layer: 20 })
    b.text(cx, (y0 + y1) / 2 + 2, s.name, { role: 'nodeName', fill: b.t.ink, anchor: 'middle', layer: 45 })
    if (s.sublabel) {
      b.text(cx, (y0 + y1) / 2 + 16, s.sublabel, { role: 'sublabel', fill: b.t.muted, anchor: 'middle', layer: 45 })
    }
    b.legendItem(s.kind ?? 'store', s.name)
  })
  autoLegendStacks(spec, stacks, b)
}

// ─── Kanban ──────────────────────────────────────────────────────────────────

export function renderKanban(spec: DiagramSpec, b: SceneBuilder): void {
  const groups = spec.groups ?? []
  const cards = spec.nodes ?? []
  const gap = 16
  const bands = weightedBands(b.width - PAD.left - PAD.right, groups.map((g) => g.weight ?? 1), gap)
  const top = PAD.top + 8
  const colH = b.height - top - PAD.bottom - 24

  groups.forEach((g, gi) => {
    const r: Rect = { x: PAD.left + bands[gi].start, y: snap(top), w: bands[gi].size, h: snapUp(colH) }
    b.rect(r, { fill: alpha(b.t.ink, 0.02), stroke: b.t.rule, rx: RADIUS.lg, width: STROKE.thin, layer: 10 })
    b.text(r.x + 12, r.y + 18, g.label, { role: 'nodeName', fill: b.t.ink, layer: 11 })
    const count = cards.filter((c) => c.zone === g.id).length
    const limit = g.limit
    const over = typeof limit === 'number' && count > limit
    b.text(r.x + r.w - 12, r.y + 17, `${count}${typeof limit === 'number' ? `/${limit}` : ''}`, {
      role: 'chartValue',
      fill: over ? b.t.accent : b.t.soft,
      anchor: 'end',
      layer: 11,
    })
    if (g.sublabel) b.text(r.x + 12, r.y + 32, g.sublabel.toUpperCase(), { role: 'eyebrow', fill: b.t.soft, layer: 11 })

    let y = r.y + 44
    for (const card of cards.filter((c) => c.zone === g.id)) {
      const rw = r.w - 24
      const textW = measureText(card.name, { family: 'sans', size: TYPE_RAMP.nodeName.size })
      const h = snapUp(textW > rw - 24 ? 64 : 48)
      if (y + h > r.y + r.h - 12) break
      const cr: Rect = { x: snap(r.x + 12), y: snap(y), w: snapUp(rw), h }
      b.node(cr, { id: card.id, name: card.name, sublabel: card.sublabel, tag: card.tag, kind: card.kind })
      y += h + 12
    }
    b.legendItem(g.limit ? 'optional' : 'store', g.label)
  })
  if (spec.legend) b.legendFromSpec(groups.map((g) => ({ kind: 'store' as const, label: g.label })))
}

// ─── Tree / org chart ────────────────────────────────────────────────────────

export function renderTree(spec: DiagramSpec, b: SceneBuilder, opts: { org?: boolean } = {}): void {
  const nodes = spec.nodes ?? []
  const links = spec.links ?? []
  const children = new Map<string, string[]>()
  const hasParent = new Set<string>()
  for (const l of links) {
    if (!children.has(l.from)) children.set(l.from, [])
    children.get(l.from)!.push(l.to)
    hasParent.add(l.to)
  }
  const roots = nodes.filter((n) => !hasParent.has(n.id))
  const levelGap = opts.org ? 72 : 64
  const nodeGap = opts.org ? 24 : 32

  // Assign leaves first, then centre parents over their children.
  const positions = new Map<string, Rect>()
  const sizes = new Map<string, { w: number; h: number }>()
  for (const n of nodes) sizes.set(n.id, measureNode(n, { minW: opts.org ? 128 : 112, minH: opts.org ? 60 : 52 }))

  const depth = new Map<string, number>()
  const walkDepth = (id: string, d: number) => {
    depth.set(id, d)
    for (const c of children.get(id) ?? []) walkDepth(c, d + 1)
  }
  for (const r of roots) walkDepth(r.id, 0)
  const maxDepth = Math.max(0, ...[...depth.values()])
  const levelH = Math.max(...[...sizes.values()].map((s) => s.h))

  let leafCursor = PAD.left
  const walkPos = (id: string): number => {
    const kids = children.get(id) ?? []
    const s = sizes.get(id)!
    const d = depth.get(id) ?? 0
    const y = PAD.top + d * (levelH + levelGap)
    if (!kids.length) {
      const x = snap(leafCursor)
      positions.set(id, { x, y: snap(y), w: s.w, h: s.h })
      leafCursor += s.w + nodeGap
      return x + s.w / 2
    }
    const centers = kids.map((k) => walkPos(k))
    const center = (Math.min(...centers) + Math.max(...centers)) / 2
    positions.set(id, { x: snap(center - s.w / 2), y: snap(y), w: s.w, h: s.h })
    return center
  }
  for (const r of roots) walkPos(r.id)
  void maxDepth

  // Connectors — orthogonal elbows from parent bottom to child top.
  for (const l of links) {
    const a = positions.get(l.from)
    const c = positions.get(l.to)
    if (!a || !c) continue
    b.link(a, c, {
      fromSide: 'bottom',
      toSide: 'top',
      role: l.role ?? 'default',
      label: l.label,
      fromIndex: [(children.get(l.from) ?? []).indexOf(l.to) + 1, (children.get(l.from) ?? []).length],
      toIndex: [1, 1],
      dashed: l.dashed,
      labelOrientation: 'h',
    })
  }
  for (const n of nodes) {
    const r = positions.get(n.id)
    if (!r) continue
    b.node(r, { id: n.id, name: n.name, sublabel: n.sublabel, tag: n.tag, kind: n.kind })
  }
  autoLegend(spec, nodes, b)
}

// ─── Story map ───────────────────────────────────────────────────────────────

export function renderStoryMap(spec: DiagramSpec, b: SceneBuilder): void {
  const activities = spec.groups ?? []
  const cards = spec.nodes ?? []
  const sliceCount = Number(spec.axis?.y?.label ?? 3)
  const gridTop = PAD.top + 32
  const labelCol = 88
  const gridW = b.width - PAD.left - PAD.right - labelCol
  const colGap = 12
  const cols = weightedBands(gridW, activities.map((a) => a.weight ?? 1), colGap)
  const rowH = snap((b.height - gridTop - PAD.bottom - 12 - 28) / sliceCount)

  // Backbone — activity headers.
  activities.forEach((a, i) => {
    const r: Rect = { x: PAD.left + labelCol + cols[i].start, y: gridTop, w: cols[i].size, h: 28 }
    b.rect(r, { fill: alpha(b.t.ink, 0.05), stroke: b.t.ruleSolid, rx: RADIUS.md, width: STROKE.thin, layer: 11 })
    b.text(r.x + r.w / 2, r.y + 18, a.label, { role: 'nodeName', fill: b.t.ink, anchor: 'middle', layer: 12 })
  })
  void 0
  // Slices.
  for (let sIdx = 0; sIdx < sliceCount; sIdx++) {
    const y = gridTop + 28 + 12 + sIdx * (rowH + 8)
    b.text(PAD.left + labelCol - 12, y + rowH / 2, `RELEASE ${sliceCount - sIdx}`, {
      role: 'eyebrow',
      fill: b.t.soft,
      anchor: 'end',
      layer: 12,
    })
    b.line(PAD.left, y - 8, b.width - PAD.right, y - 8, {
      stroke: b.t.rule,
      width: STROKE.thin,
      layer: 10,
      dash: sIdx === 0 ? undefined : undefined,
    })
    activities.forEach((a, i) => {
      const cardsHere = cards.filter((c) => c.zone === `${a.id}:${sIdx}`)
      let cy = y
      for (const card of cardsHere) {
        const cr: Rect = { x: PAD.left + labelCol + cols[i].start, y: snap(cy), w: cols[i].size, h: 40 }
        b.node(cr, { id: card.id, name: card.name, sublabel: card.sublabel, tag: card.tag, kind: card.kind }, { layer: 40 })
        cy += 48
      }
    })
  }
  fixedLegend(spec, b, [{ kind: 'focal', label: 'Cut line' }, { kind: 'store', label: 'Story' }])
}

// ─── Heatmap ─────────────────────────────────────────────────────────────────

export function renderHeatmap(spec: DiagramSpec, b: SceneBuilder): void {
  const cells = spec.cells ?? []
  const rows = [...new Set(cells.map((c) => c.row))]
  const cols = [...new Set(cells.map((c) => c.col))]
  const values = cells.map((c) => c.value)
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 1)
  const labelW = Math.max(...rows.map((r) => measureText(r, { family: 'mono', size: TYPE_RAMP.chartLabel.size }))) + 24
  const gridW = b.width - PAD.left - PAD.right - labelW
  const gridH = b.height - PAD.top - PAD.bottom - 28
  const cellW = snap(gridW / Math.max(cols.length, 1))
  const cellH = snap(gridH / Math.max(rows.length, 1))

  cols.forEach((c, i) =>
    b.axisLabel(PAD.left + labelW + i * cellW + cellW / 2, PAD.top + 12, c, 'middle'),
  )
  rows.forEach((r, ri) => {
    b.text(PAD.left + labelW - 12, PAD.top + 24 + ri * cellH + cellH / 2 + 3, r, {
      role: 'chartLabel',
      fill: b.t.ink,
      anchor: 'end',
      layer: 13,
    })
    cols.forEach((c, ci) => {
      const cell = cells.find((x) => x.row === r && x.col === c)
      const t = cell ? (cell.value - min) / (max - min || 1) : 0
      const r0: Rect = { x: PAD.left + labelW + ci * cellW, y: PAD.top + 24 + ri * cellH, w: cellW - 4, h: cellH - 4 }
      b.rect(r0, {
        fill: cell ? alpha(b.t.accent, 0.08 + t * 0.72) : alpha(b.t.ink, 0.02),
        stroke: b.t.rule,
        width: STROKE.thin,
        rx: RADIUS.sm,
        layer: 12,
      })
      if (cell) {
        b.text(r0.x + r0.w / 2, r0.y + r0.h / 2 + 3, cell.label ?? String(cell.value), {
          role: 'chartValue',
          fill: t > 0.55 ? b.t.inkStrong : b.t.ink,
          anchor: 'middle',
          layer: 13,
        })
      }
    })
  })
  fixedLegend(spec, b, [{ kind: 'focal', label: 'High' }, { kind: 'store', label: 'Low' }])
}

// ─── Treemap ─────────────────────────────────────────────────────────────────

export function renderTreemap(spec: DiagramSpec, b: SceneBuilder): void {
  const stacks = spec.stacks ?? []
  const total = stacks.reduce((a, s) => a + (s.weight ?? 1), 0) || 1
  const area = { x: PAD.left, y: PAD.top, w: b.width - PAD.left - PAD.right, h: b.height - PAD.top - PAD.bottom }
  const gap = 8

  // Slice-and-dice with a squarified-ish alternating split.
  const items = [...stacks].sort((a, c) => (c.weight ?? 1) - (a.weight ?? 1))
  const rectsOut: { s: StackSpec; r: Rect }[] = []
  const arrange = (list: StackSpec[], r: Rect, horizontal: boolean) => {
    if (!list.length) return
    if (list.length === 1) {
      rectsOut.push({ s: list[0], r })
      return
    }
    const sum = list.reduce((a, s) => a + (s.weight ?? 1), 0) || 1
    const half = sum / 2
    let acc = 0
    let split = 1
    for (let i = 0; i < list.length; i++) {
      acc += list[i].weight ?? 1
      if (acc >= half) {
        split = i + 1
        break
      }
    }
    const aGroup = list.slice(0, split)
    const bGroup = list.slice(split)
    const aSum = aGroup.reduce((x, s) => x + (s.weight ?? 1), 0)
    const frac = aSum / sum
    if (horizontal) {
      const w = snap(r.w * frac)
      arrange(aGroup, { x: r.x, y: r.y, w: w - gap / 2, h: r.h }, !horizontal)
      arrange(bGroup, { x: r.x + w + gap / 2, y: r.y, w: r.w - w - gap / 2, h: r.h }, !horizontal)
    } else {
      const h = snap(r.h * frac)
      arrange(aGroup, { x: r.x, y: r.y, w: r.w, h: h - gap / 2 }, !horizontal)
      arrange(bGroup, { x: r.x, y: r.y + h + gap / 2, w: r.w, h: r.h - h - gap / 2 }, !horizontal)
    }
  }
  arrange(items, area, area.w >= area.h)
  void total

  for (const { s, r } of rectsOut) {
    const treat = nodeTreatment(s.kind ?? 'store', b.t)
    b.rect(r, { fill: treat.fill, stroke: treat.stroke, rx: RADIUS.md, width: treat.strokeWidth })
    b.text(r.x + 12, r.y + 20, s.name, { role: 'nodeName', fill: b.t.ink, layer: 45 })
    if (s.sublabel) b.text(r.x + 12, r.y + r.h - 12, s.sublabel, { role: 'sublabel', fill: b.t.muted, layer: 45 })
    const pct = Math.round(((s.weight ?? 1) / total) * 100)
    if (r.w > 96) b.text(r.x + r.w - 12, r.y + 20, `${pct}%`, { role: 'chartValue', fill: b.t.soft, anchor: 'end', layer: 45 })
    b.legendItem(s.kind ?? 'store', s.name)
  }
  autoLegendStacks(spec, stacks, b)
}

// ─── DP security matrix ──────────────────────────────────────────────────────

export function renderSecurityMatrix(spec: DiagramSpec, b: SceneBuilder): void {
  const roles = spec.groups ?? []
  const resources = spec.nodes ?? []
  const labelW = Math.max(...resources.map((r) => measureText(r.name, { family: 'mono', size: TYPE_RAMP.chartLabel.size }))) + 24
  const headerH = 40
  const gridW = b.width - PAD.left - PAD.right - labelW
  const gridH = b.height - PAD.top - PAD.bottom - headerH
  const colW = snap(gridW / Math.max(roles.length, 1))
  const rowH = snap(gridH / Math.max(resources.length, 1))

  roles.forEach((role, i) => {
    b.text(PAD.left + labelW + i * colW + colW / 2, PAD.top + 20, role.label, {
      role: 'nodeName',
      fill: b.t.ink,
      anchor: 'middle',
      layer: 13,
    })
    b.line(PAD.left + labelW + i * colW, PAD.top + 28, PAD.left + labelW + i * colW, PAD.top + headerH + gridH, {
      stroke: b.t.rule,
      width: STROKE.thin,
      layer: 10,
    })
  })
  resources.forEach((res, ri) => {
    const y = PAD.top + headerH + ri * rowH
    b.text(PAD.left + labelW - 12, y + rowH / 2 + 3, res.name, { role: 'chartLabel', fill: b.t.ink, anchor: 'end', layer: 13 })
    roles.forEach((role, ci) => {
      const grant = spec.cells?.find((c) => c.row === res.id && c.col === role.id)?.value ?? 0
      const cx = PAD.left + labelW + ci * colW + colW / 2
      const cy = y + rowH / 2
      if (grant >= 2) {
        // Full grant — the accent is spent on the access level, not per role.
        b.circle(cx, cy, 4.5, { fill: b.t.accent, layer: 41 })
      } else if (grant >= 1) {
        // Read-only — hollow mark.
        b.circle(cx, cy, 4.5, { fill: 'transparent', stroke: b.t.muted, width: STROKE.default, layer: 41 })
      } else {
        b.text(cx, cy + 3, '·', { role: 'chartValue', fill: b.t.soft, anchor: 'middle', layer: 13 })
      }
    })
    b.line(PAD.left, y, b.width - PAD.right, y, { stroke: b.t.rule, width: STROKE.thin, layer: 10 })
  })
  fixedLegend(spec, b, [
    { kind: 'focal', label: 'Full access' },
    { kind: 'plain', label: 'Read-only' },
    { kind: 'optional', label: 'Denied' },
  ])
}

/** Which stack family a kind belongs to. */
export function isStackKind(kind: DiagramSpec['kind']): boolean {
  return ['layers', 'nested', 'medallion', 'pyramid', 'kanban', 'treemap', 'heatmap', 'story-map', 'dp-security-matrix', 'tree', 'org-chart'].includes(kind)
}

export type { NodeSpec }
