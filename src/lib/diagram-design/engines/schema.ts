/**
 * Schema engine — tables, entities and classes with typed members.
 *
 * Serves: ER / data model, database schema, UML class, deployment hosts.
 *
 * A table is a header band plus column rows separated by hairlines; keys are
 * marked PK / FK in mono; relationships are orthogonal elbows labelled 1:N.
 */

import { measureText, snap, snapUp } from '../geometry'
import { RADIUS, STROKE, TYPE_RAMP, alpha, nodeTreatment } from '../tokens'
import type { Rect } from '../geometry'
import type { ClassSpec, DiagramSpec, TableSpec } from '../spec'
import { SceneBuilder } from '../scene'

const ROW_H = 20
const HEADER_H = 36

function tableSize(t: TableSpec | ClassSpec, kind: 'table' | 'class') {
  const rows =
    kind === 'table'
      ? (t as TableSpec).columns.map((c) => `${c.name} ${c.type}`)
      : [...(t as ClassSpec).attributes, ...(t as ClassSpec).operations]
  const nameW = measureText(t.name, { family: 'sans', size: TYPE_RAMP.nodeName.size })
  const rowW = Math.max(
    0,
    ...rows.map((r) => measureText(r, { family: 'mono', size: TYPE_RAMP.chartLabel.size }) + 52),
  )
  const w = snapUp(Math.max(160, nameW + 32, rowW))
  const h = snapUp(HEADER_H + rows.length * ROW_H + 12)
  return { w, h, rows }
}

export function renderSchema(spec: DiagramSpec, b: SceneBuilder, kind: 'table' | 'class'): void {
  const items: (TableSpec | ClassSpec)[] = kind === 'table' ? spec.tables ?? [] : spec.classes ?? []
  const links = spec.links ?? []
  const gapX = 48
  const gapY = 40
  const maxPerRow = items.length > 3 ? 3 : items.length || 1
  const sizes = items.map((t) => tableSize(t, kind))
  const rowW = Math.max(...sizes.map((s) => s.w)) * Math.min(maxPerRow, items.length) +
    gapX * (Math.min(maxPerRow, items.length) - 1)

  const rects = new Map<string, Rect>()
  const startX = snap(Math.max(40, (b.width - rowW) / 2))
  let x = startX
  let y = 48
  let col = 0
  const rowH = Math.max(...sizes.map((s) => s.h))
  items.forEach((t, i) => {
    const s = sizes[i]
    const r: Rect = { x: snap(x), y: snap(y), w: s.w, h: s.h }
    rects.set(t.id, r)
    x += s.w + gapX
    col++
    if (col >= maxPerRow) {
      col = 0
      x = startX
      y += rowH + gapY
    }
  })

  // Relationships first so the boxes paint over them.
  for (const l of links) {
    const a = rects.get(l.from)
    const c = rects.get(l.to)
    if (!a || !c) continue
    const horizontal = Math.abs(c.x - a.x) > Math.abs(c.y - a.y)
    b.link(a, c, {
      role: l.role ?? 'default',
      label: l.label,
      dashed: l.dashed ?? false,
      fromSide: horizontal ? (c.x > a.x ? 'right' : 'left') : c.y > a.y ? 'bottom' : 'top',
      toSide: horizontal ? (c.x > a.x ? 'left' : 'right') : c.y > a.y ? 'top' : 'bottom',
      labelOrientation: horizontal ? 'h' : 'v',
    })
  }

  for (const t of items) {
    const r = rects.get(t.id)
    if (!r) continue
    const treat = nodeTreatment(t.kind ?? 'backend', b.t)
    b.mask({ x: r.x, y: r.y, w: r.w, h: r.h }, { rx: RADIUS.md, layer: 40 })
    b.rect(r, { fill: treat.fill, stroke: treat.stroke, rx: RADIUS.md, width: treat.strokeWidth })
    // Header band
    b.line(r.x, r.y + HEADER_H, r.x + r.w, r.y + HEADER_H, { stroke: b.t.rule, width: STROKE.thin, layer: 42 })
    b.text(r.x + 12, r.y + 23, t.name, { role: 'nodeName', fill: b.t.ink, layer: 45 })
    const stereotype = kind === 'class' ? (t as ClassSpec).stereotype : (t as TableSpec).sublabel
    if (stereotype) {
      b.text(r.x + r.w - 12, r.y + 22, stereotype.toUpperCase(), {
        role: 'eyebrow',
        fill: b.t.soft,
        anchor: 'end',
        layer: 45,
      })
    }

    // Rows
    const rows =
      kind === 'table'
        ? (t as TableSpec).columns.map((c) => ({
            text: `${c.name}  ${c.type}`,
            mark: c.pk ? 'PK' : c.fk ? 'FK' : '',
          }))
        : [
            ...(t as ClassSpec).attributes.map((a) => ({ text: a, mark: '' })),
            ...(t as ClassSpec).operations.map((o) => ({ text: o, mark: '' })),
          ]

    rows.forEach((row, ri) => {
      const ry = r.y + HEADER_H + (ri + 1) * ROW_H
      if (kind === 'class' && ri === (t as ClassSpec).attributes.length) {
        b.line(r.x, ry - ROW_H / 2, r.x + r.w, ry - ROW_H / 2, { stroke: b.t.rule, width: STROKE.thin, layer: 42 })
      }
      if (ri < rows.length - 1) {
        b.line(r.x + 12, ry, r.x + r.w - 12, ry, { stroke: alpha(b.t.ink, 0.06), width: STROKE.thin, layer: 42 })
      }
      b.text(r.x + 12, ry - 6, row.text, {
        role: 'chartLabel',
        fill: row.mark ? b.t.ink : b.t.muted,
        layer: 45,
      })
      if (row.mark) {
        b.text(r.x + r.w - 12, ry - 6, row.mark, {
          role: 'eyebrow',
          fill: b.t.accent,
          anchor: 'end',
          layer: 45,
        })
      }
    })
  }

  b.legendFromSpec(
    kind === 'table'
      ? [
          { kind: 'focal', label: 'Foreign key' },
          { kind: 'store', label: 'Table' },
        ]
      : [
          { kind: 'focal', label: 'Focal class' },
          { kind: 'store', label: 'Class' },
        ],
  )
}
