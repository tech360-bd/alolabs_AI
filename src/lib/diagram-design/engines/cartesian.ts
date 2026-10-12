/**
 * Cartesian engine — charts on an axis.
 *
 * Serves: bar, line, scatter, Gantt, timeline, waterfall, user journey,
 * Wardley map.
 *
 * Shared rule: axes are hairlines, gridlines sit at ~8% ink, values use the
 * mono ramp, and only the focal series takes the accent — everything else is
 * muted or rides the series palette.
 */

import { niceTicks, measureText, snap, snapUp } from '../geometry'
import { RADIUS, STROKE, TYPE_RAMP, alpha, nodeTreatment } from '../tokens'
import { seriesColor } from './shared'
import type { Rect } from '../geometry'
import type { DiagramSpec } from '../spec'
import { SceneBuilder } from '../scene'

export const PLOT = { top: 56, right: 48, bottom: 72, left: 64 }

interface Axes {
  inner: Rect
  xTicks: number[]
  yTicks: number[]
  xScale: (v: number) => number
  yScale: (v: number) => number
  showY: boolean
}

interface AxesOptions {
  minY?: number
  maxY?: number
  minX?: number
  maxX?: number
  ticksY?: number
  ticksX?: number
  grid?: boolean
  formatY?: (v: number) => string
  formatX?: (v: number) => string
}

export function buildAxes(b: SceneBuilder, spec: DiagramSpec, opts: AxesOptions = {}): Axes {
  const inner: Rect = {
    x: snap(PLOT.left),
    y: snap(PLOT.top),
    w: snap(b.width - PLOT.left - PLOT.right),
    h: snap(b.height - PLOT.top - PLOT.bottom),
  }
  const ticksY = opts.ticksY ?? 4
  const ticksX = opts.ticksX ?? 4
  const yTicks = ticksY > 0 ? niceTicks(opts.minY ?? 0, opts.maxY ?? 1, ticksY) : []
  const xTicks = ticksX > 0 ? niceTicks(opts.minX ?? 0, opts.maxX ?? 1, ticksX) : []
  const yMin = yTicks.length ? yTicks[0] : opts.minY ?? 0
  const yMax = yTicks.length ? yTicks[yTicks.length - 1] : opts.maxY ?? 1
  const xMin = xTicks.length ? xTicks[0] : opts.minX ?? 0
  const xMax = xTicks.length ? xTicks[xTicks.length - 1] : opts.maxX ?? 1

  const xScale = (v: number) => snap(inner.x + ((v - xMin) / (xMax - xMin || 1)) * inner.w)
  const yScale = (v: number) => snap(inner.y + inner.h - ((v - yMin) / (yMax - yMin || 1)) * inner.h)

  for (const t of yTicks) {
    const y = yScale(t)
    b.line(inner.x, y, inner.x + inner.w, y, { stroke: alpha(b.t.ink, 0.08), width: STROKE.thin, layer: 10 })
    b.tickLabel(inner.x - 8, y + 3, opts.formatY ? opts.formatY(t) : String(t), 'end')
  }
  for (const t of xTicks) {
    const x = xScale(t)
    b.line(x, inner.y, x, inner.y + inner.h, { stroke: alpha(b.t.ink, 0.04), width: STROKE.thin, layer: 10 })
    b.tickLabel(x, inner.y + inner.h + 16, opts.formatX ? opts.formatX(t) : String(t), 'middle')
  }
  // Axes are hairlines, not chrome.
  b.line(inner.x, inner.y + inner.h, inner.x + inner.w, inner.y + inner.h, {
    stroke: b.t.ruleSolid,
    width: STROKE.default,
    layer: 11,
  })
  b.line(inner.x, inner.y, inner.x, inner.y + inner.h, {
    stroke: b.t.ruleSolid,
    width: STROKE.default,
    layer: 11,
  })

  const xLabel = spec.axis?.x?.label
  const yLabel = spec.axis?.y?.label
  if (xLabel) b.axisLabel(inner.x + inner.w / 2, b.height - PLOT.bottom + 52, xLabel, 'middle')
  if (yLabel) b.text(inner.x - 48, inner.y - 16, yLabel.toUpperCase(), { role: 'axis', fill: b.t.soft, layer: 13 })

  return { inner, xTicks, yTicks, xScale, yScale, showY: ticksY > 0 }
}

