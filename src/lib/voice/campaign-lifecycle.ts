/**
 * Campaign lifecycle engine (master prompt §13) — approval workflow,
 * pause/resume, expiry, concurrency limits, quotas and duplicate prevention.
 *
 * Pure decision logic lives here so it is unit-testable; persistence happens
 * in the API routes / dialer worker. Every refusal returns an explicit
 * machine-readable reason — campaigns are never silently mutated.
 */

import type { CallState } from './call-state'

export const CAMPAIGN_STATUSES = [
  'draft', // being configured; cannot dial
  'pending_approval', // awaiting explicit owner/manager approval
  'approved', // approved, waiting for scheduledStart / ticker
  'running',
  'paused',
  'completed',
  'cancelled',
  'expired', // scheduledEnd passed — no further dialing
] as const

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

export function isCampaignStatus(v: string): v is CampaignStatus {
  return (CAMPAIGN_STATUSES as readonly string[]).includes(v)
}

/**
 * Legal status transitions. Dialing states (approved/running) can always be
 * paused or completed; terminal states (completed/cancelled/expired) accept
 * nothing.
 */
const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, readonly CampaignStatus[]> = {
  draft: ['pending_approval', 'approved', 'cancelled'],
  pending_approval: ['approved', 'draft', 'cancelled'],
  approved: ['running', 'paused', 'cancelled', 'expired'],
  running: ['paused', 'completed', 'cancelled', 'expired'],
  paused: ['running', 'completed', 'cancelled', 'expired'],
  completed: [],
  cancelled: [],
  expired: [],
}

export class InvalidCampaignTransitionError extends Error {
  constructor(
    public readonly from: CampaignStatus,
    public readonly to: CampaignStatus,
  ) {
    const allowed = isCampaignStatus(from) ? CAMPAIGN_TRANSITIONS[from].join(', ') || 'none (terminal state)' : 'unknown status'
    super(`Invalid campaign transition ${from} → ${to}. Allowed: ${allowed}`)
    this.name = 'InvalidCampaignTransitionError'
  }
}

export function campaignTransition(
  current: CampaignStatus,
  next: CampaignStatus,
): { from: CampaignStatus; to: CampaignStatus } {
  if (!isCampaignStatus(current)) throw new InvalidCampaignTransitionError(current as never, next)
  if (!isCampaignStatus(next)) throw new InvalidCampaignTransitionError(current, next as never)
  if (!CAMPAIGN_TRANSITIONS[current].includes(next)) {
    throw new InvalidCampaignTransitionError(current, next)
  }
  return { from: current, to: next }
}

export interface CampaignLifecycleFacts {
  status: string
  scheduledStart?: Date | null
  scheduledEnd?: Date | null
  maxConcurrentCalls?: number | null
  dailyQuota?: number | null
}

/** A campaign whose scheduledEnd has passed may never dial again. */
export function campaignExpiryCheck(campaign: CampaignLifecycleFacts, at: Date = new Date()): {
  expired: boolean
  reason?: string
} {
  if (campaign.scheduledEnd && campaign.scheduledEnd.getTime() <= at.getTime()) {
    return { expired: true, reason: `campaign expired at ${campaign.scheduledEnd.toISOString()}` }
  }
  return { expired: false }
}

export interface ConcurrencyFacts {
  activeCalls: number
  callsStartedToday: number
}

export interface DialGateResult {
  allowed: boolean
  reason: string
}

/**
 * Gate for placing the next campaign call: campaign must be dialing-enabled,
 * not expired, inside concurrency and daily-quota limits.
 */
export function dialGate(params: {
  campaign: CampaignLifecycleFacts
  facts: ConcurrencyFacts
  at?: Date
}): DialGateResult {
  const status = params.campaign.status
  if (status !== 'approved' && status !== 'running') {
    return { allowed: false, reason: `campaign status "${status}" does not allow dialing` }
  }
  const expiry = campaignExpiryCheck(params.campaign, params.at ?? new Date())
  if (expiry.expired) return { allowed: false, reason: expiry.reason! }

  const maxConcurrent = params.campaign.maxConcurrentCalls ?? 2
  if (params.facts.activeCalls >= maxConcurrent) {
    return { allowed: false, reason: `concurrent_call_limit reached (${params.facts.activeCalls}/${maxConcurrent})` }
  }
  const quota = params.campaign.dailyQuota ?? 0
  if (quota > 0 && params.facts.callsStartedToday >= quota) {
    return { allowed: false, reason: `daily_quota reached (${params.facts.callsStartedToday}/${quota})` }
  }
  return { allowed: true, reason: 'dial allowed' }
}

/** Duplicate prevention: campaign contacts are unique per destination number. */
export function isDuplicateDestination(
  existingDestinations: string[],
  destinationNumber: string,
): boolean {
  // Compare on normalized digits (+ and non-digits removed) — the same
  // number written "+8801711…", "8801711…" and "01711…" must collide.
  const norm = (v: string) => v.replace(/[^\d]/g, '')
  const target = norm(destinationNumber)
  return existingDestinations.some((d) => norm(d) === target)
}

/** CampaignCall status to write back when a dialed call reaches a terminal state. */
export function campaignStatusForCallState(state: CallState): string {
  switch (state) {
    case 'completed':
      return 'completed'
    case 'no_answer':
      return 'no_answer'
    case 'busy':
      return 'busy'
    case 'voicemail':
      return 'voicemail'
    case 'abandoned':
      return 'abandoned'
    default:
      return 'failed'
  }
}
