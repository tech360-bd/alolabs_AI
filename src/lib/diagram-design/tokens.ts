/**
 * Diagram Design — design tokens
 *
 * Ported from the editorial diagram design system (cathrynlavery/diagram-design,
 * MIT) into first-class product tokens so every diagram drawn inside AgentOS
 * inherits one skin: semantic roles, node treatments, the series palette,
 * stroke/radius/grid constants, the typography ramp, and the complexity budgets.
 *
 * Load-bearing rules encoded here:
 *  - Every token is referenced by SEMANTIC ROLE, never by hex value.
 *  - Structural geometry sits on a 4px grid.
 *  - `accent` is editorial, not a flag: 1–2 focal elements per diagram.
 *  - Shadows are out. Borders are in.
 */

export const GRID = 4

export type Theme = 'light' | 'dark'
export type DiagramVariant = 'minimal' | 'editorial'

export interface RoleTokens {
  /** Page background, default node fill */
  paper: string
  /** Diagram container bg, secondary fill */
  paper2: string
  /** Primary text, primary stroke */
  ink: string
  /** High-contrast text on warm accent fills */
  inkStrong: string
  /** Secondary text, default arrow stroke */
  muted: string
  /** Sublabels, boundary labels */
  soft: string
  /** Hairline borders */
  rule: string
  /** Stronger borders, baselines */
  ruleSolid: string
  /** Focal / 1–2 max per diagram */
  accent: string
  /** Fill for accent-bordered boxes */
  accentTint: string
  /** HTTP/API calls, external arrows */
  link: string
}

/** Default cool-editorial skin. Cool editorial palette, swap per brand profile. */
export const TOKENS: Record<Theme, RoleTokens> = {
  light: {
    paper: '#f5f5f5',
    paper2: '#ececec',
    ink: '#2d3142',
    inkStrong: '#111111',
    muted: '#4f5d75',
    soft: '#7a8399',
    rule: 'rgba(45,49,66,0.12)',
    ruleSolid: '#bfc0c0',
    accent: '#eb6c36',
    accentTint: 'rgba(235,108,54,0.08)',
    link: '#2e5aa8',
  },
  dark: {
    paper: '#2d3142',
    paper2: '#393e53',
    ink: '#f5f5f5',
    inkStrong: '#111111',
    muted: '#bfc0c0',
    soft: '#8e98ac',
    rule: 'rgba(245,245,245,0.12)',
    ruleSolid: 'rgba(191,192,192,0.25)',
    accent: '#f08a59',
    accentTint: 'rgba(240,138,89,0.10)',
    link: '#6a95d8',
  },
}

/** ALO Labs brand skin — the same role structure, mapped to the product palette. */
export const ALO_SKIN: Record<Theme, RoleTokens> = {
  light: {
    paper: '#F8FAFC',
    paper2: '#F1F5F9',
    ink: '#1E293B',
    inkStrong: '#0B1220',
    muted: '#475569',
    soft: '#94A3B8',
    rule: 'rgba(30,41,59,0.12)',
    ruleSolid: '#CBD5E1',
    accent: '#FF6A00',
    accentTint: 'rgba(255,106,0,0.08)',
    link: '#003ABC',
  },
  dark: {
    paper: '#0F172A',
    paper2: '#1E293B',
    ink: '#F8FAFC',
    inkStrong: '#FFFFFF',
    muted: '#CBD5E1',
    soft: '#94A3B8',
    rule: 'rgba(248,250,252,0.12)',
    ruleSolid: 'rgba(203,213,225,0.25)',
    accent: '#FF6A00',
    accentTint: 'rgba(255,106,0,0.12)',
    link: '#60A5FA',
  },
}

/**
 * Terminal skin (primitive-terminal.md, style-guide.md § Terminal skin). A fixed dark palette,
 * independent of the light/dark theme. One accent only: link maps to ink so no second hue appears.
 */
export const TERMINAL_SKIN: RoleTokens = {
  paper: '#141414',
  paper2: '#1b1b1b',
  ink: '#f5f5f5',
  inkStrong: '#0a0a0a',
  muted: '#9a9a9a',
  soft: '#5c5c5c',
  rule: 'rgba(255,255,255,0.10)',
  ruleSolid: '#2b2b2b',
  accent: '#ff5a36',
  accentTint: 'rgba(255,90,54,0.12)',
  link: '#f5f5f5',
}