// ─── Bar chart ───────────────────────────────────────────────────────────────

export function renderBar(spec: DiagramSpec, b: SceneBuilder): void {
  const categories = spec.categories ?? []
  const series = spec.series ?? []
  const groups = spec.groups ?? []
  const values = series.flatMap((s) => s.values)
  const max = Math.max(...values, 0)
  const axes = buildAxes(b, spec, { minY: 0, maxY: max, ticksY: 4, ticksX: 0 })
  const bandGap = 24
  const bandW = snap((axes.inner.w - bandGap * (categories.length - 1)) / Math.max(categories.length, 1))
  const barW = snap(bandW / Math.max(series.length, 1))
  const focalIndex = series.findIndex((s) => s.focal)

  categories.forEach((cat, ci) => {
    const bandX = snap(axes.inner.x + ci * (bandW + bandGap))
    series.forEach((s, si) => {
      const v = s.values[ci] ?? 0
      const y = axes.yScale(v)
      const h = Math.max(snap(axes.inner.y + axes.inner.h - y), 2)
      const r: Rect = { x: snap(bandX + si * barW), y, w: Math.max(barW - 8, 12), h }
      const color = seriesColor(si, s.focal ?? si === focalIndex, b.theme, b.t)
      const isFocal = s.focal ?? si === focalIndex
      b.rect(r, {
        fill: alpha(color, isFocal ? 0.22 : 0.16),
        stroke: color,
        rx: RADIUS.sm,
        width: isFocal ? STROKE.strong : STROKE.default,
        layer: 20,
      })
      b.chip(r.x + r.w / 2, r.y - 8, String(v), { anchor: 'middle' })
      if (r.h > 32 && series.length === 1) {
        b.text(r.x + r.w / 2, r.y + 16, s.label.slice(0, 10).toUpperCase(), {
          role: 'eyebrow',
          fill: b.t.muted,
          anchor: 'middle',
          layer: 45,
        })
      }
    })
    b.text(bandX + bandW / 2, axes.inner.y + axes.inner.h + 34, cat, {
      role: 'chartLabel',
      fill: b.t.ink,
      anchor: 'middle',
      layer: 45,
    })
    const group = groups.find((g) => g.id === cat)
    if (group?.sublabel) {
      b.text(bandX + bandW / 2, axes.inner.y + axes.inner.h + 48, group.sublabel, {
        role: 'sublabel',
        fill: b.t.soft,
        anchor: 'middle',
        layer: 45,
      })
    }
  })

  b.legendFromSpec(
    spec.legend && Array.isArray(spec.legend)
      ? spec.legend
      : series.map((s) => ({ kind: s.focal ? 'focal' : 'store', label: s.label })),
  )
}

// ─── Line chart ──────────────────────────────────────────────────────────────

