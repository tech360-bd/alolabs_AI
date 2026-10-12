/**
 * Radial engine — circular and relational layouts.
 *
 * Serves: quadrant, radar, polar, loop/flywheel, Venn, fishbone.
 *
 * Shared rule: the focal element is the 1–2 things the reader should look at
 * first; every other mark is ink / muted / soft.
 */

import { measureText, snap, snapUp } from '../geometry'
import { RADIUS, STROKE, TYPE_RAMP, alpha, nodeTreatment } from '../tokens'
import { seriesColor } from './shared'
import type { Rect } from '../geometry'
import type { DiagramSpec } from '../spec'
import { SceneBuilder } from '../scene'

// ─── Quadrant ────────────────────────────────────────────────────────────────

export function renderQuadrant(spec: DiagramSpec, b: SceneBuilder): void {
  const q = spec.quadrant
  const pad = 72
  const size = Math.min(b.width, b.height) - pad * 2
  const x0 = snap((b.width - size) / 2)
  const y0 = snap((b.height - size) / 2)
  const plot: Rect = { x: x0, y: y0, w: snap(size), h: snap(size) }
  const midX = snap(x0 + size / 2)
  const midY = snap(y0 + size / 2)

  const quadrantLabels = q?.quadrants
  const labels: [string, number, number][] = quadrantLabels
    ? [
        [quadrantLabels.tl, x0 + 16, y0 + 24],
        [quadrantLabels.tr, x0 + size - 16, y0 + 24],
        [quadrantLabels.bl, x0 + 16, y0 + size - 16],
        [quadrantLabels.br, x0 + size - 16, y0 + size - 16],
      ]
    : []

  b.rect(plot, { stroke: b.t.ruleSolid, width: STROKE.thin, rx: RADIUS.lg, layer: 10 })
  b.line(midX, y0, midX, y0 + size, { stroke: b.t.rule, width: STROKE.default, layer: 10 })
  b.line(x0, midY, x0 + size, midY, { stroke: b.t.rule, width: STROKE.default, layer: 10 })

  labels.forEach(([text, x, y], i) => {
    b.text(x, y, text.toUpperCase(), {
      role: 'eyebrow',
      fill: b.t.soft,
      anchor: i === 0 || i === 2 ? 'start' : 'end',
      layer: 13,
    })
  })

  if (q) {
    b.axisLabel(midX, y0 + size + 28, `${q.xAxis.low}  →  ${q.xAxis.high}`, 'middle')
    b.text(x0 - 16, midY, q.yAxis.low.toUpperCase(), { role: 'axis', fill: b.t.soft, anchor: 'end', layer: 13 })
    b.text(x0 - 16, midY - 80, q.yAxis.high.toUpperCase(), { role: 'axis', fill: b.t.soft, anchor: 'end', layer: 13 })

    for (const item of q.items) {
      const x = snap(x0 + (item.x / 100) * size)
      const y = snap(y0 + size - (item.y / 100) * size)
      const treat = nodeTreatment(item.focal ? 'focal' : 'store', b.t)
      b.circle(x, y, item.focal ? 6 : 4, {
        fill: item.focal ? b.t.accent : b.t.muted,
        stroke: b.t.paper,
        width: 2,
        layer: 41,
      })
      b.circle(x, y, item.focal ? 3 : 2, { fill: b.t.paper, layer: 42 })
      const w = snapUp(measureText(item.label, { family: 'mono', size: TYPE_RAMP.chartValue.size })) + 12
      b.mask({ x: snap(x + 8), y: snap(y - 16), w, h: 14 }, { rx: RADIUS.sm, layer: 43 })
      b.text(x + 14, y - 5, item.label, {
        role: 'chartValue',
        fill: item.focal ? b.t.ink : b.t.muted,
        layer: 44,
      })
      void treat
    }
  }

  b.legendFromSpec([{ kind: 'focal', label: 'Priority' }, { kind: 'store', label: 'Candidate' }])
}

// ─── Radar ───────────────────────────────────────────────────────────────────

