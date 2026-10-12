/**
 * Diagram importers — redraw, not render.
 *
 * Mermaid source, draw.io XML and Excalidraw JSON are parsed as bounded *text*
 * into a small intermediate representation (nodes, edges, and a fidelity ledger).
 * The IR is then laid out by this design system's own engines. Nothing is
 * evaluated, rendered, fetched or executed: labels are inert data, `click`
 * directives and URLs are discarded, and styling from the source is ignored.
 *
 * Every import ships a ledger of what was kept, merged, simplified or dropped,
 * following the upstream `import-*.md` references.
 */

import type { DiagramKind, NodeKind } from './tokens'
import type { DiagramSpec, LinkSpec, NodeSpec, TableSpec } from './spec'

export type ImportFormat = 'mermaid' | 'drawio' | 'excalidraw'

export interface LedgerEntry {
  action: 'kept' | 'merged' | 'simplified' | 'dropped'
  detail: string
}

export interface ImportLimits {
  maxSourceChars: number
  maxNodes: number
  maxEdges: number
}

export const IMPORT_LIMITS: ImportLimits = { maxSourceChars: 200_000, maxNodes: 80, maxEdges: 160 }

/** Recoverable, user-facing failure. The message is shown verbatim. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportError'
  }
}

export interface ImportedNode {
  id: string
  name: string
  sublabel?: string
  kind: NodeKind
  shape?: NodeSpec['shape']
}

export interface ImportedEdge {
  from: string
  to: string
  label?: string
  dashed?: boolean
}

export interface ImportIR {
  grammar: string
  direction: 'vertical' | 'horizontal'
  /** Target kind for the drawn figure. */
  kind: DiagramKind
  nodes: ImportedNode[]
  edges: ImportedEdge[]
  /** ER only: entity columns. */
  tables?: TableSpec[]
  ledger: LedgerEntry[]
  sourceCounts: { nodes: number; edges: number }
}

