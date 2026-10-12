/**
 * Diagram geometry helpers.
 *
 * Everything structural snaps to the 4px grid. Connectors are orthogonal
 * rounded elbows (never diagonals), labels keep a 6–10px gap from their own
 * stroke, shared edges fan their attach points, and text is budgeted at
 * 0.60em/char sans · 0.62em/char mono with wide (CJK) characters costing 1em.
 */

import { CHAR_WIDTH, CONNECTOR, GRID } from './tokens'

// ─── Grid ────────────────────────────────────────────────────────────────────

/** Snap any structural value to the 4px grid. */
export function snap(v: number): number {
  return Math.round(v / GRID) * GRID
}

/** Snap a coordinate so a 1px stroke lands crisply (half-pixel offset). */
export function crisp(v: number): number {
  return Math.round(v) + 0.5
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** Round a box dimension up to the next grid multiple. */
export function snapUp(v: number): number {
  return Math.ceil(v / GRID) * GRID
}

// ─── Text measurement ────────────────────────────────────────────────────────

export interface TextMetrics {
  family: 'sans' | 'mono' | 'serif'
  size: number
  tracking?: number
}

function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
    (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) || // CJK radicals … Yi
    (code >= 0xac00 && code <= 0xd7a3) || // Hangul syllables
    (code >= 0xf900 && code <= 0xfaff) || // CJK compatibility ideographs
    (code >= 0xfe30 && code <= 0xfe6f) || // CJK compatibility forms
    (code >= 0xff00 && code <= 0xff60) || // Fullwidth forms
    (code >= 0xffe0 && code <= 0xffe6)
  )
}

function isZeroWidth(code: number): boolean {
  return (
    (code >= 0x0300 && code <= 0x036f) || // combining diacritics
    (code >= 0x200b && code <= 0x200f) || // zero-width space … RTL mark
    code === 0xfeff // BOM / zero-width no-break space
  )
}

/**
 * Measure a string per character — never per script. Every rendered character
 * costs something; wide characters cost 1em, combining marks cost nothing.
 */
export function measureText(text: string, m: TextMetrics): number {
  const base = CHAR_WIDTH[m.family]
  let em = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (isZeroWidth(code)) continue
    em += isWide(code) ? 1 : base
  }
  const tracking = (m.tracking ?? 0) * Math.max(0, [...text].length - 1)
  return em * m.size + tracking * m.size
}

export function textHeight(m: TextMetrics): number {
  return snapUp(m.size * 1.25)
}

/** Truncate to a character budget with an ellipsis, for tight chart labels. */
export function ellipsize(text: string, maxChars: number): string {
  if ([...text].length <= maxChars) return text
  return [...text].slice(0, Math.max(1, maxChars - 1)).join('') + '…'
}

// ─── Connectors ──────────────────────────────────────────────────────────────

export type Side = 'top' | 'right' | 'bottom' | 'left'