export function renderLine(spec: DiagramSpec, b: SceneBuilder): void {
  const categories = spec.categories ?? []
  const series = spec.series ?? []
  const values = series.flatMap((s) => s.values)
  const min = Math.min(0, ...values)
  const max = Math.max(...values, 1)
  const slopegraph = categories.length === 2 && series.length <= 5
  const axes = buildAxes(b, spec, {
    minY: min,
    maxY: max,
    ticksY: 4,
    ticksX: slopegraph ? 0 : Math.max(categories.length - 1, 0),
  })

  const xAt = (i: number) =>
    categories.length <= 1
      ? snap(axes.inner.x + axes.inner.w / 2)
      : snap(axes.inner.x + (i / (categories.length - 1)) * axes.inner.w)

  const focalIndex = series.findIndex((s) => s.focal)

  series.forEach((s, si) => {
    const color = seriesColor(si, s.focal ?? si === focalIndex, b.theme, b.t)
    const isFocal = s.focal ?? si === focalIndex
    const pts = s.values.map((v, i) => ({ x: xAt(i), y: axes.yScale(v) }))

    if (pts.length > 1) {
      b.polyline(pts, {
        stroke: color,
        width: isFocal ? STROKE.strong : STROKE.default,
        layer: 20,
        opacity: isFocal ? 1 : 0.85,
      })
    }
    pts.forEach((p, i) => {
      b.circle(p.x, p.y, isFocal ? 4 : 3, {
        fill: color,
        stroke: b.t.paper,
        width: 2,
        layer: 41,
      })
      if (slopegraph) {
        b.text(i === 0 ? p.x - 12 : p.x + 12, p.y + 4, `${s.label} ${s.values[i]}`, {
          role: 'chartLabel',
          fill: b.t.ink,
          anchor: i === 0 ? 'end' : 'start',
          layer: 45,
        })
      }
    })
  })

  if (!slopegraph) {
    categories.forEach((c, i) => {
      b.text(xAt(i), axes.inner.y + axes.inner.h + 34, c, {
        role: 'chartLabel',
        fill: b.t.ink,
        anchor: 'middle',
        layer: 45,
      })
    })
  }

  b.legendFromSpec(series.map((s) => ({ kind: s.focal ? 'focal' : 'store', label: s.label })))
}

// ─── Scatter / bubble / beeswarm ─────────────────────────────────────────────

export function renderScatter(spec: DiagramSpec, b: SceneBuilder): void {
  const points = spec.points ?? []
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const padX = (Math.max(...xs, 1) - Math.min(...xs, 0)) * 0.08 || 1
  const padY = (Math.max(...ys, 1) - Math.min(...ys, 0)) * 0.08 || 1
  const axes = buildAxes(b, spec, {
    minX: Math.min(...xs, 0) - padX,
    maxX: Math.max(...xs, 1) + padX,
    minY: Math.min(...ys, 0) - padY,
    maxY: Math.max(...ys, 1) + padY,
    ticksY: 4,
    ticksX: 4,
  })

  for (const p of points) {
    const x = axes.xScale(p.x)
    const y = axes.yScale(p.y)
    const r = p.r ?? 5
    b.circle(x, y, r, {
      fill: p.focal ? alpha(b.t.accent, 0.22) : alpha(b.t.muted, 0.16),
      stroke: p.focal ? b.t.accent : b.t.muted,
      width: p.focal ? STROKE.strong : STROKE.default,
      layer: 41,
    })
    if (p.label) {
      b.text(x, y - r - 8, p.label, {
        role: 'chartValue',
        fill: p.focal ? b.t.ink : b.t.muted,
        anchor: 'middle',
        layer: 45,
      })
    }
  }
  b.legendFromSpec([{ kind: 'focal', label: 'Focal' }, { kind: 'store', label: 'Series' }])
}

// ─── Gantt ───────────────────────────────────────────────────────────────────

