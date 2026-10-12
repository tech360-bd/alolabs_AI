/**
 * Sequence engine — time-ordered messages between actors.
 *
 * Lifelines are dashed hairlines; a message is a horizontal arrow between two
 * lifelines with its label floated above the stroke; at most one combined
 * fragment (opt / loop / alt) frames a run of messages.
 */

import { measureText, snap, snapUp } from '../geometry'
import { RADIUS, STROKE, TYPE_RAMP, alpha, linkStroke } from '../tokens'
import { measureNode } from './shared'
import type { DiagramSpec, LinkRole } from '../spec'
import { SceneBuilder } from '../scene'

export function renderSequence(spec: DiagramSpec, b: SceneBuilder): void {
  const actors = spec.nodes ?? []
  const messages = spec.links ?? []
  const top = 48
  const headerH = 52
  const msgStart = top + headerH + 48
  const msgGap = snap((b.height - msgStart - 88) / Math.max(messages.length, 1))

  // Lifeline columns, fanned across the width on the grid.
  const colWidth = snap((b.width - 96) / Math.max(actors.length, 1))
  const columns = actors.map((a, i) => {
    const size = measureNode(a, { minW: 112, minH: headerH })
    const cx = snap(48 + colWidth * i + colWidth / 2)
    const rect = { x: snap(cx - Math.max(size.w, 128) / 2), y: top, w: snapUp(Math.max(size.w, 128)), h: headerH }
    return { actor: a, cx, rect }
  })
  const byId = new Map(columns.map((c) => [c.actor.id, c]))

  const lastY = msgStart + messages.length * msgGap
  for (const col of columns) {
    b.node(col.rect, { id: col.actor.id, name: col.actor.name, sublabel: col.actor.sublabel, tag: col.actor.tag, kind: col.actor.kind })
    b.line(col.cx, col.rect.y + col.rect.h, col.cx, lastY + 24, {
      stroke: b.t.ruleSolid,
      width: STROKE.thin,
      dash: '4,4',
      layer: 10,
    })
  }

  // Optional fragment frame around a run of messages.
  if (spec.groups?.length) {
    const frag = spec.groups[0]
    const count = Math.max(2, Math.min(messages.length, 3))
    const yTop = snap(msgStart - 28)
    const yBottom = snap(msgStart + (count - 0.2) * msgGap)
    const x0 = 40
    const x1 = b.width - 40
    b.rect({ x: x0, y: yTop, w: x1 - x0, h: yBottom - yTop }, {
      fill: 'transparent',
      stroke: alpha(b.t.ink, 0.25),
      width: STROKE.thin,
      rx: RADIUS.sm,
      layer: 12,
    })
    const label = (frag.label ?? 'OPT').toUpperCase()
    const w = snapUp(measureText(label, { family: 'mono', size: TYPE_RAMP.tag.size, tracking: 0.08 })) + 16
    b.rect({ x: x0, y: yTop, w, h: 16 }, { fill: b.t.paper2, stroke: alpha(b.t.ink, 0.25), width: STROKE.thin, rx: 2, layer: 13 })
    b.text(x0 + w / 2, yTop + 11, label, { role: 'tag', fill: b.t.ink, anchor: 'middle', layer: 13 })
  }

  messages.forEach((m, i) => {
    const a = byId.get(m.from)
    const c = byId.get(m.to)
    if (!a || !c) return
    const y = snap(msgStart + i * msgGap)
    const selfMessage = a === c
    const { stroke } = linkStroke(m.role ?? 'default', b.t)
    const dash = m.dashed ? '5,4' : undefined

    if (selfMessage) {
      const x = a.cx
      b.path(`M ${x} ${y} L ${x + 48} ${y} L ${x + 48} ${y + 24} L ${x} ${y + 24}`, {
        stroke,
        width: STROKE.default,
        dash,
        layer: 20,
        marker: (m.role ?? 'default') as LinkRole,
      })
    } else {
      const dir = c.cx > a.cx ? 1 : -1
      b.path(`M ${a.cx} ${y} L ${c.cx - dir * 6} ${y}`, {
        stroke,
        width: STROKE.default,
        dash,
        layer: 20,
        marker: (m.role ?? 'default') as LinkRole,
      })
    }

    if (m.label) {
      const text = m.label.slice(0, 14).toUpperCase()
      const w = snapUp(measureText(text, { family: 'mono', size: TYPE_RAMP.arrowLabel.size, tracking: 0.06 })) + 10
      const midX = snap((a.cx + c.cx) / 2)
      b.mask({ x: snap(midX - w / 2), y: snap(y - 20), w, h: 12 }, { rx: RADIUS.sm, layer: 30 })
      b.text(midX, y - 11, text, {
        role: 'arrowLabel',
        fill: b.t.soft,
        anchor: 'middle',
        layer: 31,
      })
    }
  })

  b.legendFromSpec([
    { kind: 'arrow', label: 'Message' },
    { kind: 'arrow-accent', label: 'Focal path' },
    { kind: 'dash', label: 'Async / return' },
  ])
  void msgGap
}