export interface ImportResult {
  spec: DiagramSpec
  ledger: LedgerEntry[]
  grammar: string
  drawn: { nodes: number; edges: number }
  source: { nodes: number; edges: number }
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

const LABEL_MAX = 14

/** Labels are ≤14 characters, upper-cased by the renderer. Longer text is shortened and ledgered. */
function clipLabel(label: string, ledger: LedgerEntry[]): string {
  const clean = label.replace(/\s+/g, ' ').trim()
  if (clean.length <= LABEL_MAX) return clean
  ledger.push({ action: 'simplified', detail: `edge label shortened: "${clean}"` })
  return `${clean.slice(0, LABEL_MAX - 1)}…`
}

function cleanText(raw: string): string {
  return raw
    .replace(/^["']|["']$/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

/** Case-preserving: Mermaid `A` and `a` are different nodes. */
function safeId(raw: string): string {
  const id = raw.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return id || 'node'
}

function enforceLimits(source: string, ir: { nodes: unknown[]; edges: unknown[] }) {
  if (source.length > IMPORT_LIMITS.maxSourceChars) {
    throw new ImportError(`source is larger than ${IMPORT_LIMITS.maxSourceChars} characters; split the diagram or trim it`)
  }
  if (ir.nodes.length > IMPORT_LIMITS.maxNodes) {
    throw new ImportError(`${ir.nodes.length} nodes exceed the ${IMPORT_LIMITS.maxNodes}-node limit; split by container`)
  }
  if (ir.edges.length > IMPORT_LIMITS.maxEdges) {
    throw new ImportError(`${ir.edges.length} edges exceed the ${IMPORT_LIMITS.maxEdges}-edge limit; split the diagram`)
  }
}

// ─── Mermaid ─────────────────────────────────────────────────────────────────

const SUPPORTED_MERMAID = ['flowchart', 'graph', 'sequenceDiagram', 'stateDiagram-v2', 'stateDiagram', 'erDiagram']

/** Shape brackets, longest opener first so `((` wins over `(`. */
const MERMAID_SHAPES: { open: string; close: string; kind: NodeKind; shape: NodeSpec['shape'] }[] = [
  { open: '(((', close: ')))', kind: 'plain', shape: 'box' },
  { open: '((', close: '))', kind: 'input', shape: 'stadium' },
  { open: '([', close: '])', kind: 'input', shape: 'stadium' },
  { open: '[[', close: ']]', kind: 'backend', shape: 'box' },
  { open: '[(', close: ')]', kind: 'store', shape: 'box' },
  { open: '{{', close: '}}', kind: 'backend', shape: 'box' },
  { open: '[/', close: '/]', kind: 'plain', shape: 'box' },
  { open: '[\\', close: '\\]', kind: 'plain', shape: 'box' },
  { open: '{', close: '}', kind: 'focal', shape: 'decision' },
  { open: '[', close: ']', kind: 'plain', shape: 'box' },
  { open: '(', close: ')', kind: 'plain', shape: 'box' },
  { open: '>', close: ']', kind: 'plain', shape: 'box' },
]

const V11_SHAPE_MAP: Record<string, { kind: NodeKind; shape: NodeSpec['shape'] }> = {
  cyl: { kind: 'store', shape: 'box' },
  database: { kind: 'store', shape: 'box' },
  diam: { kind: 'focal', shape: 'decision' },
  circle: { kind: 'input', shape: 'stadium' },
  stadium: { kind: 'input', shape: 'stadium' },
  doc: { kind: 'plain', shape: 'box' },
  rect: { kind: 'plain', shape: 'box' },
  rounded: { kind: 'plain', shape: 'box' },
}

function mermaidLines(source: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = []
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  let i = 0
  // Frontmatter block (title / config) is skipped.
  if (lines[0]?.trim() === '---') {
    i = 1
    while (i < lines.length && lines[i].trim() !== '---') i++
    i++
  }
  for (; i < lines.length; i++) {
    const raw = lines[i].replace(/\t/g, '  ')
    const text = raw.trim()
    if (!text || text.startsWith('%%')) continue
    out.push({ text, line: i + 1 })
  }
  return out
}

interface MermaidBlock {
  grammar: string
  lines: { text: string; line: number }[]
}

/** Split Markdown fences and raw sources into diagram blocks. */
export function mermaidBlocks(source: string): MermaidBlock[] {
  const fenced = [...source.matchAll(/```mermaid\s*\n([\s\S]*?)```/g)].map((m) => m[1])
  const raw = fenced.length ? fenced : [source]
  return raw.map((body) => {
    const lines = mermaidLines(body)
    const header = lines[0]?.text ?? ''
    const grammar = SUPPORTED_MERMAID.find((g) => header.startsWith(g)) ?? header.split(/\s+/)[0] ?? ''
    return { grammar, lines }
  })
}

function parseMermaidShape(rest: string): { name?: string; kind?: NodeKind; shape?: NodeSpec['shape'] } {
  const v11 = rest.match(/^@\{(.*)\}$/)
  if (v11) {
    const body = v11[1]
    const shape = body.match(/shape:\s*([\w-]+)/)?.[1]
    const label = body.match(/label:\s*("[^"]*"|'[^']*'|[^,}]+)/)?.[1]
    const mapped = shape ? V11_SHAPE_MAP[shape] : undefined
    return { name: label ? cleanText(label) : undefined, kind: mapped?.kind, shape: mapped?.shape }
  }
  for (const s of MERMAID_SHAPES) {
    if (rest.startsWith(s.open) && rest.endsWith(s.close) && rest.length >= s.open.length + s.close.length) {
      return { name: cleanText(rest.slice(s.open.length, rest.length - s.close.length)), kind: s.kind, shape: s.shape }
    }
  }
  return { name: cleanText(rest) }
}

function parseMermaidFlowchart(lines: { text: string; line: number }[], ledger: LedgerEntry[]) {
  const header = lines[0].text
  const dir = header.match(/^(?:flowchart|graph)\s+(TD|TB|BT|LR|RL)/)?.[1]
  const direction: ImportIR['direction'] = dir === 'LR' || dir === 'RL' ? 'horizontal' : 'vertical'
  const nodes = new Map<string, ImportedNode>()
  const edges: ImportedEdge[] = []
  let subgraphs = 0
  let styling = 0
  let clicks = 0

  const ensureNode = (id: string) => {
    if (!nodes.has(id)) nodes.set(id, { id, name: id, kind: 'plain' })
    return nodes.get(id)!
  }

  const defineNode = (token: string): string | null => {
    const piece = token.replace(/:::[\w-]+/g, '').replace(/;\s*$/, '').trim()
    const m = piece.match(/^([A-Za-z0-9_][\w.-]*)\s*(.*)$/)
    if (!m) return null
    const rawId = m[1]
    const rest = m[2].trim()
    const id = rawId
    const node = ensureNode(id)
    if (rest) {
      const parsed = parseMermaidShape(rest)
      if (parsed.name) node.name = parsed.name
      if (parsed.kind) node.kind = parsed.kind
      if (parsed.shape) node.shape = parsed.shape
    }
    return id
  }

  const EDGE_SPLIT = /\s*(<-->|-\.->|-\.-|==>|===|-->|---|--o|--x)\s*(?:\|([^|]*)\|)?\s*/

  for (const { text, line } of lines.slice(1)) {
    if (/^subgraph\b/.test(text)) {
      subgraphs++
      continue
    }
    if (/^end$/.test(text)) continue
    if (/^direction\b/.test(text)) continue
    if (/^classDef\b|^class\b|^style\b|^linkStyle\b/.test(text)) {
      styling++
      continue
    }
    if (/^click\b/.test(text)) {
      clicks++
      continue
    }

    // Normalise the label forms into `op|label|` so one splitter handles them all.
    const s = text
      .replace(/--\s+("?)(.+?)\1\s+-->/g, (_m, _q, t) => `-->|${t}|`)
      .replace(/--\s+("?)(.+?)\1\s+---/g, (_m, _q, t) => `---|${t}|`)
      .replace(/==\s+(.+?)\s+==>/g, (_m, t) => `==>|${t}|`)
      .replace(/-\.\s+(.+?)\s+\.->/g, (_m, t) => `-.->|${t}|`)
      .replace(/--([^->|]+?)-->/g, (_m, t) => `-->|${t}|`)

    if (!EDGE_SPLIT.test(s)) {
      // Standalone node statement (possibly several `&`-joined nodes).
      for (const piece of s.split('&')) {
        if (!piece.trim()) continue
        if (defineNode(piece) === null) throw new ImportError(`malformed node at line ${line}`)
      }
      continue
    }

    const parts = s.split(new RegExp(EDGE_SPLIT.source, 'g'))
    // parts: [seg, op, label, seg, op, label, seg, ...]
    let prev: string[] | null = null
    for (let i = 0; i < parts.length; i += 3) {
      const seg = parts[i]
      if (!seg || !seg.trim()) throw new ImportError(`malformed edge at line ${line}`)
      const ids = seg
        .split('&')
        .map((p) => defineNode(p))
      if (ids.some((x) => x === null)) throw new ImportError(`malformed edge at line ${line}`)
      const current = ids as string[]
      if (prev) {
        const op = parts[i - 2]
        const label = parts[i - 1]?.trim() || undefined
        for (const a of prev) {
          for (const b of current) {
            edges.push({
              from: a,
              to: b,
              label: label ? clipLabel(cleanText(label), ledger) : undefined,
              dashed: op === '-.->' || op === '-.-',
            })
          }
        }
      }
      prev = current
    }
  }

  if (subgraphs) ledger.push({ action: 'merged', detail: `${subgraphs} subgraph container(s) flattened into the flow` })
  if (styling) ledger.push({ action: 'dropped', detail: `${styling} styling directive(s) discarded (classDef, class, style, linkStyle)` })
  if (clicks) ledger.push({ action: 'dropped', detail: `${clicks} click directive(s) discarded; targets were never opened` })
  return { nodes: [...nodes.values()], edges, direction }
}

function parseMermaidSequence(lines: { text: string; line: number }[], ledger: LedgerEntry[]) {
  const nodes = new Map<string, ImportedNode>()
  const edges: ImportedEdge[] = []
  const dropped = new Set<string>()
  const ensure = (id: string, name?: string) => {
    if (!nodes.has(id)) nodes.set(id, { id, name: name ?? id, kind: 'plain' })
    else if (name) nodes.get(id)!.name = name
    return id
  }
  const MSG = /^(\S+?)\s*(-->>|--x|--\)|->>|-x|-\)|-->|->)\s*[+-]?\s*(\S+?)\s*:\s*(.*)$/
  const PART = /^(participant|actor)\s+(\S+?)(?:\s+as\s+(.+))?$/
  for (const { text } of lines.slice(1)) {
    const part = text.match(PART)
    if (part) {
      ensure(part[2], part[3] ? cleanText(part[3]) : undefined)
      continue
    }
    const msg = text.match(MSG)
    if (msg) {
      const from = ensure(msg[1])
      const to = ensure(msg[3])
      const label = msg[4].trim()
      edges.push({
        from,
        to,
        label: label ? clipLabel(cleanText(label), ledger) : undefined,
        dashed: msg[2].startsWith('--'),
      })
      continue
    }
    const keyword = text.split(/\s+/)[0]
    if (/^(Note|loop|alt|else|opt|par|and|rect|critical|break|end|activate|deactivate|autonumber|box|create|destroy)$/i.test(keyword)) {
      dropped.add(keyword.toLowerCase())
      continue
    }
    // Unknown directives (title, accTitle, box colours…) are kept out of the figure and ledgered.
    dropped.add(keyword.toLowerCase())
  }
  if (dropped.size) {
    ledger.push({ action: 'simplified', detail: `fragments and notes flattened or dropped: ${[...dropped].join(', ')}` })
  }
  return { nodes: [...nodes.values()], edges, direction: 'horizontal' as const }
}

function parseMermaidState(lines: { text: string; line: number }[], ledger: LedgerEntry[]) {
  const nodes = new Map<string, ImportedNode>()
  const edges: ImportedEdge[] = []
  let composites = 0
  const ensure = (id: string, kind: NodeKind = 'plain', name?: string) => {
    if (!nodes.has(id)) nodes.set(id, { id, name: name ?? id, kind })
    else if (name) nodes.get(id)!.name = name
    return id
  }
  for (const { text } of lines.slice(1)) {
    if (/^note\b/.test(text) || text === '}') continue
    const alias = text.match(/^state\s+"([^"]+)"\s+as\s+(\S+)$/)
    if (alias) {
      ensure(alias[2], 'plain', cleanText(alias[1]))
      continue
    }
    if (/^state\s+\S+\s*\{$/.test(text)) {
      composites++
      continue
    }
    const trans = text.match(/^(\[\*\]|\S+?)\s*-->\s*(\[\*\]|\S+?)\s*(?::\s*(.*))?$/)
    if (trans) {
      const from = trans[1] === '[*]' ? ensure('start', 'input', 'Start') : ensure(trans[1])
      const to = trans[2] === '[*]' ? ensure('end', 'input', 'End') : ensure(trans[2])
      const label = trans[3]?.trim()
      edges.push({ from, to, label: label ? clipLabel(cleanText(label), ledger) : undefined })
      continue
    }
    const described = text.match(/^(\S+?)\s*:\s*(.+)$/)
    if (described) {
      ensure(described[1], 'plain', cleanText(described[2]))
      continue
    }
    const bare = text.match(/^(\S+)$/)
    if (bare) {
      ensure(bare[1])
      continue
    }
    throw new ImportError(`malformed state at line ${text}`)
  }
  if (composites) ledger.push({ action: 'merged', detail: `${composites} composite state(s) flattened` })
  return { nodes: [...nodes.values()], edges, direction: 'vertical' as const }
}

function cardinality(marker: string): string {
  const many = /[{}]/.test(marker)
  const optional = marker.includes('o')
  if (many) return optional ? '0..N' : '1..N'
  return optional ? '0..1' : '1'
}

function parseMermaidEr(lines: { text: string; line: number }[], ledger: LedgerEntry[]) {
  const entities = new Map<string, TableSpec>()
  const edges: ImportedEdge[] = []
  const ensureEntity = (name: string) => {
    if (!entities.has(name)) entities.set(name, { id: safeId(name), name, columns: [] })
    return entities.get(name)!
  }
  let open: TableSpec | null = null
  for (const { text } of lines.slice(1)) {
    if (open) {
      if (text === '}') {
        open = null
        continue
      }
      const col = text.match(/^(\S+)\s+(\S+)(?:\s+(PK|FK|UK)(?:\s*,\s*(PK|FK|UK))?)?/)
      if (col) {
        const flags = [col[3], col[4]].filter(Boolean)
        open.columns.push({
          name: col[2],
          type: col[1],
          pk: flags.includes('PK') || undefined,
          fk: flags.includes('FK') ? '→' : undefined,
        })
      }
      continue
    }
    const block = text.match(/^(\S+)\s*\{$/)
    if (block) {
      open = ensureEntity(block[1])
      continue
    }
    const rel = text.match(/^(\S+)\s+([|o}{]{2}(?:--|\.\.)[|o}{]{2})\s+(\S+)\s*(?::\s*(.*))?$/)
    if (rel) {
      const left = ensureEntity(rel[1])
      const right = ensureEntity(rel[3])
      const [lm, rm] = [rel[2].slice(0, 2), rel[2].slice(-2)]
      const card = `${cardinality(lm)} : ${cardinality(rm)}`
      const label = rel[4]?.trim()
      edges.push({
        from: left.id,
        to: right.id,
        label: clipLabel(label ? `${label}` : card, ledger),
      })
      continue
    }
    throw new ImportError(`malformed relationship at line ${text}`)
  }
  const tables = [...entities.values()]
  const nodes: ImportedNode[] = tables.map((t) => ({ id: t.id, name: t.name, kind: 'plain' as NodeKind }))
  // Entity ids are safe slugs; edges reference the same ids.
  return { nodes, edges, tables, direction: 'vertical' as const }
}

export function parseMermaid(source: string, opts: { diagram?: number } = {}): ImportIR {
  if (!source.trim()) throw new ImportError('no Mermaid source to import')
  const blocks = mermaidBlocks(source)
  const index = opts.diagram ?? 0
  const block = blocks[index]
  if (!block) throw new ImportError('no fenced mermaid block found')
  if (!SUPPORTED_MERMAID.includes(block.grammar)) {
    throw new ImportError(
      `unsupported Mermaid kind "${block.grammar || 'unknown'}"; supported: flowchart, graph, sequenceDiagram, stateDiagram-v2, erDiagram`,
    )
  }
  const ledger: LedgerEntry[] = []
  let parsed: { nodes: ImportedNode[]; edges: ImportedEdge[]; direction: ImportIR['direction']; tables?: TableSpec[] }
  let kind: DiagramKind
  if (block.grammar === 'flowchart' || block.grammar === 'graph') {
    parsed = parseMermaidFlowchart(block.lines, ledger)
    kind = 'flowchart'
  } else if (block.grammar === 'sequenceDiagram') {
    parsed = parseMermaidSequence(block.lines, ledger)
    kind = 'sequence'
  } else if (block.grammar.startsWith('stateDiagram')) {
    parsed = parseMermaidState(block.lines, ledger)
    kind = 'state'
  } else {
    parsed = parseMermaidEr(block.lines, ledger)
    kind = 'er'
  }
  enforceLimits(source, { nodes: parsed.nodes, edges: parsed.edges })
  return {
    grammar: block.grammar,
    direction: parsed.direction,
    kind,
    nodes: parsed.nodes,
    edges: parsed.edges,
    tables: parsed.tables,
    ledger,
    sourceCounts: { nodes: parsed.nodes.length, edges: parsed.edges.length },
  }
}

// ─── draw.io ─────────────────────────────────────────────────────────────────

function xmlDecode(s: string): string {
  return s
    .replace(/&#xa;|&#10;/gi, ' ')
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function xmlAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of raw.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1]] = xmlDecode(m[2])
  return out
}

export function parseDrawio(source: string): ImportIR {
  if (!source.trim()) throw new ImportError('no draw.io XML to import')
  if (!/<mxfile\b|<mxGraphModel\b/.test(source)) throw new ImportError('not a draw.io file: expected <mxfile> or <mxGraphModel>')
  const ledger: LedgerEntry[] = []
  const pages = [...source.matchAll(/<diagram\b[^>]*>([\s\S]*?)<\/diagram>/g)]
  if (pages.length > 1) ledger.push({ action: 'dropped', detail: `${pages.length - 1} additional page(s) not imported; first page drawn` })
  let body = pages.length ? pages[0][1] : source
  if (/<diagram\b/.test(source) && !/<mxGraphModel\b/.test(body) && !/<mxCell\b/.test(body)) {
    throw new ImportError('compressed draw.io pages are not supported; export the diagram uncompressed (File → Export → XML)')
  }

  type Cell = { id: string; value: string; style: string; vertex: boolean; edge: boolean; source?: string; target?: string; parent?: string }
  const cells: Cell[] = []
  const geometry = new Map<string, { x: number; y: number; w: number; h: number }>()
  for (const m of body.matchAll(/<mxCell\b([^>]*?)(\/>|>([\s\S]*?)<\/mxCell>)/g)) {
    const a = xmlAttrs(m[1])
    const inner = m[3] ?? ''
    const cell: Cell = {
      id: a.id ?? '',
      value: cleanText(a.value ?? ''),
      style: a.style ?? '',
      vertex: a.vertex === '1',
      edge: a.edge === '1',
      source: a.source,
      target: a.target,
      parent: a.parent,
    }
    cells.push(cell)
    const g = inner.match(/<mxGeometry\b([^>]*)\/?>/)
    if (g) {
      const ga = xmlAttrs(g[1])
      geometry.set(cell.id, { x: Number(ga.x ?? 0), y: Number(ga.y ?? 0), w: Number(ga.width ?? 0), h: Number(ga.height ?? 0) })
    }
  }

  const containers = new Set(cells.filter((c) => /container=1|swimlane|group/.test(c.style)).map((c) => c.id))
  const parents = new Set(cells.map((c) => c.parent).filter(Boolean) as string[])
  const nodes: ImportedNode[] = []
  const nodeIds = new Set<string>()
  const skippedContainers: string[] = []
  for (const c of cells) {
    if (!c.vertex || !c.id || c.id === '0' || c.id === '1') continue
    if (containers.has(c.id) || parents.has(c.id)) {
      if (c.value) skippedContainers.push(c.value)
      continue
    }
    if (!c.value) continue
    let kind: NodeKind = 'plain'
    let shape: NodeSpec['shape'] = 'box'
    if (/rhombus/.test(c.style)) {
      kind = 'focal'
      shape = 'decision'
    } else if (/shape=cylinder/.test(c.style)) {
      kind = 'store'
    } else if (/ellipse|shape=circle/.test(c.style)) {
      kind = 'input'
      shape = 'stadium'
    }
    nodes.push({ id: safeId(c.id), name: c.value, kind, shape })
    nodeIds.add(c.id)
  }
  if (skippedContainers.length) {
    ledger.push({ action: 'merged', detail: `${skippedContainers.length} container(s) collapsed; their children are kept` })
  }

  const edges: ImportedEdge[] = []
  let unbound = 0
  for (const c of cells) {
    if (!c.edge) continue
    if (!c.source || !c.target || !nodeIds.has(c.source) || !nodeIds.has(c.target)) {
      unbound++
      continue
    }
    edges.push({
      from: safeId(c.source),
      to: safeId(c.target),
      label: c.value ? clipLabel(c.value, ledger) : undefined,
      dashed: /dashed=1/.test(c.style),
    })
  }
  if (unbound) ledger.push({ action: 'dropped', detail: `${unbound} unconnected connector(s) dropped` })

  // Layout hint: draw.io orientation from the page's dominant spread.
  const xs = [...geometry.values()].map((g) => g.x)
  const ys = [...geometry.values()].map((g) => g.y)
  const spreadX = xs.length ? Math.max(...xs) - Math.min(...xs) : 0
  const spreadY = ys.length ? Math.max(...ys) - Math.min(...ys) : 0
  const direction: ImportIR['direction'] = spreadX > spreadY * 1.5 ? 'horizontal' : 'vertical'

  // Duplicate ids can only come from odd exports; keep the first.
  const unique = [...new Map(nodes.map((n) => [n.id, n] as const)).values()]
  enforceLimits(source, { nodes: unique, edges })
  return {
    grammar: 'drawio',
    direction,
    kind: 'flowchart',
    nodes: unique,
    edges,
    ledger,
    sourceCounts: { nodes: unique.length, edges: edges.length + unbound },
  }
}

// ─── Excalidraw ──────────────────────────────────────────────────────────────

interface ExcalElement {
  id: string
  type: string
  isDeleted?: boolean
  containerId?: string | null
  text?: string
  originalText?: string
  startBinding?: { elementId: string } | null
  endBinding?: { elementId: string } | null
  strokeStyle?: string
}

export function parseExcalidraw(source: string): ImportIR {
  if (!source.trim()) throw new ImportError('no Excalidraw JSON to import')
  let data: { elements?: ExcalElement[] }
  try {
    data = JSON.parse(source)
  } catch {
    throw new ImportError('not valid Excalidraw JSON')
  }
  if (!Array.isArray(data.elements)) throw new ImportError('not an Excalidraw file: "elements" array missing')
  const ledger: LedgerEntry[] = []
  const els = data.elements.filter((e) => e && !e.isDeleted)

  // Labels: text elements bound to a container (shape or arrow).
  const labelOf = new Map<string, string>()
  let freeText = 0
  for (const e of els) {
    if (e.type !== 'text') continue
    const raw = e.text ?? e.originalText ?? ''
    if (e.containerId) labelOf.set(e.containerId, cleanText(raw))
    else freeText++
  }
  if (freeText) ledger.push({ action: 'dropped', detail: `${freeText} free text element(s) not bound to a shape (annotations) not drawn` })

  const SHAPES: Record<string, { kind: NodeKind; shape: NodeSpec['shape'] }> = {
    rectangle: { kind: 'plain', shape: 'box' },
    diamond: { kind: 'focal', shape: 'decision' },
    ellipse: { kind: 'input', shape: 'stadium' },
  }
  const nodes: ImportedNode[] = []
  const nodeEls = new Set<string>()
  for (const e of els) {
    const shape = SHAPES[e.type]
    if (!shape) continue
    const name = labelOf.get(e.id)
    if (!name) continue
    nodes.push({ id: safeId(e.id), name, kind: shape.kind, shape: shape.shape })
    nodeEls.add(e.id)
  }

  const edges: ImportedEdge[] = []
  let loose = 0
  let decorative = 0
  for (const e of els) {
    if (e.type === 'arrow') {
      const from = e.startBinding?.elementId
      const to = e.endBinding?.elementId
      if (!from || !to || !nodeEls.has(from) || !nodeEls.has(to)) {
        loose++
        continue
      }
      const label = labelOf.get(e.id)
      edges.push({
        from: safeId(from),
        to: safeId(to),
        label: label ? clipLabel(label, ledger) : undefined,
        dashed: e.strokeStyle === 'dashed',
      })
    } else if (e.type === 'line' || e.type === 'freedraw') {
      decorative++
    }
  }
  if (loose) ledger.push({ action: 'dropped', detail: `${loose} arrow(s) dropped: an end was unbound or its shape had no label` })
  if (decorative) ledger.push({ action: 'dropped', detail: `${decorative} freehand stroke(s) or line(s) discarded (not connectors)` })
  const unsupported = new Set(els.map((e) => e.type).filter((t) => !SHAPES[t] && !['arrow', 'text', 'line', 'freedraw'].includes(t)))
  if (unsupported.size) ledger.push({ action: 'dropped', detail: `unsupported element types discarded: ${[...unsupported].join(', ')}` })

  enforceLimits(source, { nodes, edges })
  return {
    grammar: 'excalidraw',
    direction: 'vertical',
    kind: 'flowchart',
    nodes,
    edges,
    ledger,
    sourceCounts: { nodes: nodes.length, edges: edges.length + loose },
  }
}

// ─── IR → DiagramSpec ────────────────────────────────────────────────────────

const TITLE_FALLBACK: Record<ImportFormat, string> = {
  mermaid: 'Imported Mermaid diagram',
  drawio: 'Imported draw.io diagram',
  excalidraw: 'Imported Excalidraw diagram',
}

/** Build the drawable spec. The result is an ordinary DiagramSpec; layout is the engine's. */
export function irToSpec(ir: ImportIR, format: ImportFormat, opts: { slug: string; title?: string }): DiagramSpec {
  const links: LinkSpec[] = ir.edges.map((e, i) => ({
    id: `e${i}`,
    from: e.from,
    to: e.to,
    label: e.label,
    dashed: e.dashed,
  }))
  const title = opts.title?.trim() || TITLE_FALLBACK[format]
  const base = {
    slug: safeId(opts.slug),
    title,
    desc: `Redrawn from ${ir.grammar} source: ${ir.nodes.length} nodes and ${ir.edges.length} connections.`,
    eyebrow: `IMPORTED · ${ir.grammar.toUpperCase()}`,
    header: true,
    direction: ir.direction,
  }
  if (ir.kind === 'er') {
    return { ...base, kind: 'er', tables: ir.tables ?? [], links }
  }
  if (ir.kind === 'sequence') {
    return { ...base, kind: 'sequence', nodes: ir.nodes, links }
  }
  if (ir.kind === 'state') {
    return { ...base, kind: 'state', nodes: ir.nodes, links }
  }
  return { ...base, kind: 'flowchart', nodes: ir.nodes.map((n) => ({ ...n })), links }
}

/** Parse, redraw and return the spec plus the fidelity ledger. */
export function importDiagram(
  format: ImportFormat,
  source: string,
  opts: { slug?: string; title?: string; diagram?: number } = {},
): ImportResult {
  const ir =
    format === 'mermaid' ? parseMermaid(source, { diagram: opts.diagram }) : format === 'drawio' ? parseDrawio(source) : parseExcalidraw(source)
  const spec = irToSpec(ir, format, { slug: opts.slug ?? `imported-${format}`, title: opts.title })
  const drawn = { nodes: ir.nodes.length, edges: ir.edges.length }
  const ledger: LedgerEntry[] = [
    { action: 'kept', detail: `${ir.sourceCounts.nodes} source node(s) → ${drawn.nodes} drawn` },
    { action: 'kept', detail: `${ir.sourceCounts.edges} source connection(s) → ${drawn.edges} drawn` },
    ...ir.ledger,
  ]
  return { spec, ledger, grammar: ir.grammar, drawn, source: ir.sourceCounts }
}
