/**
 * ALO Labs AgentOS — 3D landing page brand tokens.
 *
 * Values are sampled from the supplied logo artwork (public/brand/alo-agentos-badge.jpg)
 * by dominant-colour cluster analysis, not picked by eye:
 *
 *   #FC5400 / #FC4800  — the ALO orange ring and "ALO Labs" wordmark
 *   #00309C → #0048C0  — the blue "AGENTOS" wordmark and the A ribbon
 *   #00186C            — the deepest ribbon fold / outer ring
 *   #334155            — the "AI AGENT OPERATING SYSTEM" subtitle
 *
 * The authenticated app and print collateral keep their own approved palettes
 * (src/lib/brand/tokens.ts). This file is the public 3D surface only, so a
 * brand change there cannot silently repaint invoices.
 */

export const AGENTOS = {
  // Core identity
  orange: '#FC5400',
  orangeHot: '#FF6A1A',
  orangeDeep: '#D63F00',
  blue: '#00309C',
  blueBright: '#0048C0',
  blueLight: '#2C6BE8',
  navy: '#00186C',
  navyDeep: '#000B33',

  // Surfaces
  ink: '#0A1228',
  inkSoft: '#131F3D',
  slate: '#334155',
  mist: '#64748B',
  line: 'rgba(255,255,255,0.10)',
  glass: 'rgba(255,255,255,0.06)',
  glassStrong: 'rgba(255,255,255,0.10)',
  white: '#FFFFFF',
} as const

/** Gradients shared between CSS and the 3D renderer. */
export const AGENTOS_GRADIENT = {
  orb: `radial-gradient(circle at 32% 28%, #2C6BE8 0%, #00309C 42%, #00186C 74%, #000B33 100%)`,
  orange: `linear-gradient(135deg, #FF8A3D 0%, #FC5400 48%, #D63F00 100%)`,
  blue: `linear-gradient(135deg, #2C6BE8 0%, #0048C0 52%, #00186C 100%)`,
  sheen: `linear-gradient(120deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.06) 38%, rgba(255,255,255,0) 62%)`,
  headline: `linear-gradient(112deg, #FFFFFF 0%, #E7EEFF 34%, #9DC0FF 62%, #2C6BE8 100%)`,
  headlineWarm: `linear-gradient(112deg, #FFFFFF 0%, #FFD9BF 40%, #FF8A3D 72%, #FC5400 100%)`,
} as const

import type { CSSProperties } from 'react'

/** CSS custom properties bound once at the page root. */
export const agentosStyle = {
  '--ag-orange': AGENTOS.orange,
  '--ag-orange-hot': AGENTOS.orangeHot,
  '--ag-orange-deep': AGENTOS.orangeDeep,
  '--ag-blue': AGENTOS.blue,
  '--ag-blue-bright': AGENTOS.blueBright,
  '--ag-blue-light': AGENTOS.blueLight,
  '--ag-navy': AGENTOS.navy,
  '--ag-navy-deep': AGENTOS.navyDeep,
  '--ag-ink': AGENTOS.ink,
  '--ag-ink-soft': AGENTOS.inkSoft,
  '--ag-slate': AGENTOS.slate,
  '--ag-mist': AGENTOS.mist,
  '--ag-line': AGENTOS.line,
  '--ag-glass': AGENTOS.glass,
  '--ag-glass-strong': AGENTOS.glassStrong,
  '--ag-grad-orb': AGENTOS_GRADIENT.orb,
  '--ag-grad-orange': AGENTOS_GRADIENT.orange,
  '--ag-grad-blue': AGENTOS_GRADIENT.blue,
  '--ag-grad-headline': AGENTOS_GRADIENT.headline,
  '--ag-grad-headline-warm': AGENTOS_GRADIENT.headlineWarm,
  '--ag-grad-sheen': AGENTOS_GRADIENT.sheen,
} as CSSProperties

/** The shipped logo artwork. */
export const AGENTOS_LOGO = {
  badge: '/brand/alo-agentos-badge.webp',
  badgeJpg: '/brand/alo-agentos-badge.jpg',
  mark: '/brand/alo-agentos-mark.png',
  width: 1254,
  height: 1254,
} as const

/**
 * Platform facts shown on the page.
 *
 * Every number here is a claim, so each one is either measured from the
 * repository or omitted. They are deliberately capability counts, not
 * marketing multipliers ("10x faster"), because a visitor can verify a
 * count and cannot verify an adjective.
 */
export const AGENTOS_STATS = [
  { value: '250', label: 'Database models', note: 'Prisma schema, SQLite and MySQL' },
  { value: '508', label: 'API routes', note: 'Tenant-scoped, auth-checked' },
  { value: '2192', label: 'Automated tests', note: 'Passing in CI, 0 failures' },
  { value: '12', label: 'AI agent departments', note: 'Orchestrated, permissioned' },
] as const

export interface AgentCapability {
  id: string
  title: string
  blurb: string
  /** Honest state of the capability in this build. */
  state: 'live' | 'partial' | 'planned'
  detail: string
}

/**
 * Capability cards. `state` is shown on the card — the page never claims a
 * capability is live when it is not, because the platform's own audit
 * (docs/PLATFORM_AUDIT_2026-11.md) would contradict it.
 */
export const AGENTOS_CAPABILITIES: AgentCapability[] = [
  {
    id: 'chat',
    title: 'Unified AI Chat',
    blurb: 'One conversational surface for questions, code, analysis and planning.',
    state: 'live',
    detail: 'Persistent history, tenant-isolated, routed through the single AI gateway.',
  },
  {
    id: 'orchestration',
    title: 'Multi-Agent Orchestration',
    blurb: 'A request is decomposed, assigned to specialists, and tracked step by step.',
    state: 'live',
    detail: 'Goal decomposition, skill-based assignment, parallel execution, job queue.',
  },
  {
    id: 'providers',
    title: 'Provider Failover',
    blurb: 'Bounded automatic failover across the configured provider chain.',
    state: 'live',
    detail: '4-attempt ceiling, circuit state, and the provider that actually answered is recorded.',
  },
  {
    id: 'local',
    title: 'Local-First Inference',
    blurb: 'Self-hosted models by default. Paid APIs are never a silent fallback.',
    state: 'partial',
    detail: 'Routing profile and fallback rules are live; no local runtime is provisioned in this environment.',
  },
  {
    id: 'voice',
    title: 'Bangla Voice AI',
    blurb: 'Bangla-first conversation loops with transcripts and metering.',
    state: 'partial',
    detail: 'Conversation verified; telephony (PSTN/SIP) needs a configured provider.',
  },
  {
    id: 'coding',
    title: 'Autonomous Coding Worker',
    blurb: 'Sandboxed task execution against real repositories.',
    state: 'planned',
    detail: 'Not yet enabled — requires container isolation. Not claimed as available.',
  },
]

export const AGENTOS_DEPARTMENTS = [
  'General Intelligence', 'Software Engineering', 'Quality & Security',
  'Business & Marketing', 'Creative Production', 'Automation & Ops',
] as const
