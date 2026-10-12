/**
 * Scene builder — the primitives every engine composes with.
 *
 * Encodes the markup contract from the design system: an opaque paper mask
 * under every node, the type tag as a rectangle (rx=2, never a pill), names in
 * the sans role, technical sublabels in mono, and arrow labels floated off
 * their stroke with a visible gap.
 */

import {
  alpha,
  CONNECTOR,
  GRID,
  RADIUS,
  STROKE,
  TYPE_RAMP,
  nodeTreatment,
  linkStroke,
  type NodeKind,
  type LinkRole,
  type RoleTokens,
  type TextRole,
} from './tokens'
import { hasIcon } from './icons'
import {
  anchorOf,
  crisp,
  elbowPath,
  measureText,
  placeLabel,
  snap,
  snapUp,
  type Port,
  type Rect,
  type Side,
} from './geometry'
import type { LegendItem, NodeSpec, Prim, Scene, SceneItem } from './spec'
import type { SkinName } from './tokens'

/** Nodes shorter than this keep their icon hidden: the name would collide with it. */
const ICON_MIN_NODE_H = 56

export interface BuilderOptions {
  width: number
  height: number
  legendMode?: 'nodes' | 'custom' | 'none'
  theme: 'light' | 'dark'
  variant: 'minimal' | 'editorial'
  skin: SkinName
  tokens: RoleTokens
  background?: 'paper' | 'dots'
  aria: { title: string; desc: string; slug: string }
}

export class SceneBuilder {
  readonly opts: BuilderOptions
  readonly items: SceneItem[] = []
  legend: LegendItem[] = []
  private seq = 0

  constructor(opts: BuilderOptions) {
    this.opts = opts
  }

  get t(): RoleTokens {
    return this.opts.tokens
  }

  get theme(): 'light' | 'dark' {
    return this.opts.theme
  }

  /** Where the diagram body starts (below nothing) — engines own their layout. */
  get width(): number {
    return this.opts.width
  }
  get height(): number {
    return this.opts.height
  }

  private push(layer: number, prim: Prim, id?: string) {
    this.items.push({ layer, prim, id })
    return this
  }

  /**
   * Tag every primitive emitted since `start` with the node it belongs to, so a
   * step-gated reveal shows and hides a node's box, mask and labels together.
   */
  private tagGroup(start: number, group: string | undefined) {
    if (!group) return
    for (let i = start; i < this.items.length; i++) {
      if (this.items[i].group === undefined) this.items[i].group = group
    }
  }

  // ── Containers ────────────────────────────────────────────────────────────

  /** Zone / lane / trust boundary — painted first, under everything. */
  zone(r: Rect, label: string, opts: { kind?: 'zone' | 'lane' | 'trust-boundary'; id?: string; dashed?: boolean } = {}) {
    const dashed = opts.dashed ?? opts.kind === 'trust-boundary'
    this.push(
      10,
      {
        t: 'rect',
        x: snap(r.x),
        y: snap(r.y),
        w: snap(r.w),
        h: snap(r.h),
        rx: RADIUS.lg,
        fill: opts.kind === 'lane' ? alpha(this.t.ink, 0.015) : 'transparent',
        stroke: dashed ? alpha(this.t.accent, 0.35) : this.t.rule,
        strokeWidth: STROKE.thin,
        dash: dashed ? '6,4' : undefined,
      },
      opts.id,
    )
    this.push(11, {
      t: 'text',
      x: snap(r.x + 12),
      y: snap(r.y + 16),
      text: label.toUpperCase(),
      family: 'mono',
      size: TYPE_RAMP.zoneLabel.size,
      weight: TYPE_RAMP.zoneLabel.weight,
      tracking: TYPE_RAMP.zoneLabel.tracking,
      fill: this.t.soft,
      anchor: 'start',
    })
    return this
  }

