/**
 * Diagram scene model + spec types.
 *
 * Engines turn a `DiagramSpec` into a `Scene`: a flat list of positioned SVG
 * primitives carrying an explicit paint layer. Keeping the scene as plain data
 * means one renderer serves the app, the studio and the SVG/HTML exporter, and
 * the audit can inspect the same object it renders.
 *
 * Paint order (drawn by ascending layer):
 *   10 background / zones · 20 links · 30 link labels · 40 node masks +
 *   boxes + text · 50 annotations · 60 legend
 */

import type { DiagramKind, DiagramVariant, LinkRole, NodeKind, SkinName, TextRole, Theme } from './tokens'
import type { MotionSpec } from './motion'

// ─── Primitives ──────────────────────────────────────────────────────────────

export type Prim =
  | {
      t: 'rect'
      x: number
      y: number
      w: number
      h: number
      rx?: number
      fill?: string
      stroke?: string
      strokeWidth?: number
      dash?: string
      opacity?: number
    }
  | {
      t: 'path'
      d: string
      stroke?: string
      strokeWidth?: number
      dash?: string
      fill?: string
      opacity?: number
      marker?: LinkRole
    }
  | {
      t: 'line'
      x1: number
      y1: number
      x2: number
      y2: number
      stroke?: string
      strokeWidth?: number
      dash?: string
      opacity?: number
      marker?: LinkRole
    }
  | { t: 'circle'; cx: number; cy: number; r: number; fill?: string; stroke?: string; strokeWidth?: number; opacity?: number }
  | { t: 'polygon'; points: string; fill?: string; stroke?: string; strokeWidth?: number; opacity?: number; dash?: string }
  | {
      t: 'text'
      x: number
      y: number
      text: string
      family: 'sans' | 'serif' | 'mono'
      size: number
      weight?: number
      fill?: string
      anchor?: 'start' | 'middle' | 'end'
      tracking?: number
      italic?: boolean
      opacity?: number
      baseline?: 'auto' | 'middle'
    }
  | { t: 'mask'; x: number; y: number; w: number; h: number; rx?: number }
  /** A named monochrome icon from the icon set (icons.ts). Uses currentColor via `color`. */
  | { t: 'icon'; name: string; x: number; y: number; size: number; color: string }

export interface SceneItem {
  /** Paint order — see the module header. */
  layer: number
  prim: Prim
  /** Optional identifier used by the audit and by interactive hover states. */
  id?: string
  /** The node this primitive belongs to; motion steps reveal whole groups. */
  group?: string
}

export interface LegendItem {
  kind: NodeKind | 'arrow' | 'arrow-accent' | 'arrow-link' | 'dash'
  label: string
}

export interface Scene {
  /** Target size in user units (the SVG viewBox). */
  width: number
  height: number
  theme: Theme
  variant: DiagramVariant
  skin: SkinName
  /** Default: clean paper, no dot pattern. */
  background: 'paper' | 'dots'
  items: SceneItem[]
  legend: LegendItem[]
  /** How the audit should read this figure's legend. */
  legendMode: 'nodes' | 'custom' | 'none'
  aria: { title: string; desc: string; slug: string }
  /** Structured findings from the audit, filled by `auditScene`. */
  audit?: AuditReport
}

// ─── Auditing ────────────────────────────────────────────────────────────────

export interface AuditFinding {
  rule: string
  level: 'pass' | 'warn' | 'fail'
  message: string
  detail?: string
}

export interface AuditReport {
  ok: boolean
  findings: AuditFinding[]
  counts: { nodes: number; links: number; focal: number; labels: number; callouts: number }
}

// ─── Specs ───────────────────────────────────────────────────────────────────

export interface NodeSpec {
  id: string
  name: string
  /** Technical sublabel — port, protocol, URL, field type. Geist Mono. */
  sublabel?: string
  /** Rectangular type tag, rx=2 (not a pill). */
  tag?: string
  kind?: NodeKind
  /** Box shape — decisions render as diamonds in the flowchart engine. */
  shape?: 'box' | 'decision' | 'stadium' | 'note'
  /** Fixed size overrides; engines snap them to the grid. */
  w?: number
  h?: number
  /** Explicit grid slot for engines that honour coordinates. */
  col?: number
  row?: number
  /** Name from the icon set (icons.ts). Drawn top-right when the node is tall enough. */
  icon?: string
  /** Optional parent zone / lane id. */
  zone?: string
}

export interface LinkSpec {
  id?: string
  from: string
  to: string
  /** ≤14 chars, upper-cased by the renderer. */
  label?: string
  role?: LinkRole
  fromSide?: 'top' | 'right' | 'bottom' | 'left'
  toSide?: 'top' | 'right' | 'bottom' | 'left'
  /** Return / async / passive links render dashed. */
  dashed?: boolean
}

export interface ZoneSpec {
  id: string
  label: string
  kind?: 'zone' | 'lane' | 'trust-boundary'
  /** Explicit band index (lanes) or ordering. */
  index?: number
  /** Number of grid columns the zone spans, when the engine lays out a matrix. */
  span?: number
}

