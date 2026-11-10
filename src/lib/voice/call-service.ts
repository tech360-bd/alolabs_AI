/**
 * Call service — the persistence layer of the call lifecycle.
 *
 * Every state change goes through here so that:
 * - transitions are validated by the state machine (`call-state.ts`),
 * - a `CallEvent` audit row is written for each change,
 * - terminal states trigger usage metering exactly once,
 * - `simulated` is stamped from the adapter's `info.simulated` flag.
 *
 * The service NEVER fabricates data: if the adapter fails, the call is marked
 * `failed` with the adapter's error message — never silently "completed".
 */

import { db } from '@/lib/db'
import {
  computeDurationSeconds,
  dispositionForState,
  isTerminal,
  transition,
  type CallState,
} from './call-state'
import { meterCallUsage } from './metering'
import { resolveTelephonyAdapter } from './telephony/registry'
import type { SandboxBehavior } from './telephony/sandbox-adapter'

export interface StartCallInput {
  companyId: string
  direction: 'inbound' | 'outbound'
  from: string
  to: string
  provider: string // PhoneNumber.provider or explicit adapter id
  channel?: string
  phoneNumberId?: string
  voiceAgentId?: string
  agentType?: 'ai' | 'human' | 'ivr'
  assignedUserId?: string
  contactId?: string | null
  campaignCallId?: string
  recordingConsent?: boolean
  /** Sandbox-only: script the simulated outcome (tests/demo). */
  sandboxBehavior?: SandboxBehavior
}

export interface StartedCall {
  id: string
  providerCallId?: string
  simulated: boolean
  state: CallState
}

export class CallServiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CallServiceError'
  }
}

async function logEvent(
  callSessionId: string,
  companyId: string,
  type: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await db.callEvent.create({
    data: { callSessionId, companyId, type, payload: JSON.stringify(payload) },
  })
}

/** Create a call session and hand it to the telephony adapter. */
export async function startCall(input: StartCallInput): Promise<StartedCall> {
  const adapter = resolveTelephonyAdapter(input.provider)
  const simulated = adapter.info.simulated

  const call = await db.callSession.create({
    data: {
      companyId: input.companyId,
      direction: input.direction,
      channel: input.channel ?? (simulated ? 'sandbox' : 'pstn'),
      fromNumber: input.from,
      toNumber: input.to,
      status: 'queued',
      phoneNumberId: input.phoneNumberId,
      voiceAgentId: input.voiceAgentId,
      agentType: input.agentType ?? 'ai',
      assignedUserId: input.assignedUserId,
      contactId: input.contactId ?? null,
      campaignCallId: input.campaignCallId,
      recordingConsent: input.recordingConsent ?? false,
      simulated,
      startedAt: new Date(),
    },
    select: { id: true },
  })
  await logEvent(call.id, input.companyId, 'state_change', { from: 'created', to: 'queued' })

  try {
    const placed = await adapter.placeCall({
      callSessionId: call.id,
      from: input.from,
      to: input.to,
      behaviorHint: input.sandboxBehavior,
    })
    await logEvent(call.id, input.companyId, 'adapter_place_call', {
      provider: adapter.info.id,
      providerCallId: placed.providerCallId,
      providerState: placed.state,
    })
    const state: CallState = placed.state === 'in_progress' ? 'in_progress' : 'ringing'
    await applyTransition(call.id, input.companyId, 'queued', state, {
      providerCallId: placed.providerCallId,
    })
    return { id: call.id, providerCallId: placed.providerCallId, simulated, state }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'adapter placeCall failed'
    await markFailed(call.id, input.companyId, 'queued', message)
    throw new CallServiceError(`call ${call.id} failed to place: ${message}`)
  }
}

/** Inbound leg: the adapter/provider reported the call is answered. */
export async function answerCall(callId: string, companyId: string): Promise<void> {
  const call = await getCall(callId, companyId)
  await applyTransition(callId, companyId, call.status as CallState, 'in_progress', { answered: true })
  await db.callSession.update({
    where: { id: callId },
    data: { answeredAt: new Date() },
  })
  // Recording pipeline: consent-gated, adapter-driven, audit-logged (§19).
  // Best-effort — a recording problem must never break a live conversation.
  try {
    const { startCallRecordingIfAllowed } = await import('./recording')
    const result = await startCallRecordingIfAllowed(callId, companyId)
    if (!result.performed) console.info(`[voice] recording not started on ${callId}: ${result.reason}`)
  } catch (err) {
    console.error(`[voice] recording start failed for ${callId}:`, err instanceof Error ? err.message : err)
  }
}

