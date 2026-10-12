/**
 * Token view-model for the design-system page.
 *
 * Re-exports the single source of truth (`@/lib/diagram-design/tokens`) and adds
 * the two preview tables the reference page renders, so the page never inlines
 * a hex value the system doesn't already own.
 */

import {
  FONT_STACK,
  KINDS,
  RADIUS,
  STROKE,
  TOKENS,
  TYPE_RAMP,
  nodeTreatment,
  type NodeKind,
} from '@/lib/diagram-design/tokens'

export { KINDS, RADIUS, STROKE, TOKENS }

const PREVIEW_KINDS: { kind: NodeKind; role: string; name: string }[] = [
  { kind: 'focal', role: 'Focal · 1–2 max', name: 'Orchestrator' },
  { kind: 'backend', role: 'Backend / service', name: 'Gateway' },
  { kind: 'store', role: 'Store / state', name: 'Postgres' },
  { kind: 'input', role: 'Input / user', name: 'Webhook' },
  { kind: 'external', role: 'External / cloud', name: 'Model router' },
  { kind: 'optional', role: 'Optional / async', name: 'Retry queue' },
  { kind: 'security', role: 'Trust boundary', name: 'Approval gate' },
  { kind: 'plain', role: 'Container / group', name: 'Zone' },
]

export const NODE_TREATMENT_PREVIEW = PREVIEW_KINDS.map((p) => {
  const treat = nodeTreatment(p.kind, TOKENS.light)
  return {
    ...p,
    fill: treat.fill === 'transparent' ? 'none' : treat.fill,
    stroke: treat.stroke,
    strokeWidth: treat.strokeWidth,
    dash: treat.dash,
  }
})

const SAMPLE: Record<string, { sample: string; uppercase?: boolean; italic?: boolean }> = {
  title: { sample: 'AgentOS request path' },
  pageEyebrow: { sample: 'System architecture', uppercase: true },
  nodeName: { sample: 'Orchestrator' },
  sublabel: { sample: 'pgvector:5432' },
  eyebrow: { sample: 'Core platform', uppercase: true },
  tag: { sample: 'API', uppercase: true },
  arrowLabel: { sample: 'verify', uppercase: true },
  callout: { sample: 'Auth is the only gate.', italic: true },
  legend: { sample: 'Legend', uppercase: true },
  chartLabel: { sample: 'Retrieval p95' },
  chartValue: { sample: '240 ms' },
  axis: { sample: 'Evolution', uppercase: true },
  zoneLabel: { sample: 'Private subnet', uppercase: true },
}

export const TYPE_RAMP_PREVIEW = Object.entries(TYPE_RAMP).map(([role, ramp]) => ({
  role,
  family: ramp.family,
  size: ramp.size,
  weight: ramp.weight,
  tracking: 'tracking' in ramp ? ramp.tracking : 0,
  cssFamily: FONT_STACK[ramp.family as 'sans' | 'serif' | 'mono'],
  italic: SAMPLE[role]?.italic,
  uppercase: SAMPLE[role]?.uppercase,
  sample: SAMPLE[role]?.sample ?? role,
}))