  /** Section heading inside a zone (sans, small). */
  heading(x: number, y: number, text: string, opts: { anchor?: 'start' | 'middle' | 'end'; role?: TextRole; fill?: string } = {}) {
    const ramp = TYPE_RAMP[opts.role ?? 'nodeName']
    return this.push(12, {
      t: 'text',
      x: snap(x),
      y: snap(y),
      text,
      family: ramp.family === 'serif' ? 'serif' : ramp.family === 'mono' ? 'mono' : 'sans',
      size: ramp.size,
      weight: ramp.weight,
      tracking: 'tracking' in ramp ? ramp.tracking : 0,
      fill: opts.fill ?? this.t.ink,
      anchor: opts.anchor ?? 'start',
    })
  }

  // ── Links ─────────────────────────────────────────────────────────────────

  /** Orthogonal connector with an optional masked label. */
  link(
    from: Rect,
    to: Rect,
    opts: {
      id?: string
      fromSide?: Side
      toSide?: Side
      role?: LinkRole
      dashed?: boolean
      label?: string
      fromIndex?: [number, number]
      toIndex?: [number, number]
      lane?: number
      radius?: number
      labelOrientation?: 'h' | 'v'
      labelAt?: 'mid' | 'near-from' | 'near-to'
      marker?: boolean
      /** Rule 6 — rects the label mask must avoid (nodes painted after it). */
      avoid?: Rect[]
    } = {},
  ) {
    const fromSide = opts.fromSide ?? 'right'
    const toSide = opts.toSide ?? 'left'
    const [fk, fn] = opts.fromIndex ?? [1, 1]
    const [tk, tn] = opts.toIndex ?? [1, 1]
    const p1 = fanPort(from, fromSide, fk, fn)
    const p2 = fanPort(to, toSide, tk, tn)
    const d = elbowPath(p1, p2, { radius: opts.radius, lane: opts.lane })
    const { stroke, dash } = linkStroke(opts.role ?? 'default', this.t)
    this.push(
      20,
      {
        t: 'path',
        d,
        stroke,
        strokeWidth: opts.role === 'accent' ? STROKE.strong : STROKE.default,
        dash: opts.dashed ? '5,4' : dash,
        fill: 'none',
        marker: opts.marker === false ? undefined : opts.role ?? 'default',
      },
      opts.id,
    )
    if (opts.label) {
      const label = opts.label.slice(0, CONNECTOR.maxLabelChars).toUpperCase()
      const at = pickLabelPoint(p1, p2, opts.labelAt ?? 'mid')
      const orientation =
        opts.labelOrientation ?? (Math.abs(p1.y - p2.y) < Math.abs(p1.x - p2.x) ? 'h' : 'v')
      const placement = placeLabel(at.x, at.y, label, { orientation, avoid: opts.avoid })
      this.push(30, {
        t: 'mask',
        x: placement.mask.x,
        y: placement.mask.y,
        w: placement.mask.w,
        h: placement.mask.h,
        rx: RADIUS.sm,
      })
      this.push(31, {
        t: 'text',
        x: placement.textX,
        y: placement.textY,
        text: label,
        family: 'mono',
        size: TYPE_RAMP.arrowLabel.size,
        weight: TYPE_RAMP.arrowLabel.weight,
        tracking: TYPE_RAMP.arrowLabel.tracking,
        fill: this.t.soft,
        anchor: placement.anchor,
      })
    }
    return this
  }