export type SkinName = 'editorial' | 'alo' | 'terminal'

export function resolveSkin(skin: SkinName | undefined, theme: Theme): RoleTokens {
  if (skin === 'terminal') return TERMINAL_SKIN
  if (skin === 'alo') return ALO_SKIN[theme]
  return TOKENS[theme]
}

/**
 * Series palette — opt-in, multi-series chart types only (radar, line, bar).
 * The 1-focal rule still holds: `accent` is reserved for the focal series.
 */
export const SERIES_TOKENS: Record<Theme, string[]> = {
  light: ['#7c8f6f', '#5e7a9b', '#b8915a', '#9c6b50', '#6e6479'],
  dark: ['#9caf8f', '#82a0c0', '#d3ad7a', '#b88670', '#8d8298'],
}

/** Fills sit at 0.18 opacity light / 0.22 dark; strokes use the full colour. */
export const SERIES_FILL_OPACITY: Record<Theme, number> = { light: 0.18, dark: 0.22 }

export const STROKE = {
  thin: 0.8,
  default: 1,
  strong: 1.2,
} as const

export const RADIUS = {
  sm: 4,
  md: 6,
  lg: 8,
} as const

/** Connector geometry constants (SKILL §6). */
export const CONNECTOR = {
  elbowRadius: 8,
  elbowRadiusTight: 6,
  /** Minimum gap between a label mask and its own connector stroke. */
  labelGapMin: 6,
  labelGapMax: 10,
  /** Parallel routes are offset by at least this much. */
  parallelOffset: 12,
  /** Distinct attach points on a shared edge are ≥ this far apart. */
  attachSpacing: 12,
  /** Hairline margin from a port to its box corner. */
  portCornerMargin: 8,
  maxLabelChars: 14,
} as const

/** Type ramp — sizes ride the role ramp, not the 4px grid. */
export const TYPE_RAMP = {
  title: { family: 'serif', size: 28, weight: 400, tracking: 0 },
  pageEyebrow: { family: 'mono', size: 8, weight: 500, tracking: 0.18 },
  nodeName: { family: 'sans', size: 12, weight: 600, tracking: 0 },
  sublabel: { family: 'mono', size: 9, weight: 400, tracking: 0 },
  eyebrow: { family: 'mono', size: 7, weight: 500, tracking: 0.18 },
  tag: { family: 'mono', size: 7, weight: 500, tracking: 0.08 },
  arrowLabel: { family: 'mono', size: 8, weight: 400, tracking: 0.06 },
  callout: { family: 'serif', size: 14, weight: 400, tracking: 0, italic: true },
  legend: { family: 'mono', size: 8, weight: 400, tracking: 0.14 },
  chartLabel: { family: 'mono', size: 9, weight: 400, tracking: 0.02 },
  chartValue: { family: 'mono', size: 8, weight: 500, tracking: 0.02 },
  axis: { family: 'mono', size: 7, weight: 500, tracking: 0.16 },
  zoneLabel: { family: 'mono', size: 7, weight: 500, tracking: 0.16 },
} as const

export type TextRole = keyof typeof TYPE_RAMP

/** Per-character width budget, in em. Geist sans 0.60 / Geist Mono 0.62. */
export const CHAR_WIDTH = { sans: 0.6, mono: 0.62, serif: 0.52 } as const

/**
 * Node type → treatment. Fill / stroke derived from the semantic roles above so
 * a skin swap re-colours every node without touching type logic.
 */
export type NodeKind =
  | 'focal'
  | 'backend'
  | 'store'
  | 'external'
  | 'input'
  | 'optional'
  | 'security'
  | 'accentLine'
  | 'plain'

export interface NodeTreatment {
  fill: string
  stroke: string
  strokeWidth: number
  dash?: string
}