export interface StackSpec {
  id: string
  name: string
  sublabel?: string
  tag?: string
  kind?: NodeKind
  /** Relative height / width weight, so bands vary rather than divide evenly. */
  weight?: number
  /** For nested: the parent stack id. */
  parent?: string
}

export interface GroupSpec {
  id: string
  label: string
  sublabel?: string
  /** kanban WIP limit, journey stage index, story-map slice, etc. */
  limit?: number
  weight?: number
}

export interface SeriesSpec {
  id: string
  label: string
  /** Focal series takes the accent; others ride the series palette. */
  focal?: boolean
  values: number[]
  sublabel?: string
}

export interface TaskSpec {
  id: string
  name: string
  start: number
  end: number
  phase?: string
  kind?: NodeKind
}

export interface CellSpec {
  row: string
  col: string
  value: number
  label?: string
}

export interface StepSpec {
  id: string
  name: string
  value: number
  type?: 'total' | 'delta' | 'subtotal'
  sublabel?: string
}

export interface TableSpec {
  id: string
  name: string
  sublabel?: string
  kind?: NodeKind
  columns: { name: string; type: string; pk?: boolean; fk?: string }[]
}

export interface ClassSpec {
  id: string
  name: string
  stereotype?: string
  attributes: string[]
  operations: string[]
  kind?: NodeKind
}

export interface PartSpec {
  id: string
  name: string
  sublabel?: string
  kind?: NodeKind
  /** Stacking order, bottom → top. Defaults to the array order. */
  level?: number
}

export interface RoomSpec {
  id: string
  name: string
  sublabel?: string
  kind?: NodeKind
  /** Grid rectangle on the plate: col/row/spanCol/spanRow. */
  col: number
  row: number
  spanCol?: number
  spanRow?: number
  height?: number
}

export interface NoteSpec {
  /** Italic Instrument Serif editorial aside. Max 2 per diagram. */
  text: string
  /** Where the note anchors in the figure. */
  at: 'start' | 'end' | 'under'
  /** Optional node id. When set, the note draws a dashed leader and a landing dot on that node (primitive-annotation.md). */
  target?: string
}

export interface DiagramSpec {
  slug: string
  kind: DiagramKind
  title: string
  /** One sentence about the content, never the geometry. */
  desc: string
  eyebrow?: string
  subtitle?: string
  variant?: DiagramVariant
  theme?: Theme
  skin?: SkinName
  background?: 'paper' | 'dots'
  /** Layout dial, where the engine supports it. */
  direction?: 'horizontal' | 'vertical'
  size?: { w: number; h: number }
  legend?: boolean | LegendItem[]
  callouts?: NoteSpec[]
  /** Show the eyebrow/title/subtitle block above the SVG. */
  header?: boolean
  /** Footer colophon line (mono, muted) under the figure. */
  footer?: string
  /** Optional playback. Absent or `mode: 'none'` ships the complete static figure. */
  motion?: MotionSpec
  /** `terminal` wraps the figure in the CLI-chrome window (primitive-terminal.md). */
  frame?: 'editorial' | 'terminal'
  /** Hand-drawn displacement on shapes; text is never filtered (primitive-sketchy.md). */
  sketchy?: boolean

  nodes?: NodeSpec[]
  links?: LinkSpec[]
  zones?: ZoneSpec[]
  stacks?: StackSpec[]
  groups?: GroupSpec[]
  series?: SeriesSpec[]
  categories?: string[]
  tasks?: TaskSpec[]
  cells?: CellSpec[]
  steps?: StepSpec[]
  tables?: TableSpec[]
  classes?: ClassSpec[]
  parts?: PartSpec[]
  rooms?: RoomSpec[]

  /** Chart-type extras. */
  axis?: { x?: { label: string; min?: number; max?: number }; y?: { label: string; min?: number; max?: number } }
  events?: { id: string; name: string; at?: number; sublabel?: string; kind?: NodeKind }[]
  points?: { id: string; x: number; y: number; label?: string; r?: number; focal?: boolean }[]
  /** Quadrant axis labels + items. */
  quadrant?: {
    xAxis: { low: string; high: string }
    yAxis: { low: string; high: string }
    items: { id: string; label: string; x: number; y: number; focal?: boolean }[]
    quadrants?: { tl: string; tr: string; bl: string; br: string }
  }
  /** Loop / flywheel stations around a hub. */
  loop?: { hub: { name: string; sublabel?: string }; stations: { id: string; name: string; sublabel?: string; kind?: NodeKind }[] }
  /** Sankey stages. */
  sankey?: { stages: string[]; flows: { from: string; to: string; value: number; focal?: boolean }[]; units?: string }
  /** Venn sets. */
  venn?: { sets: { id: string; label: string; sublabel?: string }[]; intersections?: { ids: string[]; label: string }[] }
  /** Fishbone. */
  fishbone?: { effect: string; bones: { label: string; causes: string[] }[] }
  /** Wardley movement arrows. */
  movements?: { from: string; to: string; label?: string }[]
  /** Timeline / journey scales. */
  scale?: { from: string; to: string }
}

export type { DiagramKind, DiagramVariant, LinkRole, NodeKind, SkinName, TextRole, Theme }
