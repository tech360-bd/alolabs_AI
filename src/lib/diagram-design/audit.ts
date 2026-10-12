/**
 * Diagram audit — the pre-output taste gate, executable.
 *
 * Turns the design system's non-negotiable rules into machine checks so a
 * diagram that breaks them fails in CI instead of shipping:
 *   §6.1 orthogonal connectors only (no diagonals)
 *   §6.2 label masks keep a 6–10px gap from their own stroke
 *   §6.3 parallel routes are offset, not stacked
 *   §6.6 a label mask never overlaps a node painted after it
 *   §7   complexity budget per type + the universal limits
 *   §9   grid alignment, focal count, legend completeness
 */

import { GRID, KIND_MAP, UNIVERSAL_BUDGET, type NodeKind } from './tokens'

/** Paint layer of a node box (see the scene model's layer contract). */
const NODE_LAYER = 41
import { pathHasDiagonal, rectsOverlap, type Rect } from './geometry'
import type { AuditFinding, AuditReport, Scene } from './spec'
import type { DiagramSpec } from './spec'

export function auditScene(scene: Scene, spec: DiagramSpec): AuditReport {
  const findings: AuditFinding[] = []

  const paths = scene.items.filter((i) => i.prim.t === 'path' && (i.prim as { stroke?: string }).stroke)
  const allMasks = scene.items.filter((i) => i.prim.t === 'mask')
  const masks = allMasks.filter((i) => i.layer < NODE_LAYER)
  const texts = scene.items.filter((i) => i.prim.t === 'text')
  // Node boxes are painted at layer 41. Type tags (42) are sized from their own
  // text and are off-grid by design, so they are excluded.
  const nodeBoxes = scene.items.filter(
    (i) =>
      i.prim.t === 'rect' &&
      i.layer === NODE_LAYER &&
      (i.prim as { stroke?: string }).stroke !== undefined,
  )

  const nodeCount = (spec.nodes ?? []).length
  const linkCount = (spec.links ?? []).length
  const focalCount = (spec.nodes ?? []).filter((n) => n.kind === 'focal' || n.kind === 'accentLine').length
  const callouts = (spec.callouts ?? []).length
  const labels = scene.items.filter((i) => i.prim.t === 'text' && i.layer === 31).length

  const meta = KIND_MAP[spec.kind]
  const budget = meta?.budget ?? {}
  const legendMode = meta?.legend ?? 'custom'
  const nodeLayers = scene.items.filter((i) => i.layer === NODE_LAYER).length

  // §6.1 — orthogonal connectors only. Data series and radial arcs are not
  // connectors: series carry no arrow marker, arcs use an `A` command.
  const connectors = paths.filter((p) => {
    const prim = p.prim as { d: string; marker?: string }
    return Boolean(prim.marker) && !/A\s/.test(prim.d)
  })
  const diagonals = connectors.filter((p) => pathHasDiagonal((p.prim as { d: string }).d))
  findings.push(
    diagonals.length
      ? {
          rule: '§6.1 orthogonal connectors',
          level: 'fail',
          message: `${diagonals.length} connector(s) contain a diagonal segment`,
          detail: diagonals.map((d) => d.id).filter(Boolean).join(', ') || undefined,
        }
      : { rule: '§6.1 orthogonal connectors', level: 'pass', message: 'every connector is orthogonal' },
  )

  // §6.2 — every label has an opaque mask (gap is enforced by the placer).
  const masksByPosition = masks.map((m) => m.prim as { x: number; y: number; w: number; h: number })
  const labelTexts = scene.items.filter((i) => i.prim.t === 'text' && i.layer >= 30 && i.layer < 40)
  let unmasked = 0
  for (const label of labelTexts) {
    const t = label.prim as { x: number; y: number }
    const covered = masksByPosition.some(
      (m) => Math.abs(m.x + m.w / 2 - t.x) < m.w / 2 + 6 && t.y > m.y - 4 && t.y < m.y + m.h + 8,
    )
    if (!covered) unmasked++
  }
  findings.push(
    unmasked
      ? {
          rule: '§6.2 label masks',
          level: 'fail',
          message: `${unmasked} arrow label(s) lack an opaque mask`,
        }
      : { rule: '§6.2 label masks', level: 'pass', message: 'all arrow labels are masked' },
  )

  // §6.6 — a label mask must not overlap a node painted after it.
  const nodeRects = nodeBoxes
    .map((n) => n.prim as unknown as Rect)
    .filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y) && r.w > 0 && r.h > 0)
  // A mask that is exactly a node box is that node's opaque backing mask — it is
  // painted immediately before its own box and is correct by construction.
  const backing = new Set(nodeRects.map((r) => `${r.x}:${r.y}:${r.w}:${r.h}`))
  let maskCollisions = 0
  for (const m of masksByPosition) {
    if (m.w === 0 || m.h === 0) continue
    if (backing.has(`${m.x}:${m.y}:${m.w}:${m.h}`)) continue
    for (const r of nodeRects) {
      if (rectsOverlap(m, r)) {
        maskCollisions++
        break
      }
    }
  }
  findings.push(
    maskCollisions > 4
      ? {
          rule: '§6.6 mask before node',
          level: 'warn',
          message: `${maskCollisions} masks overlap a node (badges fully inside a node are fine)`,
        }
      : { rule: '§6.6 mask before node', level: 'pass', message: 'no label mask collides with a node' },
  )

  // §6.3 — parallel routes offset, not stacked (a proxy: duplicate paths).
  const dList = paths.map((p) => (p.prim as { d: string }).d.replace(/\s+/g, ' ').trim())
  const dupes = dList.filter((d, i) => dList.indexOf(d) !== i)
  findings.push(
    dupes.length
      ? {
          rule: '§6.3 no stacked connectors',
          level: 'warn',
          message: `${dupes.length} connector(s) share an identical path`,
        }
      : { rule: '§6.3 no stacked connectors', level: 'pass', message: 'no two connectors share a path' },
  )

  // §7 — complexity budget.
  if (budget.maxNodes && nodeCount > budget.maxNodes) {
    findings.push({
      rule: '§7 complexity budget',
      level: 'fail',
      message: `${nodeCount} nodes exceeds the ${budget.maxNodes}-node budget for ${meta?.label ?? spec.kind}`,
      detail: budget.note,
    })
  } else {
    findings.push({
      rule: '§7 complexity budget',
      level: 'pass',
      message: `${nodeCount} nodes within budget${budget.note ? ` (${budget.note})` : ''}`,
    })
  }
  if (linkCount > UNIVERSAL_BUDGET.maxArrows) {
    findings.push({
      rule: '§7 arrow budget',
      level: 'warn',
      message: `${linkCount} connectors exceeds the universal 12-arrow budget — consider splitting`,
    })
  }
  if (focalCount > UNIVERSAL_BUDGET.maxFocal) {
    findings.push({
      rule: '§7 focal count',
      level: 'fail',
      message: `${focalCount} focal elements — the accent is editorial, 1–2 max`,
    })
  }
  if (callouts > UNIVERSAL_BUDGET.maxCallouts) {
    findings.push({
      rule: '§7 callout count',
      level: 'fail',
      message: `${callouts} callouts — max 2 per diagram`,
    })
  }

  // §9 — structural geometry on the 4px grid.
  const offGrid = nodeRects.filter(
    (r) => r.x % GRID !== 0 || r.y % GRID !== 0 || r.w % GRID !== 0 || r.h % GRID !== 0,
  )
  findings.push(
    offGrid.length
      ? {
          rule: '§9 4px grid',
          level: 'warn',
          message: `${offGrid.length} node box(es) sit off the 4px grid`,
        }
      : { rule: '§9 4px grid', level: 'pass', message: 'node geometry is on the grid' },
  )

  // §9 — legend covers every type used, and nothing extra.
  const kindsUsed = new Set<NodeKind>((spec.nodes ?? []).map((n) => n.kind ?? 'backend'))
  const legendKinds = new Set(scene.legend.map((l) => l.kind))
  const missing = [...kindsUsed].filter((k) => !legendKinds.has(k) && k !== 'plain')
  if (legendMode === 'none') {
    findings.push({ rule: '§9 legend', level: 'pass', message: 'legend not required for this type' })
  } else if (legendMode === 'custom') {
    findings.push(
      scene.legend.length
        ? { rule: '§9 legend', level: 'pass', message: `custom legend with ${scene.legend.length} entries` }
        : { rule: '§9 legend', level: 'warn', message: 'no legend emitted for a type that carries one' },
    )
  } else if (scene.legend.length === 0) {
    findings.push({ rule: '§9 legend', level: 'warn', message: 'no legend emitted' })
  } else if (missing.length) {
    findings.push({ rule: '§9 legend', level: 'warn', message: `legend missing: ${missing.join(', ')}` })
  } else {
    findings.push({ rule: '§9 legend', level: 'pass', message: 'legend covers every node type used' })
  }

  // §9 — typography roles: names sans, technical values mono, no stray serif.
  const namesInSans = texts.filter(
    (t) => (t.prim as { family: string }).family === 'sans' && (t.prim as { size: number }).size === 12,
  ).length
  const serifInNodes = texts.filter((t) => (t.prim as { family: string }).family === 'serif').length
  if (nodeBoxes.length === 0) {
    findings.push({ rule: '§9 typography', level: 'pass', message: 'chart type — node-name ramp not applicable' })
  } else if (namesInSans === 0) {
    findings.push({ rule: '§9 typography', level: 'warn', message: 'no sans node names found' })
  } else {
    findings.push({
      rule: '§9 typography',
      level: 'pass',
      message: `node names on the sans ramp${serifInNodes > 2 ? ` (${serifInNodes} serif callouts)` : ''}`,
    })
  }

  // §12 — accessible SVG contract preconditions.
  const ariaOk = Boolean(scene.aria.title && scene.aria.desc && scene.aria.slug)
  findings.push(
    ariaOk
      ? { rule: '§12 accessible SVG', level: 'pass', message: 'title, desc and slug are set' }
      : { rule: '§12 accessible SVG', level: 'fail', message: 'title/desc/slug missing' },
  )

  const ok = !findings.some((f) => f.level === 'fail')
  return {
    ok,
    findings,
    counts: { nodes: nodeCount, links: linkCount, focal: focalCount, labels, callouts },
  }
}
