/**
 * Special engines — axonometric projections and Sankey ribbons.
 *
 * Serves: exploded axonometric, axonometric plan, Sankey.
 *
 * Axonometric types share one 2:1 dimetric projector so every coordinate in a
 * figure comes from the same function.
 */

import { measureText, snap, snapUp } from '../geometry'
import { RADIUS, STROKE, TYPE_RAMP, alpha, nodeTreatment } from '../tokens'
import type { Rect } from '../geometry'
import type { DiagramSpec } from '../spec'
import { SceneBuilder } from '../scene'

/** 2:1 dimetric projection — one function for every axonometric type. */
export function project(x: number, y: number, z = 0, origin = { x: 0, y: 0 }) {
  return { x: origin.x + (x - y), y: origin.y + (x + y) * 0.5 - z }
}

// ─── Exploded axonometric ────────────────────────────────────────────────────

export function renderExploded(spec: DiagramSpec, b: SceneBuilder): void {
  const parts = spec.parts ?? []
  const slab = 168
  const lift = 44
  const origin = { x: snap(b.width / 2), y: snap(b.height - 96) }

  parts.forEach((part, i) => {
    const z = i * lift
    const o = { x: origin.x, y: origin.y - z }
    const corners = {
      a: project(-slab / 2, -slab / 2, 0, o),
      b: project(slab / 2, -slab / 2, 0, o),
      c: project(slab / 2, slab / 2, 0, o),
      d: project(-slab / 2, slab / 2, 0, o),
    }
    const depth = 12
    const treat = nodeTreatment(part.kind ?? (i === parts.length - 1 ? 'focal' : 'store'), b.t)

    // Side faces first, then the top plate.
    const top = `${corners.a.x},${corners.a.y} ${corners.b.x},${corners.b.y} ${corners.c.x},${corners.c.y} ${corners.d.x},${corners.d.y}`
    const leftFace = `${corners.d.x},${corners.d.y} ${corners.c.x},${corners.c.y} ${corners.c.x},${corners.c.y + depth} ${corners.d.x},${corners.d.y + depth}`
    const rightFace = `${corners.a.x},${corners.a.y} ${corners.d.x},${corners.d.y} ${corners.d.x},${corners.d.y + depth} ${corners.a.x},${corners.a.y + depth}`
    b.polygon(leftFace, { fill: alpha(b.t.ink, 0.06), stroke: alpha(b.t.ink, 0.18), width: STROKE.thin, layer: 12 })
    b.polygon(rightFace, { fill: alpha(b.t.ink, 0.1), stroke: alpha(b.t.ink, 0.18), width: STROKE.thin, layer: 12 })
    b.polygon(top, { fill: treat.fill, stroke: treat.stroke, width: treat.strokeWidth, layer: 20 })

    // Label beside the plate with a leader.
    const labelX = snap(corners.b.x + 16)
    const labelY = snap((corners.a.y + corners.c.y) / 2 + depth / 2)
    b.line(corners.b.x, labelY, labelX, labelY, { stroke: alpha(b.t.ink, 0.25), width: STROKE.thin, layer: 21 })
    b.text(labelX + 8, labelY + 4, part.name, {
      role: 'chartLabel',
      fill: b.t.ink,
      layer: 45,
    })
    if (part.sublabel) {
      b.text(labelX + 8, labelY + 18, part.sublabel, { role: 'sublabel', fill: b.t.soft, layer: 45 })
    }
  })

  // Assembly axis (dashed) through the stack.
  const axisTop = project(0, 0, (parts.length - 1) * lift + 28, origin)
  const axisBottom = project(0, 0, -28, origin)
  b.line(axisTop.x, axisTop.y, axisBottom.x, axisBottom.y, {
    stroke: alpha(b.t.ink, 0.2),
    width: STROKE.thin,
    dash: '4,4',
    layer: 10,
  })
  b.axisLabel(axisBottom.x, axisBottom.y + 28, 'ASSEMBLY ORDER ↑', 'middle')

  b.legendFromSpec([{ kind: 'focal', label: 'Focal part' }, { kind: 'store', label: 'Part' }])
}

// ─── Axonometric plan ────────────────────────────────────────────────────────