export function renderRadar(spec: DiagramSpec, b: SceneBuilder): void {
  const axes = spec.categories ?? []
  const series = spec.series ?? []
  const cx = snap(b.width / 2)
  const cy = snap(b.height / 2 - 8)
  const radius = Math.min(b.width, b.height) / 2 - 96
  const n = Math.max(axes.length, 3)
  const max = Math.max(...series.flatMap((s) => s.values), 1)

  const point = (i: number, v: number) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2
    const r = (v / max) * radius
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r }
  }

  // Web rings at quarters.
  for (let ring = 1; ring <= 4; ring++) {
    const pts = Array.from({ length: n }, (_, i) => point(i, (max * ring) / 4))
    b.polygon(
      pts.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' '),
      { fill: 'transparent', stroke: alpha(b.t.ink, 0.1), width: STROKE.thin, layer: 10 },
    )
  }
  for (let i = 0; i < n; i++) {
    const p = point(i, max)
    b.line(cx, cy, p.x, p.y, { stroke: alpha(b.t.ink, 0.1), width: STROKE.thin, layer: 10 })
    const label = point(i, max * 1.18)
    b.text(label.x, label.y + 3, axes[i] ?? '', {
      role: 'chartLabel',
      fill: b.t.ink,
      anchor: Math.abs(label.x - cx) < 12 ? 'middle' : label.x > cx ? 'start' : 'end',
      layer: 13,
    })
  }

  const focalIndex = series.findIndex((s) => s.focal)
  series.forEach((s, si) => {
    const isFocal = s.focal ?? si === focalIndex
    const color = seriesColor(si, isFocal, b.theme, b.t)
    const pts = s.values.map((v, i) => point(i, v))
    b.polygon(pts.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' '), {
      fill: alpha(color, isFocal ? 0.18 : 0.12),
      stroke: color,
      width: isFocal ? STROKE.strong : STROKE.default,
      layer: 20,
    })
    pts.forEach((p) => b.circle(p.x, p.y, isFocal ? 3.5 : 2.5, { fill: color, layer: 41 }))
  })

  b.legendFromSpec(series.map((s) => ({ kind: s.focal ? 'focal' : 'store', label: s.label })))
}

// ─── Polar ───────────────────────────────────────────────────────────────────

export function renderPolar(spec: DiagramSpec, b: SceneBuilder): void {
  const categories = spec.categories ?? []
  const series = spec.series ?? []
  const values = series[0]?.values ?? []
  const cx = snap(b.width / 2)
  const cy = snap(b.height / 2)
  const radius = Math.min(b.width, b.height) / 2 - 80
  const n = Math.max(categories.length, 1)
  const max = Math.max(...values, 1)
  const focalIndex = values.indexOf(Math.max(...values))

  for (let ring = 1; ring <= 3; ring++) {
    b.circle(cx, cy, snap((radius * ring) / 3), { stroke: alpha(b.t.ink, 0.1), width: STROKE.thin, layer: 10 })
  }

  categories.forEach((cat, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2
    const v = values[i] ?? 0
    const r = (v / max) * radius
    const x = cx + Math.cos(angle) * r
    const y = cy + Math.sin(angle) * r
    const isFocal = i === focalIndex
    b.line(cx, cy, cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, {
      stroke: alpha(b.t.ink, 0.08),
      width: STROKE.thin,
      layer: 10,
    })
    b.line(cx, cy, x, y, {
      stroke: isFocal ? b.t.accent : b.t.muted,
      width: isFocal ? STROKE.strong : STROKE.default,
      layer: 20,
    })
    b.circle(x, y, isFocal ? 5 : 3.5, {
      fill: isFocal ? b.t.accent : b.t.muted,
      stroke: b.t.paper,
      width: 2,
      layer: 41,
    })
    const lx = cx + Math.cos(angle) * (radius + 28)
    const ly = cy + Math.sin(angle) * (radius + 28)
    b.text(lx, ly + 3, cat, {
      role: 'chartLabel',
      fill: b.t.ink,
      anchor: Math.abs(lx - cx) < 16 ? 'middle' : lx > cx ? 'start' : 'end',
      layer: 13,
    })
    b.text(lx, ly + 15, String(v), {
      role: 'chartValue',
      fill: isFocal ? b.t.accent : b.t.soft,
      anchor: Math.abs(lx - cx) < 16 ? 'middle' : lx > cx ? 'start' : 'end',
      layer: 13,
    })
  })

  b.legendFromSpec([{ kind: 'focal', label: 'Peak' }, { kind: 'store', label: 'Category' }])
}