/** ink @ opacity helper — keeps derived fills tied to the skin. */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r},${g},${b},${a})`
}

export function nodeTreatment(kind: NodeKind, t: RoleTokens): NodeTreatment {
  switch (kind) {
    case 'focal':
      return { fill: t.accentTint, stroke: t.accent, strokeWidth: STROKE.strong }
    case 'backend':
      // Note: white on paper reads as the default "primary surface".
      return { fill: '#ffffff', stroke: t.ink, strokeWidth: STROKE.default }
    case 'store':
      return { fill: alpha(t.ink, 0.05), stroke: t.muted, strokeWidth: STROKE.default }
    case 'external':
      return { fill: alpha(t.ink, 0.03), stroke: alpha(t.ink, 0.3), strokeWidth: STROKE.default }
    case 'input':
      return { fill: alpha(t.muted, 0.1), stroke: t.soft, strokeWidth: STROKE.default }
    case 'optional':
      return {
        fill: alpha(t.ink, 0.02),
        stroke: alpha(t.ink, 0.2),
        strokeWidth: STROKE.default,
        dash: '4,3',
      }
    case 'security':
      return {
        fill: alpha(t.accent, 0.05),
        stroke: alpha(t.accent, 0.5),
        strokeWidth: STROKE.default,
        dash: '4,4',
      }
    case 'accentLine':
      return { fill: t.accentTint, stroke: t.accent, strokeWidth: STROKE.default }
    case 'plain':
    default:
      return { fill: 'transparent', stroke: t.ruleSolid, strokeWidth: STROKE.default }
  }
}

/** Link roles — muted default, accent for the headline path, link for HTTP/API. */
export type LinkRole = 'default' | 'accent' | 'link' | 'security' | 'optional'

export function linkStroke(role: LinkRole, t: RoleTokens): { stroke: string; dash?: string } {
  switch (role) {
    case 'accent':
      return { stroke: t.accent }
    case 'link':
      return { stroke: t.link }
    case 'security':
      return { stroke: alpha(t.accent, 0.6), dash: '4,3' }
    case 'optional':
      return { stroke: t.soft, dash: '5,4' }
    case 'default':
    default:
      return { stroke: t.muted }
  }
}

// ─── Diagram kinds ───────────────────────────────────────────────────────────

export type DiagramKind =
  | 'architecture'
  | 'architecture-delta'
  | 'it-state'
  | 'flowchart'
  | 'sequence'
  | 'state'
  | 'er'
  | 'timeline'
  | 'swimlane'
  | 'quadrant'
  | 'radar'
  | 'polar'
  | 'loop'
  | 'nested'
  | 'tree'
  | 'org-chart'
  | 'layers'
  | 'exploded'
  | 'axonometric-plan'
  | 'venn'
  | 'pyramid'
  | 'bar'
  | 'waterfall'
  | 'treemap'
  | 'heatmap'
  | 'line'
  | 'gantt'
  | 'scatter'
  | 'high-level'
  | 'process'
  | 'medallion'
  | 'data-flow'
  | 'dp-integration'
  | 'dp-security-matrix'
  | 'sankey'
  | 'fishbone'
  | 'wardley'
  | 'kanban'
  | 'journey'
  | 'deployment'
  | 'dependency'
  | 'uml-class'
  | 'story-map'
  | 'db-schema'

export interface KindMeta {
  kind: DiagramKind
  label: string
  /** What the type is for, one line. */
  purpose: string
  engine: 'graph' | 'stack' | 'cartesian' | 'radial' | 'special'
  /**
   * Per-type complexity budget from the design system's layout budget table.
   * `maxNodes` is enforced by the audit; `note` carries the limits that are not
   * a node count (depth, lanes, series, slices).
   */
  budget: { maxNodes?: number; note?: string }
  /**
   * How the audit reads this type's legend:
   *  - `nodes` — every node kind in use must appear in the legend
   *  - `custom` — the engine supplies a bespoke legend (messages, phases, WIP)
   *  - `none`  — the figure is self-evident
   */
  legend: 'nodes' | 'custom' | 'none'
  defaultSize: { w: number; h: number }
}

/**
 * The 44 visual types. `budget.max` is the per-type limit; the universal rows
 * (9 nodes, 12 arrows, 2 focal, 2 callouts) apply on top of every type.
 */
export const KINDS: KindMeta[] = [
  // ── graph family ──
  { kind: 'architecture', label: 'Architecture', purpose: 'Components + connections in one system snapshot', engine: 'graph', budget: { note: 'universal limits: 9 nodes, 12 arrows' }, legend: 'nodes', defaultSize: { w: 960, h: 520 } },
  { kind: 'architecture-delta', label: 'Architecture delta', purpose: 'Before · Changes · After topology', engine: 'graph', budget: { maxNodes: 8, note: '8 components, 10 relations, 8 ledger entries' }, legend: 'nodes', defaultSize: { w: 1040, h: 520 } },
  { kind: 'it-state', label: 'IT current-state', purpose: 'Legacy landscape by phase or department', engine: 'graph', budget: { note: 'phase or department zones' }, legend: 'nodes', defaultSize: { w: 960, h: 520 } },
  { kind: 'flowchart', label: 'Flowchart', purpose: 'Decision logic with branches', engine: 'graph', budget: { note: 'universal limits' }, legend: 'nodes', defaultSize: { w: 840, h: 560 } },
  { kind: 'sequence', label: 'Sequence', purpose: 'Time-ordered messages between actors', engine: 'graph', budget: { maxNodes: 5, note: 'max 5 lifelines, 1 combined fragment' }, legend: 'custom', defaultSize: { w: 920, h: 560 } },
  { kind: 'state', label: 'State machine', purpose: 'States + transitions + guards', engine: 'graph', budget: { note: 'universal limits' }, legend: 'nodes', defaultSize: { w: 920, h: 480 } },
  { kind: 'er', label: 'ER / data model', purpose: 'Entities + fields + relationships', engine: 'graph', budget: { maxNodes: 8, note: 'max 8 entities' }, legend: 'custom', defaultSize: { w: 960, h: 520 } },
  { kind: 'timeline', label: 'Timeline', purpose: 'Events positioned in time', engine: 'cartesian', budget: { note: 'universal limits' }, legend: 'custom', defaultSize: { w: 960, h: 360 } },
  { kind: 'swimlane', label: 'Swimlane', purpose: 'Cross-functional process with handoffs', engine: 'graph', budget: { note: 'max 5 lanes' }, legend: 'custom', defaultSize: { w: 1000, h: 520 } },
  { kind: 'quadrant', label: 'Quadrant', purpose: 'Two-axis positioning / prioritisation', engine: 'radial', budget: { maxNodes: 12, note: 'max 12 items' }, legend: 'custom', defaultSize: { w: 640, h: 640 } },
  { kind: 'radar', label: 'Radar / spider', purpose: 'Scored across 3–5 quantitative criteria', engine: 'radial', budget: { note: 'max 5 axes, 5 series, 1 focal' }, legend: 'custom', defaultSize: { w: 640, h: 560 } },
  { kind: 'polar', label: 'Polar chart', purpose: 'Cyclic magnitude · linear radius', engine: 'radial', budget: { note: 'max 8 categories, 1 series' }, legend: 'custom', defaultSize: { w: 560, h: 560 } },
  { kind: 'loop', label: 'Loop / flywheel', purpose: 'Reinforcing cycle with a shared hub', engine: 'radial', budget: { note: 'stations + one hub' }, legend: 'custom', defaultSize: { w: 680, h: 600 } },
  { kind: 'nested', label: 'Nested', purpose: 'Hierarchy through containment', engine: 'stack', budget: { note: 'max 6 nesting levels' }, legend: 'nodes', defaultSize: { w: 760, h: 520 } },
  { kind: 'tree', label: 'Tree', purpose: 'Parent → children relationships', engine: 'stack', budget: { note: 'max depth 4' }, legend: 'nodes', defaultSize: { w: 880, h: 480 } },
  { kind: 'org-chart', label: 'Org chart', purpose: 'Ownership, reporting, routing, escalation', engine: 'stack', budget: { maxNodes: 12, note: 'max 12 nodes, depth 4' }, legend: 'nodes', defaultSize: { w: 960, h: 520 } },
  { kind: 'layers', label: 'Layer stack', purpose: 'Stacked abstraction levels', engine: 'stack', budget: { maxNodes: 6, note: 'max 6 layers' }, legend: 'nodes', defaultSize: { w: 760, h: 480 } },
  { kind: 'exploded', label: 'Exploded axonometric', purpose: 'Parts pulled apart on one axis', engine: 'special', budget: { maxNodes: 5, note: '5 parts, 1 focal' }, legend: 'custom', defaultSize: { w: 720, h: 520 } },
  { kind: 'axonometric-plan', label: 'Axonometric plan', purpose: 'Rooms and buildings on one plate', engine: 'special', budget: { maxNodes: 8, note: 'max 8 tagged rooms' }, legend: 'custom', defaultSize: { w: 760, h: 540 } },
  { kind: 'venn', label: 'Venn', purpose: 'Overlap between sets', engine: 'radial', budget: { maxNodes: 3, note: 'max 3 circles' }, legend: 'custom', defaultSize: { w: 560, h: 480 } },
  { kind: 'pyramid', label: 'Pyramid / funnel', purpose: 'Ranked hierarchy or conversion drop-off', engine: 'stack', budget: { maxNodes: 6, note: 'max 6 layers' }, legend: 'nodes', defaultSize: { w: 720, h: 520 } },
  { kind: 'bar', label: 'Bar chart', purpose: 'Quantitative comparison across categories', engine: 'cartesian', budget: { maxNodes: 8, note: 'max 8 bars' }, legend: 'custom', defaultSize: { w: 760, h: 420 } },
  { kind: 'waterfall', label: 'Waterfall', purpose: 'Running total bridged by signed contributions', engine: 'cartesian', budget: { maxNodes: 8, note: '8 bars incl. totals, 1 subtotal' }, legend: 'custom', defaultSize: { w: 800, h: 440 } },
  { kind: 'treemap', label: 'Treemap', purpose: 'Part-of-whole where relative size is the story', engine: 'stack', budget: { maxNodes: 8, note: 'max 8 cells' }, legend: 'nodes', defaultSize: { w: 760, h: 460 } },
  { kind: 'heatmap', label: 'Heatmap', purpose: 'Value per row × column cell', engine: 'stack', budget: { note: 'rows × columns cells' }, legend: 'custom', defaultSize: { w: 760, h: 440 } },
  { kind: 'line', label: 'Line chart', purpose: 'Trends over time, slopegraph, ridgeline', engine: 'cartesian', budget: { note: 'max 5 series' }, legend: 'custom', defaultSize: { w: 820, h: 440 } },
  { kind: 'gantt', label: 'Gantt', purpose: 'Tasks and phases on a timeline', engine: 'cartesian', budget: { maxNodes: 12, note: 'max 12 tasks' }, legend: 'custom', defaultSize: { w: 900, h: 480 } },
  { kind: 'scatter', label: 'Scatter plot', purpose: 'Correlation / distribution; bubble + beeswarm', engine: 'cartesian', budget: { maxNodes: 30, note: 'max 30 points' }, legend: 'custom', defaultSize: { w: 760, h: 480 } },
  { kind: 'high-level', label: 'High-Level', purpose: 'End-to-end data stack on a cluster', engine: 'graph', budget: { note: 'universal limits' }, legend: 'nodes', defaultSize: { w: 1000, h: 560 } },
  { kind: 'process', label: 'Process', purpose: 'Multi-actor sequential workflow', engine: 'graph', budget: { note: 'universal limits' }, legend: 'nodes', defaultSize: { w: 1000, h: 480 } },
  { kind: 'medallion', label: 'Medallion', purpose: 'Multi-tier storage with quality levels', engine: 'stack', budget: { note: 'bronze / silver / gold tiers' }, legend: 'nodes', defaultSize: { w: 880, h: 420 } },
  { kind: 'data-flow', label: 'Data flow', purpose: 'Role-scoped pipeline steps', engine: 'graph', budget: { note: 'universal limits' }, legend: 'nodes', defaultSize: { w: 900, h: 480 } },
  { kind: 'dp-integration', label: 'DP integration', purpose: 'Sources → core → consumers', engine: 'graph', budget: { note: 'universal limits' }, legend: 'nodes', defaultSize: { w: 1000, h: 460 } },
  { kind: 'dp-security-matrix', label: 'DP security matrix', purpose: 'Per-role access permissions', engine: 'stack', budget: { note: 'roles × resources' }, legend: 'custom', defaultSize: { w: 880, h: 440 } },
  { kind: 'sankey', label: 'Sankey', purpose: 'Quantities that split and merge', engine: 'special', budget: { maxNodes: 8, note: '3 stages, 8 nodes, 12 flows' }, legend: 'custom', defaultSize: { w: 900, h: 460 } },
  { kind: 'fishbone', label: 'Fishbone', purpose: 'Grouped causes → one effect', engine: 'radial', budget: { note: '6 bones, 3 sub-causes each' }, legend: 'custom', defaultSize: { w: 960, h: 480 } },
  { kind: 'wardley', label: 'Wardley map', purpose: 'Value chain × evolution', engine: 'cartesian', budget: { maxNodes: 9, note: '9 components, 12 links, 2 movements' }, legend: 'custom', defaultSize: { w: 880, h: 520 } },
  { kind: 'kanban', label: 'Kanban', purpose: 'Work in progress by state, with WIP limits', engine: 'stack', budget: { maxNodes: 12, note: '5 columns, 4 cards each' }, legend: 'custom', defaultSize: { w: 1000, h: 480 } },
  { kind: 'journey', label: 'User journey', purpose: 'Stages, actions + sentiment', engine: 'cartesian', budget: { note: 'max 6 stages, 3 rows, 2 pain markers' }, legend: 'custom', defaultSize: { w: 960, h: 480 } },
  { kind: 'deployment', label: 'Deployment', purpose: 'Zones, hosts, artifacts, replicas, ports', engine: 'graph', budget: { maxNodes: 6, note: '3 zones, 6 nodes, 8 paths, 9 artifacts' }, legend: 'nodes', defaultSize: { w: 960, h: 520 } },
  { kind: 'dependency', label: 'Dependency graph', purpose: 'Fan-in, ranks and cycles', engine: 'graph', budget: { maxNodes: 9, note: '9 nodes, 14 edges, 4 ranks, 1 cycle' }, legend: 'nodes', defaultSize: { w: 920, h: 520 } },
  { kind: 'uml-class', label: 'UML class', purpose: 'Classes, operations + typed relations', engine: 'graph', budget: { maxNodes: 7, note: '7 classes, 8 relations, 5 members per compartment' }, legend: 'custom', defaultSize: { w: 960, h: 560 } },
  { kind: 'story-map', label: 'Story map', purpose: 'Backbone × release slices', engine: 'stack', budget: { maxNodes: 12, note: '5 activities, 3 slices, 12 cards' }, legend: 'custom', defaultSize: { w: 960, h: 480 } },
  { kind: 'db-schema', label: 'Database schema', purpose: 'Physical tables + column FKs', engine: 'graph', budget: { maxNodes: 5, note: '5 tables, 8 columns shown, 6 FKs' }, legend: 'custom', defaultSize: { w: 1000, h: 560 } },
]

export const KIND_MAP: Record<DiagramKind, KindMeta> = KINDS.reduce(
  (acc, k) => ({ ...acc, [k.kind]: k }),
  {} as Record<DiagramKind, KindMeta>,
)

/** Universal complexity limits (SKILL §7) that apply to every type. */
export const UNIVERSAL_BUDGET = {
  maxNodes: 9,
  maxArrows: 12,
  maxFocal: 2,
  maxCallouts: 2,
  targetDensity: 4,
} as const

// ─── Typography stacks ───────────────────────────────────────────────────────

export const FONT_STACK = {
  serif: "'Instrument Serif', 'Noto Serif', Georgia, serif",
  sans: "'Geist', 'Inter', ui-sans-serif, system-ui, sans-serif",
  mono: "'Geist Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace",
} as const

export function fontStack(family: 'serif' | 'sans' | 'mono'): string {
  return FONT_STACK[family]
}

/** Google Fonts href for the three editorial families. */
export const FONT_LINK =
  'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500;600&display=swap'