export function renderGantt(spec: DiagramSpec, b: SceneBuilder): void {
  const tasks = spec.tasks ?? []
  const phases = [...new Set(tasks.map((t) => t.phase ?? 'Phase'))]
  const maxEnd = Math.max(...tasks.map((t) => t.end), 1)
  const labelW = 200
  const inner: Rect = {
    x: snap(PLOT.left + labelW),
    y: snap(PLOT.top),
    w: snap(b.width - PLOT.left - labelW - PLOT.right),
    h: snap(b.height - PLOT.top - PLOT.bottom),
  }
  const xScale = (v: number) => snap(inner.x + (v / maxEnd) * inner.w)

  const ticks = niceTicks(0, maxEnd, 4)
  for (const t of ticks) {
    const x = xScale(t)
    b.line(x, inner.y - 8, x, inner.y + inner.h, { stroke: alpha(b.t.ink, 0.08), width: STROKE.thin, layer: 10 })
    b.tickLabel(x, inner.y - 16, String(t), 'middle')
  }
  b.line(inner.x, inner.y, inner.x + inner.w, inner.y, { stroke: b.t.ruleSolid, width: STROKE.default, layer: 11 })

  const rowH = snap(Math.min(36, inner.h / Math.max(tasks.length + phases.length, 1)))
  let y = inner.y + 8
  let lastPhase = ''
  for (const t of tasks) {
    const phase = t.phase ?? 'Phase'
    if (phase !== lastPhase) {
      if (lastPhase) y += 12
      b.text(PLOT.left, y + 14, phase.toUpperCase(), { role: 'eyebrow', fill: b.t.soft, layer: 13 })
      lastPhase = phase
      y += 24
    }
    b.text(PLOT.left, y + 16, t.name, { role: 'chartLabel', fill: b.t.ink, layer: 13 })
    const x0 = xScale(t.start)
    const x1 = xScale(t.end)
    const treat = nodeTreatment(t.kind ?? 'store', b.t)
    b.rect({ x: x0, y: y + 4, w: Math.max(x1 - x0, 8), h: 16 }, {
      fill: treat.fill,
      stroke: treat.stroke,
      width: treat.strokeWidth,
      dash: treat.dash,
      rx: RADIUS.sm,
      layer: 20,
    })
    b.text(x1 + 8, y + 16, `${t.start}–${t.end}`, { role: 'chartValue', fill: b.t.soft, layer: 45 })
    y += rowH
  }
  b.axisLabel(inner.x + inner.w / 2, b.height - 24, spec.axis?.x?.label ?? 'Weeks from kickoff', 'middle')
  b.legendFromSpec(phases.map((p, i) => ({ kind: i === 0 ? 'focal' : 'store', label: p })))
}

// ─── Timeline ────────────────────────────────────────────────────────────────

export function renderTimeline(spec: DiagramSpec, b: SceneBuilder): void {
  const events = spec.events ?? []
  const axisY = snap(b.height / 2)
  const inner: Rect = { x: snap(PLOT.left), y: axisY, w: snap(b.width - PLOT.left - PLOT.right), h: 0 }
  b.line(inner.x, axisY, inner.x + inner.w, axisY, { stroke: b.t.ruleSolid, width: STROKE.default, layer: 11 })
  b.axisLabel(inner.x, axisY + 26, spec.scale?.from ?? 'START', 'start')
  b.axisLabel(inner.x + inner.w, axisY + 26, spec.scale?.to ?? 'TODAY', 'end')

  const n = Math.max(events.length, 1)
  events.forEach((e, i) => {
    const x = snap(inner.x + (inner.w * (i + 0.5)) / n)
    const up = i % 2 === 0
    const isLast = i === events.length - 1
    const kind = e.kind ?? (isLast ? 'focal' : 'store')
    b.circle(x, axisY, 4, { fill: isLast ? b.t.accent : b.t.muted, layer: 41 })
    b.line(x, up ? axisY - 8 : axisY + 8, x, up ? axisY - 44 : axisY + 44, {
      stroke: alpha(b.t.ink, 0.25),
      width: STROKE.thin,
      layer: 11,
    })
    const boxW = snapUp(Math.min(220, measureText(e.name, { family: 'sans', size: TYPE_RAMP.nodeName.size }) + 48))
    const boxH = e.sublabel ? 56 : 40
    const box: Rect = {
      x: snap(x - boxW / 2),
      y: up ? snap(axisY - 44 - boxH) : snap(axisY + 44),
      w: boxW,
      h: boxH,
    }
    b.node(box, { id: e.id, name: e.name, sublabel: e.sublabel, kind })
  })
  b.legendFromSpec([{ kind: 'focal', label: 'Latest' }, { kind: 'store', label: 'Milestone' }])
}

// ─── Waterfall ───────────────────────────────────────────────────────────────

