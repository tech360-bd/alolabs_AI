/**
 * Diagram renderer — dispatches a spec to its engine and audits the result.
 *
 * `renderDiagram` is the single entry point: give it a spec, get back a Scene
 * (plain data) that the React canvas, the SVG exporter and the audit all read.
 */

import { KIND_MAP, RADIUS, resolveSkin, TOKENS, type DiagramKind } from './tokens'
import { renderGraph } from './engines/graph'
import {
  renderHeatmap,
  renderKanban,
  renderLayers,
  renderMedallion,
  renderNested,
  renderPyramid,
  renderSecurityMatrix,
  renderStoryMap,
  renderTreemap,
  renderTree,
} from './engines/stack'
import {
  renderBar,
  renderGantt,
  renderJourney,
  renderLine,
  renderScatter,
  renderTimeline,
  renderWaterfall,
  renderWardley,
} from './engines/cartesian'
import { renderFishbone, renderLoop, renderPolar, renderQuadrant, renderRadar, renderVenn } from './engines/radial'
import { renderSequence } from './engines/sequence'
import { renderSchema } from './engines/schema'
import { renderAxonometricPlan, renderExploded, renderSankey } from './engines/special'
import { SceneBuilder } from './scene'
import { auditScene } from './audit'
import type { DiagramSpec, Scene } from './spec'

const GRAPH_KINDS: DiagramKind[] = [
  'architecture',
  'architecture-delta',
  'it-state',
  'state',
  'high-level',
  'process',
  'data-flow',
  'dependency',
  'deployment',
  'dp-integration',
]

export function renderDiagram(spec: DiagramSpec): Scene {
  const theme = spec.theme ?? 'light'
  const variant = spec.variant ?? 'minimal'
  const skin = spec.skin ?? 'editorial'
  const meta = KIND_MAP[spec.kind]
  const size = spec.size ?? meta?.defaultSize ?? { w: 880, h: 480 }

  const b = new SceneBuilder({
    width: size.w,
    height: size.h,
    theme,
    variant,
    skin,
    tokens: resolveSkin(skin, theme),
    legendMode: meta?.legend ?? 'custom',
    background: spec.background ?? 'paper',
    aria: { title: spec.title, desc: spec.desc, slug: spec.slug },
  })

  const kind = spec.kind
  if (GRAPH_KINDS.includes(kind)) {
    renderGraph(spec, b, {
      direction: spec.direction,
      decisions: false,
      zones: (spec.zones ?? []).length > 0,
      backwardDashed: true,
    })
  } else if (kind === 'flowchart') {
    renderGraph(spec, b, { direction: spec.direction ?? 'vertical', decisions: true, backwardDashed: false })
  } else if (kind === 'swimlane') {
    renderSwimlane(spec, b)
  } else if (kind === 'sequence') {
    renderSequence(spec, b)
    return finish(b, spec)
  } else if (kind === 'er' || kind === 'db-schema') {
    renderSchema(spec, b, 'table')
  } else if (kind === 'uml-class') {
    renderSchema(spec, b, 'class')
  } else if (kind === 'layers') {
    renderLayers(spec, b)
  } else if (kind === 'nested') {
    renderNested(spec, b)
  } else if (kind === 'medallion') {
    renderMedallion(spec, b)
  } else if (kind === 'pyramid') {
    renderPyramid(spec, b)
  } else if (kind === 'kanban') {
    renderKanban(spec, b)
  } else if (kind === 'treemap') {
    renderTreemap(spec, b)
  } else if (kind === 'heatmap') {
    renderHeatmap(spec, b)
  } else if (kind === 'dp-security-matrix') {
    renderSecurityMatrix(spec, b)
  } else if (kind === 'story-map') {
    renderStoryMap(spec, b)
  } else if (kind === 'tree') {
    renderTree(spec, b, { org: false })
  } else if (kind === 'org-chart') {
    renderTree(spec, b, { org: true })
  } else if (kind === 'bar') {
    renderBar(spec, b)
  } else if (kind === 'line') {
    renderLine(spec, b)
  } else if (kind === 'scatter') {
    renderScatter(spec, b)
  } else if (kind === 'gantt') {
    renderGantt(spec, b)
  } else if (kind === 'timeline') {
    renderTimeline(spec, b)
  } else if (kind === 'waterfall') {
    renderWaterfall(spec, b)
  } else if (kind === 'journey') {
    renderJourney(spec, b)
  } else if (kind === 'wardley') {
    renderWardley(spec, b)
  } else if (kind === 'quadrant') {
    renderQuadrant(spec, b)
  } else if (kind === 'radar') {
    renderRadar(spec, b)
  } else if (kind === 'polar') {
    renderPolar(spec, b)
  } else if (kind === 'loop') {
    renderLoop(spec, b)
  } else if (kind === 'venn') {
    renderVenn(spec, b)
  } else if (kind === 'fishbone') {
    renderFishbone(spec, b)
  } else if (kind === 'exploded') {
    renderExploded(spec, b)
  } else if (kind === 'axonometric-plan') {
    renderAxonometricPlan(spec, b)
  } else if (kind === 'sankey') {
    renderSankey(spec, b)
  } else {
    renderGraph(spec, b, { direction: spec.direction })
  }

  // Editorial callouts — italic serif asides, max 2.
  const callouts = (spec.callouts ?? []).slice(0, 2)
  const leaders: { from: { x: number; y: number }; target: string }[] = []
  callouts.forEach((note, i) => {
    const x = note.at === 'start' ? 40 : note.at === 'end' ? size.w - 40 : size.w / 2
    const anchor = note.at === 'start' ? 'start' : note.at === 'end' ? 'end' : 'middle'
    const y = size.h - 12 - i * 24
    b.callout(x, y, note.text, { anchor, rule: !note.target })
    if (note.target) {
      // Leader starts just above the note's text, near its anchor edge.
      const fx = anchor === 'start' ? x + 12 : anchor === 'end' ? x - 12 : x
      leaders.push({ from: { x: fx, y: y - 14 }, target: note.target })
    }
  })

  return finish(b, spec, leaders)
}