// ─── Loop / flywheel ─────────────────────────────────────────────────────────

export function renderLoop(spec: DiagramSpec, b: SceneBuilder): void {
  const loop = spec.loop
  const stations = loop?.stations ?? []
  const cx = snap(b.width / 2)
  const cy = snap(b.height / 2)
  const hubR = 76
  const orbit = Math.min(b.width, b.height) / 2 - 120
  const n = Math.max(stations.length, 1)
  const nodeW = 128
  const nodeH = 52

  // Hub
  b.circle(cx, cy, hubR, { fill: alpha(b.t.ink, 0.05), stroke: b.t.ink, width: STROKE.default, layer: 40 })
  b.text(cx, cy - 2, loop?.hub.name ?? 'Hub', { role: 'nodeName', fill: b.t.ink, anchor: 'middle', layer: 45 })
  if (loop?.hub.sublabel) {
    b.text(cx, cy + 14, loop.hub.sublabel, { role: 'sublabel', fill: b.t.muted, anchor: 'middle', layer: 45 })
  }

  const rects: Rect[] = []
  stations.forEach((s, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2
    const x = cx + Math.cos(angle) * (orbit + hubR / 2)
    const y = cy + Math.sin(angle) * (orbit + hubR / 2)
    const r: Rect = { x: snap(x - nodeW / 2), y: snap(y - nodeH / 2), w: nodeW, h: nodeH }
    rects.push(r)
    b.node(r, { id: s.id, name: s.name, sublabel: s.sublabel, kind: s.kind }, { layer: 40 })
  })

  // Arc connectors between consecutive stations — the flywheel grammar.
  for (let i = 0; i < n; i++) {
    const from = rects[i]
    const to = rects[(i + 1) % n]
    const a1 = (Math.PI * 2 * i) / n - Math.PI / 2
    const a2 = (Math.PI * 2 * (i + 1)) / n - Math.PI / 2
    const r = orbit + hubR / 2 + 44
    const x1 = cx + Math.cos(a1) * r
    const y1 = cy + Math.sin(a1) * r
    const x2 = cx + Math.cos(a2) * r
    const y2 = cy + Math.sin(a2) * r
    const sweep = 1
    b.path(`M ${snap(x1)} ${snap(y1)} A ${snap(r)} ${snap(r)} 0 0 ${sweep} ${snap(x2)} ${snap(y2)}`, {
      stroke: i === 0 ? b.t.accent : b.t.muted,
      width: i === 0 ? STROKE.strong : STROKE.default,
      layer: 20,
      marker: i === 0 ? 'accent' : 'default',
    })
    void from
    void to
  }

  b.legendFromSpec([{ kind: 'focal', label: 'Reinforcing step' }, { kind: 'store', label: 'Station' }])
}

// ─── Venn ────────────────────────────────────────────────────────────────────

