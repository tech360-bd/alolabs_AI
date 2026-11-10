/**
 * Callback scheduler (master prompt §14: "If nobody is available, create a
 * callback task" — and the callback must actually HAPPEN).
 *
 * `handoff.ts` promises the callback: Escalation row (`callback_scheduled`)
 * + Task row + `callbackDueAt`. This module KEEPS the promise: a durable
 * queue job (`voice.callback.due`) periodically re-dials customers whose
 * callback is due, using the same compliance path as the campaign dialer
 * (the call goes through `startCall`, so quotas, provider resolution and
 * honest failure marking all apply).
 *
 * Outcome honesty: placing the callback call moves the escalation to
 * `assigned` with the new CallSession linked via `parentCallId` — the
 * escalation is only `resolved` when that call's own lifecycle resolves it
 * (human connects) or the customer ends it. If the provider refuses, the
 * callback is rescheduled (bounded retries), never silently dropped.
 */

import { db } from '@/lib/db'

export const CALLBACK_JOB_TYPE = 'voice.callback.due'
export const DEFAULT_CALLBACK_DELAY_MINUTES = 15
export const CALLBACK_RETRY_MINUTES = 30
export const MAX_CALLBACK_ATTEMPTS = 3

/** Pure: which customer number does a callback target for the original call? */
export function customerNumberForCallback(call: { direction: string; fromNumber: string; toNumber: string }): string {
  return call.direction === 'inbound' ? call.fromNumber : call.toNumber
}

/** Pure: is a callback-scheduled escalation due for dialing? */
export function isCallbackDue(escalation: { status: string; callbackDueAt: Date | null }, now: Date): boolean {
  return escalation.status === 'callback_scheduled' && escalation.callbackDueAt !== null && escalation.callbackDueAt.getTime() <= now.getTime()
}

export interface CallbackDecision {
  escalationId: string
  action: 'dialed' | 'retry_scheduled' | 'missing_data' | 'max_attempts'
  reason: string
  callSessionId?: string
}

/** Run one callback tick for a tenant. Returns auditable decisions. */
export async function runCallbackTick(companyId: string, now: Date = new Date()): Promise<CallbackDecision[]> {
  const escalations = await db.escalation.findMany({
    where: { companyId, status: 'callback_scheduled', callbackDueAt: { not: null, lte: now } },
    orderBy: { callbackDueAt: 'asc' },
    take: 10,
    select: { id: true, callSessionId: true, callbackDueAt: true, trigger: true, reason: true },
  })

  const decisions: CallbackDecision[] = []
  for (const escalation of escalations) {
    const original = await db.callSession.findFirst({
      where: { id: escalation.callSessionId, companyId },
      select: { id: true, direction: true, fromNumber: true, toNumber: true, voiceAgentId: true, contactId: true, campaignCallId: true },
    })
    if (!original) {
      await db.escalation.update({
        where: { id: escalation.id },
        data: { status: 'cancelled', resolutionNote: 'callback cancelled — original call record missing' },
      })
      decisions.push({ escalationId: escalation.id, action: 'missing_data', reason: 'original call not found — escalation cancelled' })
      continue
    }

    const callbackAttemptKey = `voice-callback:${escalation.id}`
    const previousAttempts = await db.callSession.count({
      where: { companyId, parentCallId: original.id, outcome: { contains: callbackAttemptKey } },
    })
    if (previousAttempts >= MAX_CALLBACK_ATTEMPTS) {
      await db.escalation.update({
        where: { id: escalation.id },
        data: { status: 'cancelled', resolutionNote: `callback cancelled after ${previousAttempts} attempts` },
      })
      decisions.push({ escalationId: escalation.id, action: 'max_attempts', reason: `callback attempted ${previousAttempts} times` })
      continue
    }

    // Resolve our outbound number and the agent that promised the callback.
    const agent = original.voiceAgentId
      ? await db.voiceAgent.findFirst({
          where: { id: original.voiceAgentId, companyId },
          select: { id: true, phoneNumberId: true, status: true },
        })
      : null
    const number = agent?.phoneNumberId
      ? await db.phoneNumber.findFirst({ where: { id: agent.phoneNumberId, companyId }, select: { e164: true, provider: true } })
      : await db.phoneNumber.findFirst({
          where: { companyId, status: 'active' },
          orderBy: { createdAt: 'desc' },
          select: { e164: true, provider: true },
        })
    if (!number) {
      decisions.push({ escalationId: escalation.id, action: 'retry_scheduled', reason: 'no active phone number for the tenant — rescheduled' })
      await db.escalation.update({
        where: { id: escalation.id },
        data: { callbackDueAt: new Date(now.getTime() + CALLBACK_RETRY_MINUTES * 60_000) },
      })
      continue
    }

    const destination = customerNumberForCallback(original)
    try {
      const { startCall } = await import('./call-service')
      const started = await startCall({
        companyId,
        direction: 'outbound',
        from: number.e164,
        to: destination,
        provider: number.provider ?? 'sandbox',
        voiceAgentId: agent?.id ?? undefined,
        agentType: 'ai',
        contactId: original.contactId,
      })
      await db.callSession.update({
        where: { id: started.id },
        data: {
          parentCallId: original.id,
          // Audit marker: ties the callback call back to its escalation.
          outcome: JSON.stringify({ callbackOfEscalation: escalation.id, callbackAttemptKey }),
        },
      })
      await db.escalation.update({
        where: { id: escalation.id },
        data: {
          status: 'assigned',
          resolutionNote: `callback placed — call ${started.id}${started.simulated ? ' (simulated)' : ''}`,
        },
      })
      await db.callEvent.create({
        data: {
          callSessionId: original.id,
          companyId,
          type: 'callback_placed',
          payload: JSON.stringify({ escalationId: escalation.id, callbackCallId: started.id, destination }),
        },
      })
      decisions.push({ escalationId: escalation.id, action: 'dialed', reason: `callback call ${started.id} placed to ${destination}`, callSessionId: started.id })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'callback dial failed'
      await db.escalation.update({
        where: { id: escalation.id },
        data: { callbackDueAt: new Date(now.getTime() + CALLBACK_RETRY_MINUTES * 60_000) },
      })
      decisions.push({ escalationId: escalation.id, action: 'retry_scheduled', reason: `dial failed: ${message} — rescheduled` })
    }
  }
  return decisions
}

/** True when the tenant still has callbacks the scheduler should keep driving. */
export async function hasDueCallbackWork(companyId: string, now: Date = new Date()): Promise<boolean> {
  const count = await db.escalation.count({
    where: { companyId, status: 'callback_scheduled', callbackDueAt: { not: null } },
  })
  if (count === 0) return false
  const unresolved = await db.escalation.count({
    where: { companyId, status: 'callback_scheduled', callbackDueAt: { not: null, lte: new Date(now.getTime() + CALLBACK_RETRY_MINUTES * 60_000) } },
  })
  return unresolved > 0
}

/** Schedule (or reschedule) the callback for an escalation. */
export async function scheduleCallback(params: {
  companyId: string
  escalationId: string
  delayMinutes?: number
  now?: Date
}): Promise<Date> {
  const now = params.now ?? new Date()
  const due = new Date(now.getTime() + (params.delayMinutes ?? DEFAULT_CALLBACK_DELAY_MINUTES) * 60_000)
  await db.escalation.updateMany({
    where: { id: params.escalationId, companyId: params.companyId, status: 'callback_scheduled' },
    data: { callbackDueAt: due },
  })
  return due
}