/**
 * Swimlane — a lane per actor, steps laid left→right inside their lane, with
 * handoffs routed as orthogonal elbows.
 */
function renderSwimlane(spec: DiagramSpec, b: SceneBuilder) {
  const lanes = spec.zones ?? []
  const nodes = spec.nodes ?? []
  const laneH = Math.floor((b.height - 96) / Math.max(lanes.length, 1))
  const rects = new Map<string, { x: number; y: number; w: number; h: number }>()

  lanes.forEach((lane, li) => {
    const y = 40 + li * laneH
    b.zone({ x: 32, y, w: b.width - 64, h: laneH - 12 }, lane.label, { kind: 'lane', id: lane.id })
    const members = nodes.filter((n) => n.zone === lane.id)
    const step = (b.width - 96) / Math.max(members.length, 1)
    members.forEach((n, ni) => {
      const w = 152
      const r = {
        x: Math.round(48 + ni * step + (step - w) / 2),
        y: Math.round(y + laneH / 2 - 36),
        w,
        h: 56,
      }
      rects.set(n.id, r)
    })
  })

  for (const l of spec.links ?? []) {
    const a = rects.get(l.from)
    const c = rects.get(l.to)
    if (!a || !c) continue
    const sameLane = Math.abs(a.y - c.y) < 8
    b.link(a, c, {
      role: l.role ?? (sameLane ? 'default' : 'link'),
      label: l.label,
      dashed: l.dashed,
      fromSide: sameLane ? (c.x > a.x ? 'right' : 'left') : 'bottom',
      toSide: sameLane ? (c.x > a.x ? 'left' : 'right') : 'top',
      labelOrientation: sameLane ? 'h' : 'v',
    })
  }

  for (const n of nodes) {
    const r = rects.get(n.id)
    if (!r) continue
    b.node(r, { id: n.id, name: n.name, sublabel: n.sublabel, tag: n.tag, kind: n.kind })
  }
  b.legendFromSpec([
    { kind: 'store', label: 'Step' },
    { kind: 'focal', label: 'Focal step' },
    { kind: 'arrow-link', label: 'Handoff' },
  ])
}

function finish(
  b: SceneBuilder,
  spec: DiagramSpec,
  leaders: { from: { x: number; y: number }; target: string }[] = [],
): Scene {
  // Leaders need the target node's box, which only exists once the scene is built.
  for (const l of leaders) {
    const box = b.peekItems().find((i) => i.id === l.target && i.prim.t === 'rect')
    if (!box || box.prim.t !== 'rect') continue
    const to = { x: box.prim.x + box.prim.w / 2, y: box.prim.y + box.prim.h + 3 }
    b.leader(l.from, to)
  }
  const scene = b.build()
  scene.audit = auditScene(scene, spec)
  return scene
}

/** Convenience for callers that only need the audit verdict. */
export function auditSpec(spec: DiagramSpec) {
  const scene = renderDiagram(spec)
  return scene.audit!
}

export { RADIUS, TOKENS }