export function renderVenn(spec: DiagramSpec, b: SceneBuilder): void {
  const sets = spec.venn?.sets ?? []
  const cx = snap(b.width / 2)
  const cy = snap(b.height / 2)
  const r = 116
  const isDark = b.theme === 'dark'
  const palette = isDark
    ? ['rgba(156,175,143,0.20)', 'rgba(130,160,192,0.20)', 'rgba(211,173,122,0.20)']
    : ['rgba(124,143,111,0.18)', 'rgba(94,122,155,0.18)', 'rgba(184,145,90,0.18)']

  const positions =
    sets.length === 3
      ? [
          { x: cx, y: cy - 56 },
          { x: cx - 64, y: cy + 44 },
          { x: cx + 64, y: cy + 44 },
        ]
      : [
          { x: cx - 56, y: cy },
          { x: cx + 56, y: cy },
        ]

  sets.forEach((s, i) => {
    const p = positions[i] ?? { x: cx, y: cy }
    b.circle(p.x, p.y, r, {
      fill: palette[i % palette.length],
      stroke: i === 0 ? b.t.accent : b.t.muted,
      width: i === 0 ? STROKE.strong : STROKE.default,
      layer: 12,
      opacity: 0.9,
    })
    const lx = p.x + (i === 0 ? 0 : i === 1 ? -0.8 : 0.8) * r * 0.92
    const ly = p.y + (i === 0 ? -1 : 0.72) * r * 0.92
    b.text(lx, ly, s.label, {
      role: 'nodeName',
      fill: b.t.ink,
      anchor: i === 0 ? 'middle' : i === 1 ? 'end' : 'start',
      layer: 45,
    })
    if (s.sublabel) {
      b.text(lx, ly + 16, s.sublabel, {
        role: 'sublabel',
        fill: b.t.muted,
        anchor: i === 0 ? 'middle' : i === 1 ? 'end' : 'start',
        layer: 45,
      })
    }
  })

  for (const inter of spec.venn?.intersections ?? []) {
    const idx = inter.ids.map((id) => sets.findIndex((s) => s.id === id))
    const pts = idx.map((i) => positions[i] ?? { x: cx, y: cy })
    const x = pts.reduce((a, p) => a + p.x, 0) / pts.length
    const y = pts.reduce((a, p) => a + p.y, 0) / pts.length
    const w = snapUp(measureText(inter.label, { family: 'mono', size: TYPE_RAMP.chartValue.size })) + 12
    b.mask({ x: snap(x - w / 2), y: snap(y - 9), w, h: 16 }, { rx: RADIUS.sm, layer: 43 })
    b.text(x, y + 3, inter.label, { role: 'chartValue', fill: b.t.ink, anchor: 'middle', layer: 44 })
  }

  b.legendFromSpec(sets.map((s, i) => ({ kind: i === 0 ? 'focal' : 'store', label: s.label })))
}

// ─── Fishbone ────────────────────────────────────────────────────────────────

export function renderFishbone(spec: DiagramSpec, b: SceneBuilder): void {
  const fb = spec.fishbone
  const bones = fb?.bones ?? []
  const spineY = snap(b.height / 2)
  const headW = 168
  const spineX0 = 64
  const spineX1 = b.width - headW - 48

  // Effect head
  const head: Rect = { x: snap(spineX1 + 24), y: snap(spineY - 40), w: headW, h: 80 }
  b.node(head, { name: fb?.effect ?? 'Effect', kind: 'focal' })
  b.line(spineX0, spineY, head.x, spineY, { stroke: b.t.ink, width: STROKE.strong, layer: 20, marker: 'default' })

  const top = bones.filter((_, i) => i % 2 === 0)
  const bottom = bones.filter((_, i) => i % 2 === 1)
  const maxBoneW = measureText('WWWWWWWWWWWW', { family: 'mono', size: TYPE_RAMP.chartValue.size })

  const place = (list: typeof bones, dir: -1 | 1) => {
    const span = spineX1 - spineX0 - 24
    const step = span / Math.max(list.length, 1)
    list.forEach((bone, i) => {
      const x = snap(spineX0 + 32 + i * step + step / 2)
      const tipY = snap(spineY + dir * (96 + i * 12))
      b.line(x, spineY, x - 32, tipY, { stroke: b.t.muted, width: STROKE.default, layer: 20 })
      b.text(x - 40, tipY + (dir < 0 ? -8 : 16), bone.label.toUpperCase(), {
        role: 'eyebrow',
        fill: b.t.ink,
        anchor: 'end',
        layer: 45,
      })
      bone.causes.forEach((cause, ci) => {
        const cy = snap(tipY + dir * (28 + ci * 20))
        const cw = Math.min(maxBoneW + 24, snapUp(measureText(cause, { family: 'mono', size: TYPE_RAMP.chartValue.size })) + 16)
        b.line(x - 32, cy, x - 32 + cw, cy, { stroke: alpha(b.t.ink, 0.3), width: STROKE.thin, layer: 20 })
        b.text(x - 32 + cw / 2, cy - 6, cause, { role: 'chartValue', fill: b.t.muted, anchor: 'middle', layer: 45 })
      })
    })
  }
  place(top, -1)
  place(bottom, 1)

  b.legendFromSpec([{ kind: 'focal', label: 'Observed effect' }, { kind: 'store', label: 'Cause group' }])
}