export function renderAxonometricPlan(spec: DiagramSpec, b: SceneBuilder): void {
  const rooms = spec.rooms ?? []
  const cell = 76
  const wall = 28
  const cols = Math.max(3, ...rooms.map((r) => r.col + (r.spanCol ?? 1)))
  const rows = Math.max(2, ...rooms.map((r) => r.row + (r.spanRow ?? 1)))
  const plateW = cols * cell
  const plateH = rows * cell
  const origin = { x: snap(b.width / 2), y: snap(48 + plateH * 0.5) }
  void plateW
  void plateH

  const world = (gx: number, gy: number, z = 0) => project(gx * cell, gy * cell, z, origin)

  for (const room of rooms) {
    const x0 = room.col
    const y0 = room.row
    const x1 = room.col + (room.spanCol ?? 1)
    const y1 = room.row + (room.spanRow ?? 1)
    const h = room.height ?? wall
    const treat = nodeTreatment(room.kind ?? 'store', b.t)

    const p1 = world(x0, y0)
    const p2 = world(x1, y0)
    const p3 = world(x1, y1)
    const p4 = world(x0, y1)
    const topFace = `${p1.x},${p1.y - h} ${p2.x},${p2.y - h} ${p3.x},${p3.y - h} ${p4.x},${p4.y - h}`
    const frontFace = `${p4.x},${p4.y - h} ${p3.x},${p3.y - h} ${p3.x},${p3.y} ${p4.x},${p4.y}`
    const sideFace = `${p2.x},${p2.y - h} ${p3.x},${p3.y - h} ${p3.x},${p3.y} ${p2.x},${p2.y}`

    b.polygon(frontFace, { fill: alpha(b.t.ink, 0.08), stroke: alpha(b.t.ink, 0.2), width: STROKE.thin, layer: 12 })
    b.polygon(sideFace, { fill: alpha(b.t.ink, 0.12), stroke: alpha(b.t.ink, 0.2), width: STROKE.thin, layer: 12 })
    b.polygon(topFace, { fill: treat.fill, stroke: treat.stroke, width: treat.strokeWidth, layer: 20 })

    const centre = world((x0 + x1) / 2, (y0 + y1) / 2, h)
    b.text(snap(centre.x), snap(centre.y) + 4, room.name, {
      role: 'chartLabel',
      fill: b.t.ink,
      anchor: 'middle',
      layer: 45,
    })
    if (room.sublabel) {
      b.text(snap(centre.x), snap(centre.y) + 18, room.sublabel, {
        role: 'sublabel',
        fill: b.t.soft,
        anchor: 'middle',
        layer: 45,
      })
    }
  }

  b.axisLabel(b.width - 40, b.height - 24, 'NORTH-EAST PLATE', 'end')
  b.legendFromSpec([{ kind: 'focal', label: 'Focal room' }, { kind: 'store', label: 'Room' }])
}

// ─── Sankey ──────────────────────────────────────────────────────────────────