export async function holdCall(callId: string, companyId: string, on: boolean): Promise<void> {
  const call = await getCall(callId, companyId)
  const next: CallState = on ? 'on_hold' : 'in_progress'
  await applyTransition(callId, companyId, call.status as CallState, next, { hold: on })
  await logEvent(callId, companyId, on ? 'hold' : 'unhold', { at: new Date().toISOString() })
  if (!on) {
    // Accumulate real hold time from the last hold event — `holdSeconds` is a
    // measured fact, not an estimate.
    const lastHold = await db.callEvent.findFirst({
      where: { callSessionId: callId, companyId, type: 'hold' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })
    if (lastHold) {
      const delta = Math.max(0, Math.floor((Date.now() - lastHold.createdAt.getTime()) / 1000))
      if (delta > 0) {
        await db.callSession.update({ where: { id: callId }, data: { holdSeconds: { increment: delta } } })
      }
    }
  }
}

export async function transferCall(
  callId: string,
  companyId: string,
  target: string,
  reason?: string,
): Promise<void> {
  const call = await getCall(callId, companyId)
  if (!call.transferred) {
    await applyTransition(callId, companyId, call.status as CallState, 'transferring', { target, reason })
    await db.callSession.update({
      where: { id: callId },
      data: { transferred: true, transferReason: reason ?? null },
    })
    await logEvent(callId, companyId, 'transfer', { target, reason })
    // Resolve the transfer immediately after the provider leg is re-targeted.
    await applyTransition(callId, companyId, 'transferring', 'in_progress', { transferResolved: true })
  }
}

export async function endCall(
  callId: string,
  companyId: string,
  finalState: CallState,
  endedReason?: string,
): Promise<{ durationSeconds: number; metered: string[] }> {
  const call = await getCall(callId, companyId)
  if (isTerminal(call.status as CallState)) {
    // Idempotent end: already finalized, return existing duration.
    return { durationSeconds: call.durationSeconds, metered: [] }
  }
  await applyTransition(callId, companyId, call.status as CallState, finalState, { endedReason })
  const answeredAt = call.answeredAt ?? (call.status === 'in_progress' ? call.updatedAt : null)
  const endedAt = new Date()
  const durationSeconds = computeDurationSeconds({ answeredAt, endedAt })
  const ringSeconds = call.startedAt
    ? Math.max(0, Math.floor(((answeredAt ?? endedAt).getTime() - call.startedAt.getTime()) / 1000)) - durationSeconds
    : 0
  await db.callSession.update({
    where: { id: callId },
    data: {
      status: finalState,
      endedAt,
      durationSeconds,
      ringSeconds: Math.max(0, ringSeconds),
      disposition: dispositionForState(finalState),
      endedReason: endedReason ?? null,
    },
  })
  await logEvent(callId, companyId, 'state_change', { to: finalState, endedReason })
  const metered = await meterCallUsage({
    companyId,
    callSessionId: callId,
    simulated: call.simulated,
    channel: call.channel,
    agentType: call.agentType,
    durationSeconds,
  })
  // End-of-call artifacts (transcript, summary, structured outcome, campaign
  // feedback). Best-effort: a summary failure must never resurrect a terminal
  // call — but it is logged, never swallowed silently.
  try {
    const { finalizeCallArtifacts } = await import('./conversation-service')
    await finalizeCallArtifacts(companyId, callId)
  } catch (err) {
    console.error(`[voice] finalizeCallArtifacts failed for call ${callId}:`, err instanceof Error ? err.message : err)
  }
  // Stop the recording (persists the CallRecording row from real adapter
  // metadata — see recording.ts honesty rule).
  try {
    const { stopCallRecording } = await import('./recording')
    const rec = await stopCallRecording(callId, companyId)
    if (!rec.performed || !rec.recording) console.info(`[voice] recording not persisted on ${callId}: ${rec.reason}`)
  } catch (err) {
    console.error(`[voice] recording stop failed for ${callId}:`, err instanceof Error ? err.message : err)
  }
  // Presence auto-release: a human agent whose last active call just ended
  // returns to `available` — without this, handoff routing starves after the
  // first transferred call.
  if (call.assignedUserId) {
    try {
      const stillActive = await db.callSession.count({
        where: {
          companyId,
          assignedUserId: call.assignedUserId,
          status: { in: ['queued', 'ringing', 'in_progress', 'on_hold', 'transferring'] },
        },
      })
      if (stillActive === 0) await setPresence(companyId, call.assignedUserId, 'available')
    } catch (err) {
      console.error(`[voice] presence release failed for ${callId}:`, err instanceof Error ? err.message : err)
    }
  }
  return { durationSeconds, metered }
}

async function markFailed(callId: string, companyId: string, from: CallState, message: string): Promise<void> {
  await applyTransition(callId, companyId, from, 'failed', { message })
  await db.callSession.update({
    where: { id: callId },
    data: { status: 'failed', endedAt: new Date(), disposition: 'failed', endedReason: message },
  })
}

async function getCall(callId: string, companyId: string) {
  const call = await db.callSession.findFirst({
    where: { id: callId, companyId }, // tenant isolation — never drop this filter
  })
  if (!call) throw new CallServiceError(`call ${callId} not found for this tenant`)
  return call
}

async function applyTransition(
  callId: string,
  companyId: string,
  from: CallState,
  to: CallState,
  payload: Record<string, unknown>,
): Promise<void> {
  transition(from, to, callId) // throws InvalidCallTransitionError on illegal moves
  await db.callSession.update({ where: { id: callId }, data: { status: to } })
  await logEvent(callId, companyId, 'state_change', { from, to, ...payload })
}

/** Human agent presence — used by queue routing. */
export async function setPresence(companyId: string, userId: string, status: string): Promise<void> {
  const allowed = ['offline', 'available', 'busy', 'after_call_work', 'break']
  if (!allowed.includes(status)) throw new CallServiceError(`invalid presence status "${status}"`)
  await db.agentPresence.upsert({
    where: { companyId_userId: { companyId, userId } },
    create: { companyId, userId, status },
    update: { status, updatedAt: new Date() },
  })
}