export interface Port {
  x: number
  y: number
  side: Side
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export function anchorOf(r: Rect, side: Side, offset?: number): Port {
  switch (side) {
    case 'top':
      return { x: r.x + (offset ?? r.w / 2), y: r.y, side }
    case 'bottom':
      return { x: r.x + (offset ?? r.w / 2), y: r.y + r.h, side }
    case 'left':
      return { x: r.x, y: r.y + (offset ?? r.h / 2), side }
    case 'right':
    default:
      return { x: r.x + r.w, y: r.y + (offset ?? r.h / 2), side }
  }
}

/**
 * Rule 4 — every connector on a shared edge gets its own attach point at
 * `L * k / (N + 1)`, ≥12px apart, ≥8px from each corner.
 */
export function fanAttach(r: Rect, side: Side, k: number, n: number): Port {
  const L = side === 'top' || side === 'bottom' ? r.w : r.h
  const usable = Math.max(L - CONNECTOR.portCornerMargin * 2, GRID)
  const raw = r.x + (side === 'left' || side === 'right' ? 0 : CONNECTOR.portCornerMargin) +
    (side === 'top' || side === 'bottom' ? 0 : 0)
  const offset = CONNECTOR.portCornerMargin + (usable * k) / (n + 1)
  const snapped = snap(offset)
  if (side === 'top' || side === 'bottom') return { x: snap(raw + snapped), y: side === 'top' ? r.y : r.y + r.h, side }
  // vertical edge: measure from the corner down the height
  const y = snap(r.y + CONNECTOR.portCornerMargin + (usable * k) / (n + 1))
  return { x: side === 'left' ? r.x : r.x + r.w, y, side }
}

function dirOf(side: Side): { dx: number; dy: number } {
  switch (side) {
    case 'top':
      return { dx: 0, dy: -1 }
    case 'bottom':
      return { dx: 0, dy: 1 }
    case 'left':
      return { dx: -1, dy: 0 }
    case 'right':
    default:
      return { dx: 1, dy: 0 }
  }
}

/**
 * Rule 1 — orthogonal elbow path. A straight line is used only when both ends
 * share an axis; otherwise the path is built from right-angle segments with
 * `r` quarter-arc corners.
 */
export function elbowPath(
  from: Port,
  to: Port,
  opts: { radius?: number; lane?: number } = {},
): string {
  const r = opts.radius ?? CONNECTOR.elbowRadius
  const lane = opts.lane ?? 0

  // Straight when the endpoints share an axis (with a minimum stub so a
  // perpendicular exit still reads as a connector).
  if (Math.abs(from.x - to.x) < 0.5 || Math.abs(from.y - to.y) < 0.5) {
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`
  }

  const f = dirOf(from.side)
  const t = dirOf(to.side)
  const stub = CONNECTOR.portCornerMargin

  // Leave the source perpendicular to its edge, then turn.
  const a = { x: from.x + f.dx * stub, y: from.y + f.dy * stub }
  const b = { x: to.x + t.dx * stub, y: to.y + t.dy * stub }

  // Mid routing with an optional parallel offset so two routes never stack.
  let pts: { x: number; y: number }[]
  const horizontalFirst = from.side === 'left' || from.side === 'right'

  if (horizontalFirst) {
    const midX = stageMid(a.x, b.x, lane)
    pts = [from, a, { x: midX, y: a.y }, { x: midX, y: b.y }, b, to]
  } else {
    const midY = stageMid(a.y, b.y, lane)
    pts = [from, a, { x: a.x, y: midY }, { x: b.x, y: midY }, b, to]
  }

  return roundedPolyline(pts, r)
}

function stageMid(from: number, to: number, lane: number): number {
  const mid = (from + to) / 2
  const offset = lane * CONNECTOR.parallelOffset
  // Never let a lane offset collapse the segment into the endpoints.
  const min = Math.min(from, to) + CONNECTOR.portCornerMargin
  const max = Math.max(from, to) - CONNECTOR.portCornerMargin
  if (min >= max) return snap(mid)
  return snap(clamp(mid + offset, min, max))
}

/** Build an SVG path from points, rounding each interior corner with radius r. */
export function roundedPolyline(
  pts: { x: number; y: number }[],
  r: number,
): string {
  const clean = pts.filter((p, i) => i === 0 || Math.abs(p.x - pts[i - 1].x) > 0.5 || Math.abs(p.y - pts[i - 1].y) > 0.5)
  if (clean.length < 2) return ''
  let d = `M ${round(clean[0].x)} ${round(clean[0].y)}`
  for (let i = 1; i < clean.length - 1; i++) {
    const prev = clean[i - 1]
    const cur = clean[i]
    const next = clean[i + 1]
    const r1 = Math.min(r, dist(prev, cur) / 2)
    const r2 = Math.min(r, dist(cur, next) / 2)
    const rr = Math.min(r1, r2)
    const p1 = lerp(cur, prev, rr / Math.max(dist(cur, prev), 1))
    const p2 = lerp(cur, next, rr / Math.max(dist(cur, next), 1))
    d += ` L ${round(p1.x)} ${round(p1.y)}`
    const sweep = cross(prev, cur, next) > 0 ? 1 : 0
    d += ` Q ${round(cur.x)} ${round(cur.y)} ${round(p2.x)} ${round(p2.y)}`
    void sweep
  }
  const last = clean[clean.length - 1]
  d += ` L ${round(last.x)} ${round(last.y)}`
  return d
}

function round(v: number): number {
  return Math.round(v * 100) / 100
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function lerp(a: { x: number; y: number }, b: { x: number; y: number }, t: number) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function cross(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): number {
  return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
}

/** Detect a diagonal segment in a path (rule 1 violation). */
export function pathHasDiagonal(d: string): boolean {
  const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
  // Walk point pairs emitted by L/Q commands only; M/L/Q coordinates alternate.
  const segs: { x: number; y: number }[] = []
  for (let i = 0; i + 1 < nums.length; i += 2) segs.push({ x: nums[i], y: nums[i + 1] })
  for (let i = 1; i < segs.length; i++) {
    const dx = Math.abs(segs[i].x - segs[i - 1].x)
    const dy = Math.abs(segs[i].y - segs[i - 1].y)
    if (dx > 0.6 && dy > 0.6) return true
  }
  return false
}

// ─── Arrow labels ────────────────────────────────────────────────────────────

export interface LabelPlacement {
  mask: Rect
  textX: number
  textY: number
  anchor: 'middle' | 'start'
}

/**
 * Rule 2 — the label never sits on its connector. The mask floats 6–10px off
 * the stroke: above a horizontal segment, beside a vertical one.
 */
export function placeLabel(
  x: number,
  y: number,
  text: string,
  opts: {
    orientation?: 'h' | 'v'
    size?: number
    gap?: number
    family?: 'sans' | 'mono'
    /**
     * Rule 6 — rects the mask must not overlap (nodes painted after it).
     * When pass, `placeLabel` flips the mask to the other side of the stroke;
     * if both sides collide it keeps the side with the least overlap.
     */
    avoid?: Rect[]
  } = {},
): LabelPlacement {
  const size = opts.size ?? 8
  const family = opts.family ?? 'mono'
  const gap = opts.gap ?? CONNECTOR.labelGapMin
  const w = snapUp(measureText(text, { family, size, tracking: 0.06 })) + 8
  const h = snapUp(size * 1.5)
  const horizontal = opts.orientation === 'h'

  // Candidate placements: the preferred side first, the opposite side second.
  const candidates: LabelPlacement[] = horizontal
    ? [
        {
          mask: { x: snap(x - w / 2), y: snap(y - h - gap), w, h },
          textX: snap(x),
          textY: round(y - gap - h / 2 + size * 0.36),
          anchor: 'middle',
        },
        {
          // Below the stroke — same 6–10px gap, just the other side.
          mask: { x: snap(x - w / 2), y: snap(y + gap), w, h },
          textX: snap(x),
          textY: round(y + gap + h / 2 + size * 0.36),
          anchor: 'middle',
        },
      ]
    : [
        {
          mask: { x: snap(x + gap), y: snap(y - h / 2), w, h },
          textX: snap(x + gap + w / 2),
          textY: round(y + size * 0.36),
          anchor: 'middle',
        },
        {
          // Left of the stroke.
          mask: { x: snap(x - gap - w), y: snap(y - h / 2), w, h },
          textX: snap(x - gap - w / 2),
          textY: round(y + size * 0.36),
          anchor: 'middle',
        },
      ]

  const avoid = opts.avoid ?? []
  if (!avoid.length) return candidates[0]
  const overlapArea = (r: Rect) =>
    avoid.reduce((sum, a) => {
      const w0 = Math.min(r.x + r.w, a.x + a.w) - Math.max(r.x, a.x)
      const h0 = Math.min(r.y + r.h, a.y + a.h) - Math.max(r.y, a.y)
      return sum + (w0 > 0 && h0 > 0 ? w0 * h0 : 0)
    }, 0)
  const [preferred, opposite] = candidates
  const p0 = overlapArea(preferred.mask)
  if (p0 === 0) return preferred
  const p1 = overlapArea(opposite.mask)
  return p1 < p0 ? opposite : preferred
}

// ─── Small helpers used by engines ───────────────────────────────────────────

export function rectContains(r: Rect, p: { x: number; y: number }): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
}

export function rectsOverlap(a: Rect, b: Rect, pad = 0): boolean {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  )
}

/** Evenly distribute n items across an available width, on the grid. */
export function distribute(total: number, count: number, gap: number): { size: number; starts: number[] } {
  const size = snap((total - gap * (count - 1)) / count)
  const starts: number[] = []
  for (let i = 0; i < count; i++) starts.push(snap(i * (size + gap)))
  return { size, starts }
}

/** Nice axis ticks for chart types. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (max === min) return [min]
  const span = max - min
  const step0 = span / count
  const mag = Math.pow(10, Math.floor(Math.log10(step0)))
  const norm = step0 / mag
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag
  const start = Math.floor(min / step) * step
  const end = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000)
  return ticks
}