export function renderSankey(spec: DiagramSpec, b: SceneBuilder): void {
  const data = spec.sankey
  const stages = data?.stages ?? []
  const flows = data?.flows ?? []
  const nodeIds = [...new Set(flows.flatMap((f) => [f.from, f.to]))]
  const nodes = spec.nodes ?? []

  const top = 72
  const bottom = b.height - 80
  const usable = bottom - top
  const totalValue = flows
    .filter((f) => !stages.length || f.from === nodeIds.find((n) => !flows.some((x) => x.to === n)))
    .reduce((a, f) => a + f.value, 0)
  const inflow = Math.max(
    ...nodeIds.map((id) => flows.filter((f) => f.to === id).reduce((a, f) => a + f.value, 0)),
    totalValue,
    1,
  )

  const stageX = (stageIndex: number) =>
    snap(64 + (stageIndex * (b.width - 128)) / Math.max(stages.length - 1, 1))

  // Assign each node to a stage by topology: sources first, sinks last.
  const stageOf = new Map<string, number>()
  for (const id of nodeIds) {
    const isSource = !flows.some((f) => f.to === id)
    const isSink = !flows.some((f) => f.from === id)
    stageOf.set(id, isSource ? 0 : isSink ? Math.max(stages.length - 1, 1) : 1)
  }
  if (stages.length === 2) for (const [id, s] of stageOf) stageOf.set(id, s === 2 ? 1 : s)

  // Vertical placement so ribbons stack without crossing.
  const spacing = 16
  const perStage = new Map<number, string[]>()
  for (const id of nodeIds) {
    const s = stageOf.get(id) ?? 0
    if (!perStage.has(s)) perStage.set(s, [])
    perStage.get(s)!.push(id)
  }

  const geo = new Map<string, { y: number; h: number }>()
  for (const [s, ids] of perStage) {
    const heights = ids.map((id) => {
      const through = Math.max(
        flows.filter((f) => f.from === id).reduce((a, f) => a + f.value, 0),
        flows.filter((f) => f.to === id).reduce((a, f) => a + f.value, 0),
      )
      return Math.max(snap((through / inflow) * usable) - spacing, 16)
    })
    const blockH = heights.reduce((a, h) => a + h, 0) + spacing * (ids.length - 1)
    let y = snap(top + Math.max(0, (usable - blockH) / 2))
    ids.forEach((id, i) => {
      geo.set(id, { y, h: heights[i] })
      y += heights[i] + spacing
    })
    void s
  }

  const cursorOut = new Map<string, number>()
  const cursorIn = new Map<string, number>()

  for (const f of flows) {
    const from = geo.get(f.from)
    const to = geo.get(f.to)
    if (!from || !to) continue
    const sFrom = stageOf.get(f.from) ?? 0
    const sTo = stageOf.get(f.to) ?? 0
    const x0 = stageX(sFrom) + 8
    const x1 = stageX(sTo) - 8
    const hScale = usable / inflow
    const h = Math.max(snap(f.value * hScale) - 8, 8)
    const y0 = (cursorOut.get(f.from) ?? from.y) 
    const y1 = (cursorIn.get(f.to) ?? to.y)
    cursorOut.set(f.from, y0 + h + 8)
    cursorIn.set(f.to, y1 + h + 8)

    const cx = (x0 + x1) / 2
    const d = `M ${x0} ${snap(y0)} C ${cx} ${snap(y0)} ${cx} ${snap(y1)} ${x1} ${snap(y1)}
               L ${x1} ${snap(y1 + h)} C ${cx} ${snap(y1 + h)} ${cx} ${snap(y0 + h)} ${x0} ${snap(y0 + h)} Z`
    b.path(d, {
      fill: alpha(f.focal ? b.t.accent : b.t.muted, f.focal ? 0.28 : 0.18),
      stroke: f.focal ? b.t.accent : alpha(b.t.ink, 0.2),
      width: STROKE.thin,
      layer: 12,
    })
  }

  for (const id of nodeIds) {
    const g = geo.get(id)
    if (!g) continue
    const s = stageOf.get(id) ?? 0
    const x = stageX(s)
    const node = nodes.find((n) => n.id === id)
    const w = 8
    b.rect({ x: snap(x - w / 2), y: g.y, w, h: g.h }, {
      fill: alpha(b.t.ink, 0.5),
      stroke: b.t.ink,
      width: STROKE.thin,
      rx: 2,
      layer: 20,
    })
    const labelX = snap(x - w / 2 - 12)
    b.text(labelX, g.y + g.h / 2 + 3, node?.name ?? id, {
      role: 'chartLabel',
      fill: b.t.ink,
      anchor: 'end',
      layer: 45,
    })
    if (node?.sublabel) {
      b.text(labelX, g.y + g.h / 2 + 17, node.sublabel, { role: 'sublabel', fill: b.t.soft, anchor: 'end', layer: 45 })
    }
  }

  stages.forEach((stage, i) => b.axisLabel(stageX(i), 32, stage, 'middle'))
  if (data?.units) b.axisLabel(64, b.height - 32, `UNITS: ${data.units}`, 'start')

  b.legendFromSpec([{ kind: 'focal', label: 'Focal flow' }, { kind: 'store', label: 'Flow' }])
}

export function specialText(spec: DiagramSpec): string {
  return `${spec.title} ${spec.desc}`
}

export { measureText, snapUp, RADIUS, TYPE_RAMP }