  /** Straight vertical rule (sequence lifelines, chart axes). */
  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    opts: {
      stroke?: string
      dash?: string
      width?: number
      opacity?: number
      layer?: number
      id?: string
      marker?: LinkRole | null
    } = {},
  ) {
    return this.push(
      opts.layer ?? 20,
      {
        t: 'line',
        x1: crisp(snap(x1)),
        y1: Math.round(y1) + 0.5,
        x2: crisp(snap(x2)),
        y2: Math.round(y2) + 0.5,
        stroke: opts.stroke ?? this.t.ruleSolid,
        strokeWidth: opts.width ?? STROKE.thin,
        dash: opts.dash,
        opacity: opts.opacity,
        marker: opts.marker ?? undefined,
      },
      opts.id,
    )
  }

  // ── Nodes ─────────────────────────────────────────────────────────────────

  /** Full node box: mask + box + tag + name + sublabel. */
  node(
    r: Rect,
    spec: Pick<NodeSpec, 'name' | 'sublabel' | 'tag' | 'kind' | 'icon'> & { id?: string },
    opts: { id?: string; layer?: number; nameFill?: string; rx?: number; weight?: number } = {},
  ): Rect {
    const start = this.items.length
    const box = this.drawNode(r, spec, opts)
    this.tagGroup(start, opts.id ?? spec.id)
    return box
  }

  private drawNode(
    r: Rect,
    spec: Pick<NodeSpec, 'name' | 'sublabel' | 'tag' | 'kind' | 'icon'> & { id?: string },
    opts: { id?: string; layer?: number; nameFill?: string; rx?: number; weight?: number } = {},
  ): Rect {
    const kind = spec.kind ?? 'backend'
    const treat = nodeTreatment(kind, this.t)
    const box: Rect = { x: snap(r.x), y: snap(r.y), w: snap(r.w), h: snap(r.h) }
    const rx = opts.rx ?? RADIUS.md
    const id = opts.id ?? spec.id
    const layer = opts.layer ?? 40

    // 1. Opaque paper mask — arrows must never bleed through a node.
    this.push(layer, { t: 'mask', x: box.x, y: box.y, w: box.w, h: box.h, rx }, id ? `${id}-mask` : undefined)
    // 2. Styled box
    this.push(
      layer + 1,
      {
        t: 'rect',
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        rx,
        fill: treat.fill,
        stroke: treat.stroke,
        strokeWidth: treat.strokeWidth,
        dash: treat.dash,
      },
      id,
    )
    // 3. Rectangular type tag (rx=2, never a pill)
    if (spec.tag) {
      const tag = spec.tag.slice(0, 6).toUpperCase()
      const w = snapUp(measureText(tag, { family: 'mono', size: TYPE_RAMP.tag.size, tracking: 0.08 })) + 8
      const h = 12
      const tx = box.x + 8
      const ty = box.y + 6
      this.push(layer + 2, {
        t: 'rect',
        x: tx,
        y: ty,
        w,
        h,
        rx: 2,
        fill: 'transparent',
        stroke: alpha(treat.stroke === 'transparent' ? this.t.ink : treat.stroke, 0.4),
        strokeWidth: STROKE.thin,
      })
      this.push(layer + 2, {
        t: 'text',
        x: tx + w / 2,
        y: ty + 9,
        text: tag,
        family: 'mono',
        size: TYPE_RAMP.tag.size,
        weight: TYPE_RAMP.tag.weight,
        tracking: TYPE_RAMP.tag.tracking,
        fill: alpha(this.t.ink, 0.8),
        anchor: 'middle',
      })
    }
    // 3b. Icon, top-right (opposite the tag). Only in boxes tall enough to keep it clear of the name.
    if (spec.icon && hasIcon(spec.icon) && box.h >= ICON_MIN_NODE_H) {
      const size = 16
      this.push(layer + 2, {
        t: 'icon',
        name: spec.icon,
        x: box.x + box.w - 8 - size,
        y: box.y + 6,
        size,
        color: treat.stroke === 'transparent' ? this.t.ink : treat.stroke,
      })
    }
    // 4. Name (sans) + 5. sublabel (mono), vertically centred in what's left.
    const textTop = spec.tag ? box.y + 22 : box.y
    const hasSub = Boolean(spec.sublabel)
    const centerY = snap(textTop + (box.h - (textTop - box.y)) / 2)
    this.push(layer + 3, {
      t: 'text',
      x: snap(box.x + box.w / 2),
      y: hasSub ? centerY - 2 : centerY + 4,
      text: spec.name,
      family: 'sans',
      size: TYPE_RAMP.nodeName.size,
      weight: opts.weight ?? TYPE_RAMP.nodeName.weight,
      fill: opts.nameFill ?? this.t.ink,
      anchor: 'middle',
    })
    if (spec.sublabel) {
      this.push(layer + 4, {
        t: 'text',
        x: snap(box.x + box.w / 2),
        y: centerY + 14,
        text: spec.sublabel,
        family: 'mono',
        size: TYPE_RAMP.sublabel.size,
        fill: this.t.muted,
        anchor: 'middle',
      })
    }
    return box
  }

  /**
   * A decision node (flowchart) — diamond inscribed in the given rect.
   */
  decision(r: Rect, spec: { name: string; sublabel?: string; id?: string; kind?: NodeKind }) {
    const start = this.items.length
    const box = this.drawDecision(r, spec)
    this.tagGroup(start, spec.id)
    return box
  }

  private drawDecision(r: Rect, spec: { name: string; sublabel?: string; id?: string; kind?: NodeKind }) {
    const box: Rect = { x: snap(r.x), y: snap(r.y), w: snap(r.w), h: snap(r.h) }
    const treat = nodeTreatment(spec.kind ?? 'backend', this.t)
    const cx = box.x + box.w / 2
    const cy = box.y + box.h / 2
    this.push(40, { t: 'mask', x: box.x, y: box.y, w: box.w, h: box.h })
    this.push(41, {
      t: 'polygon',
      points: `${cx},${box.y} ${box.x + box.w},${cy} ${cx},${box.y + box.h} ${box.x},${cy}`,
      fill: treat.fill,
      stroke: treat.stroke,
      strokeWidth: treat.strokeWidth,
    })
    this.push(43, {
      t: 'text',
      x: snap(cx),
      y: snap(cy + 4),
      text: spec.name,
      family: 'sans',
      size: TYPE_RAMP.nodeName.size,
      weight: TYPE_RAMP.nodeName.weight,
      fill: this.t.ink,
      anchor: 'middle',
    })
    if (spec.sublabel) {
      this.push(44, {
        t: 'text',
        x: snap(cx),
        y: snap(cy + 18),
        text: spec.sublabel,
        family: 'mono',
        size: TYPE_RAMP.sublabel.size,
        fill: this.t.muted,
        anchor: 'middle',
      })
    }
    return box
  }

  /** Free path — chart series, ribbons, axonometric edges, radial arcs. */
  path(
    d: string,
    opts: {
      stroke?: string
      fill?: string
      width?: number
      dash?: string
      layer?: number
      opacity?: number
      id?: string
      marker?: LinkRole | null
    } = {},
  ) {
    return this.push(
      opts.layer ?? 20,
      {
        t: 'path',
        d,
        stroke: opts.stroke,
        strokeWidth: opts.width ?? STROKE.default,
        dash: opts.dash,
        fill: opts.fill ?? 'none',
        opacity: opts.opacity,
        marker: opts.marker ?? undefined,
      },
      opts.id,
    )
  }

  /** Polyline through points, as a path (no closing segment). */
  polyline(
    points: { x: number; y: number }[],
    opts: { stroke?: string; width?: number; dash?: string; layer?: number; opacity?: number } = {},
  ) {
    if (!points.length) return this
    const d = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${Math.round(p.x * 100) / 100} ${Math.round(p.y * 100) / 100}`)
      .join(' ')
    return this.path(d, opts)
  }

  // ── Chart / shape primitives ──────────────────────────────────────────────

  rect(r: Rect, opts: { fill?: string; stroke?: string; dash?: string; rx?: number; width?: number; layer?: number; id?: string; opacity?: number } = {}) {
    return this.push(
      opts.layer ?? 12,
      {
        t: 'rect',
        x: snap(r.x),
        y: snap(r.y),
        w: snap(r.w),
        h: snap(r.h),
        rx: opts.rx ?? RADIUS.md,
        fill: opts.fill ?? 'transparent',
        stroke: opts.stroke,
        dash: opts.dash,
        strokeWidth: opts.width ?? STROKE.default,
        opacity: opts.opacity,
      },
      opts.id,
    )
  }

  circle(cx: number, cy: number, r: number, opts: { fill?: string; stroke?: string; width?: number; layer?: number; id?: string; opacity?: number } = {}) {
    return this.push(
      opts.layer ?? 41,
      {
        t: 'circle',
        cx: Math.round(cx * 100) / 100,
        cy: Math.round(cy * 100) / 100,
        r: Math.round(r * 100) / 100,
        fill: opts.fill ?? 'transparent',
        stroke: opts.stroke,
        strokeWidth: opts.width ?? STROKE.default,
        opacity: opts.opacity,
      },
      opts.id,
    )
  }

  polygon(points: string, opts: { fill?: string; stroke?: string; width?: number; dash?: string; layer?: number; opacity?: number; id?: string } = {}) {
    return this.push(
      opts.layer ?? 12,
      {
        t: 'polygon',
        points,
        fill: opts.fill ?? 'transparent',
        stroke: opts.stroke,
        strokeWidth: opts.width ?? STROKE.default,
        dash: opts.dash,
        opacity: opts.opacity,
      },
      opts.id,
    )
  }

  /** Opaque paper mask — arrows and labels never bleed through content. */
  mask(r: Rect, opts: { rx?: number; layer?: number; id?: string } = {}) {
    return this.push(opts.layer ?? 40, { t: 'mask', x: r.x, y: r.y, w: r.w, h: r.h, rx: opts.rx }, opts.id)
  }

  /** Bare text in any role. */
  text(
    x: number,
    y: number,
    text: string,
    opts: {
      role?: TextRole
      fill?: string
      anchor?: 'start' | 'middle' | 'end'
      family?: 'sans' | 'serif' | 'mono'
      size?: number
      weight?: number
      layer?: number
      italic?: boolean
      opacity?: number
      id?: string
    } = {},
  ) {
    const ramp = TYPE_RAMP[opts.role ?? 'chartLabel']
    const family = opts.family ?? (ramp.family === 'serif' ? 'serif' : ramp.family === 'mono' ? 'mono' : 'sans')
    return this.push(
      opts.layer ?? 45,
      {
        t: 'text',
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        text,
        family,
        size: opts.size ?? ramp.size,
        weight: opts.weight ?? ramp.weight,
        tracking: 'tracking' in ramp ? ramp.tracking : 0,
        fill: opts.fill ?? this.t.muted,
        anchor: opts.anchor ?? 'start',
        italic: opts.italic,
        opacity: opts.opacity,
      },
      opts.id,
    )
  }

  /** Editorial callout — italic serif, with a hairline rule. Max 2 per diagram. */
  callout(
    x: number,
    y: number,
    text: string,
    opts: { width?: number; anchor?: 'start' | 'middle' | 'end'; rule?: boolean } = {},
  ) {
    const size = TYPE_RAMP.callout.size
    const w = opts.width ?? Math.max(160, measureText(text, { family: 'serif', size, tracking: 0 }))
    this.push(50, {
      t: 'text',
      x: snap(x),
      y: snap(y),
      text,
      family: 'serif',
      size,
      weight: 400,
      fill: this.t.muted,
      anchor: opts.anchor ?? 'start',
      italic: true,
    })
    // Hairline under the note. Notes that carry a leader drop it: the leader is the pointer.
    if (opts.rule !== false) {
      this.push(50, {
        t: 'line',
        x1: snap(x),
        y1: snap(y + 8),
        x2: snap(x + w),
        y2: snap(y + 8),
        stroke: this.t.rule,
        strokeWidth: STROKE.thin,
      })
    }
    return this
  }

  /** Read-only view of the primitives pushed so far (used by post-passes such as note leaders). */
  peekItems(): readonly SceneItem[] {
    return this.items
  }

  /** Dashed leader from a note to a node's bottom edge, ending in a landing dot. Solid arrows stay reserved for flow. */
  leader(from: { x: number; y: number }, to: { x: number; y: number }) {
    const mid = (from.y + to.y) / 2
    this.items.push({
      layer: 50,
      prim: {
        t: 'path',
        d: `M ${r2(from.x)} ${r2(from.y)} Q ${r2(from.x)} ${r2(mid)} ${r2(to.x)} ${r2(to.y)}`,
        fill: 'none',
        stroke: alpha(this.t.ink, 0.4),
        strokeWidth: STROKE.thin,
        dash: '4,3',
      },
    })
    this.items.push({ layer: 50, prim: { t: 'circle', cx: to.x, cy: to.y, r: 2, fill: this.t.ink } })
    return this
  }

  axisLabel(x: number, y: number, text: string, anchor: 'start' | 'middle' | 'end' = 'middle') {
    return this.push(13, {
      t: 'text',
      x: snap(x),
      y: snap(y),
      text: text.toUpperCase(),
      family: 'mono',
      size: TYPE_RAMP.axis.size,
      weight: TYPE_RAMP.axis.weight,
      tracking: TYPE_RAMP.axis.tracking,
      fill: this.t.soft,
      anchor,
    })
  }

  tickLabel(x: number, y: number, text: string, anchor: 'start' | 'middle' | 'end' = 'end') {
    return this.push(13, {
      t: 'text',
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      text,
      family: 'mono',
      size: TYPE_RAMP.chartValue.size,
      weight: TYPE_RAMP.chartValue.weight,
      fill: this.t.soft,
      anchor,
    })
  }

  /** Value chip with a mask behind it (bar labels, cell values). */
  chip(x: number, y: number, text: string, opts: { anchor?: 'start' | 'middle' | 'end'; fill?: string } = {}) {
    const w = snapUp(measureText(text, { family: 'mono', size: TYPE_RAMP.chartValue.size })) + 8
    const h = 12
    const originX = opts.anchor === 'start' ? x : opts.anchor === 'end' ? x - w : x - w / 2
    this.push(43, { t: 'mask', x: snap(originX), y: snap(y - 8), w, h, rx: 2 })
    return this.push(44, {
      t: 'text',
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100 + 1,
      text,
      family: 'mono',
      size: TYPE_RAMP.chartValue.size,
      weight: TYPE_RAMP.chartValue.weight,
      fill: opts.fill ?? this.t.ink,
      anchor: opts.anchor ?? 'middle',
    })
  }

  legendItem(kind: LegendItem['kind'], label: string) {
    this.legend.push({ kind, label })
    return this
  }

  /** Marker + dash legend table rendered by the canvas. */
  legendFromSpec(items: LegendItem[]) {
    this.legend = items
    return this
  }

  build(): Scene {
    return {
      width: this.opts.width,
      height: this.opts.height,
      theme: this.opts.theme,
      variant: this.opts.variant,
      skin: this.opts.skin,
      background: this.opts.background ?? 'paper',
      items: this.items,
      legend: this.legend,
      legendMode: this.opts.legendMode ?? 'custom',
      aria: this.opts.aria,
    }
  }
}

/** Attach point for the k-th of n connectors on an edge (rule 4). */
function r2(v: number): number {
  return Math.round(v * 100) / 100
}

export function fanPort(r: Rect, side: Side, k: number, n: number): Port {
  const L = side === 'top' || side === 'bottom' ? r.w : r.h
  const usable = Math.max(L - CONNECTOR.portCornerMargin * 2, GRID)
  const gap = usable / (n + 1)
  const offset = CONNECTOR.portCornerMargin + gap * k
  const snapped = snap(offset)
  if (side === 'top' || side === 'bottom') {
    return { x: snap(r.x + snapped), y: side === 'top' ? r.y : r.y + r.h, side }
  }
  return { x: side === 'left' ? r.x : r.x + r.w, y: snap(r.y + snapped), side }
}

function pickLabelPoint(p1: Port, p2: Port, at: 'mid' | 'near-from' | 'near-to') {
  const t = at === 'mid' ? 0.5 : at === 'near-from' ? 0.22 : 0.78
  return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t }
}

/** Convenience: node rect anchored by its centre (used by radial engines). */
export function centered(cx: number, cy: number, w: number, h: number): Rect {
  return { x: snap(cx - w / 2), y: snap(cy - h / 2), w: snap(w), h: snap(h) }
}

export { anchorOf }