export function renderWaterfall(spec: DiagramSpec, b: SceneBuilder): void {
  const steps = spec.steps ?? []
  const totals: number[] = []
  let running = 0
  for (const s of steps) {
    if (s.type === 'total') {
      running = s.value
      totals.push(running)
    } else if (s.type === 'subtotal') {
      totals.push(running)
    } else {
      running += s.value
      totals.push(running)
    }
  }
  const max = Math.max(running, ...totals, 1)
  const axes = buildAxes(b, spec, { minY: 0, maxY: max, ticksY: 4, ticksX: 0 })
  const bandW = snap(axes.inner.w / Math.max(steps.length, 1))
  const barW = Math.max(bandW - 24, 16)

  let prev = 0
  steps.forEach((s, i) => {
    const x = snap(axes.inner.x + i * bandW + (bandW - barW) / 2)
    const isTotal = s.type === 'total' || s.type === 'subtotal'
    const start = isTotal ? 0 : prev
    const end = isTotal ? s.value : prev + s.value
    const y0 = axes.yScale(Math.max(start, end))
    const y1 = axes.yScale(Math.min(start, end))
    const h = Math.max(snap(y1 - y0), 4)
    const positive = isTotal || s.value >= 0
    const color = isTotal ? b.t.ink : positive ? b.t.muted : b.t.accent
    b.rect({ x, y: y0, w: barW, h }, {
      fill: isTotal ? alpha(b.t.ink, 0.08) : alpha(color, 0.16),
      stroke: color,
      rx: RADIUS.sm,
      width: STROKE.default,
      layer: 20,
    })
    b.chip(x + barW / 2, y0 - 8, `${isTotal ? '' : s.value > 0 ? '+' : ''}${s.value}`, { anchor: 'middle' })
    b.text(x + barW / 2, axes.inner.y + axes.inner.h + 34, s.name, {
      role: 'chartLabel',
      fill: b.t.ink,
      anchor: 'middle',
      layer: 45,
    })
    if (s.sublabel) {
      b.text(x + barW / 2, axes.inner.y + axes.inner.h + 48, s.sublabel, {
        role: 'sublabel',
        fill: b.t.soft,
        anchor: 'middle',
        layer: 45,
      })
    }
    if (i < steps.length - 1) {
      const nx = snap(axes.inner.x + (i + 1) * bandW + (bandW - barW) / 2)
      const y = axes.yScale(end)
      b.line(x + barW, y, nx, y, { stroke: alpha(b.t.ink, 0.35), width: STROKE.thin, dash: '3,3', layer: 20 })
    }
    prev = isTotal ? s.value : end
    void running
  })
  b.legendFromSpec([
    { kind: 'focal', label: 'Decrease' },
    { kind: 'store', label: 'Increase' },
    { kind: 'plain', label: 'Total' },
  ])
}

// ─── User journey ────────────────────────────────────────────────────────────

export function renderJourney(spec: DiagramSpec, b: SceneBuilder): void {
  const stages = spec.groups ?? []
  const rows = spec.nodes ?? []
  const rowNames = [...new Set(rows.map((r) => r.zone ?? 'Doing'))]
  const labelW = 128
  const top = PLOT.top - 8
  const gridW = b.width - PLOT.left - labelW - PLOT.right
  const sentimentH = spec.series?.length ? 56 : 0
  const rowH = snap((b.height - top - PLOT.bottom - 20 - sentimentH) / Math.max(rowNames.length, 1))
  const colW = snap(gridW / Math.max(stages.length, 1))

  stages.forEach((s, i) => {
    const x = PLOT.left + labelW + i * colW
    b.text(x + colW / 2, top - 16, s.label, { role: 'nodeName', fill: b.t.ink, anchor: 'middle', layer: 13 })
    if (s.sublabel) {
      b.text(x + colW / 2, top - 2, s.sublabel, { role: 'chartValue', fill: b.t.soft, anchor: 'middle', layer: 13 })
    }
    if (i > 0) {
      b.line(x, top + 8, x, top + 8 + rowH * rowNames.length, {
        stroke: alpha(b.t.ink, 0.08),
        width: STROKE.thin,
        layer: 10,
      })
    }
  })

  rowNames.forEach((row, ri) => {
    const y = top + 8 + ri * rowH
    b.text(PLOT.left, y + rowH / 2 + 3, row.toUpperCase(), { role: 'eyebrow', fill: b.t.soft, layer: 13 })
    stages.forEach((s, ci) => {
      const item = rows.find((r) => r.zone === row && r.col === ci)
      if (!item) return
      const r: Rect = { x: PLOT.left + labelW + ci * colW + 12, y: y + 12, w: colW - 24, h: rowH - 24 }
      b.node(r, { id: item.id, name: item.name, sublabel: item.sublabel, tag: item.tag, kind: item.kind })
    })
  })

  const sentiment = spec.series?.[0]
  if (sentiment) {
    const yBase = top + 8 + rowH * rowNames.length + 24
    const points = sentiment.values.map((v, i) => ({
      x: PLOT.left + labelW + i * colW + colW / 2,
      y: snap(yBase - v * 14),
    }))
    points.forEach((p, i) => {
      b.circle(p.x, p.y, 4, {
        fill: sentiment.values[i] < 0 ? b.t.accent : b.t.muted,
        stroke: b.t.paper,
        width: 2,
        layer: 41,
      })
      if (i > 0) {
        b.line(points[i - 1].x, points[i - 1].y, p.x, p.y, {
          stroke: alpha(b.t.ink, 0.3),
          width: STROKE.default,
          dash: '4,3',
          layer: 20,
        })
      }
    })
    b.text(PLOT.left, yBase - 20, sentiment.label.toUpperCase(), { role: 'eyebrow', fill: b.t.soft, layer: 13 })
  }
  b.legendFromSpec([{ kind: 'focal', label: 'Pain point' }, { kind: 'store', label: 'Action' }])
}

// ─── Wardley map ─────────────────────────────────────────────────────────────

export function renderWardley(spec: DiagramSpec, b: SceneBuilder): void {
  const nodes = spec.nodes ?? []
  const axes = buildAxes(b, spec, { minX: 0, maxX: 1, minY: 0, maxY: 1, ticksY: 0, ticksX: 0, grid: false })
  const stages = ['GENESIS', 'CUSTOM', 'PRODUCT', 'COMMODITY']
  stages.forEach((s, i) => {
    b.axisLabel(axes.inner.x + (axes.inner.w * (i + 0.5)) / 4, axes.inner.y + axes.inner.h + 20, s, 'middle')
  })
  b.axisLabel(axes.inner.x, axes.inner.y - 12, spec.axis?.y?.label ?? 'VALUE CHAIN', 'start')
  b.axisLabel(axes.inner.x + axes.inner.w, axes.inner.y + axes.inner.h + 20, spec.axis?.x?.label ?? 'EVOLUTION', 'end')

  const rects = new Map<string, Rect>()
  for (const n of nodes) {
    const x = axes.xScale(n.col ?? 0.5)
    const y = axes.yScale(n.row ?? 0.5)
    const r: Rect = { x: snap(x - 56), y: snap(y - 20), w: 112, h: 40 }
    rects.set(n.id, r)
    b.node(r, { id: n.id, name: n.name, sublabel: n.sublabel, tag: n.tag, kind: n.kind }, { layer: 40 })
  }
  for (const l of spec.links ?? []) {
    const a = rects.get(l.from)
    const c = rects.get(l.to)
    if (!a || !c) continue
    b.link(a, c, { role: l.role ?? 'default', dashed: l.dashed ?? true, fromSide: 'top', toSide: 'bottom' })
  }
  for (const m of spec.movements ?? []) {
    const a = rects.get(m.from)
    const c = rects.get(m.to)
    if (!a || !c) continue
    b.line(a.x + a.w / 2, a.y, c.x + c.w / 2, c.y, {
      stroke: b.t.accent,
      width: STROKE.strong,
      dash: '4,3',
      layer: 21,
    })
  }
  b.legendFromSpec([{ kind: 'focal', label: 'Moving right' }, { kind: 'store', label: 'Component' }])
}
