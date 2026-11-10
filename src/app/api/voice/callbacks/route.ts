import { db } from '@/lib/db'
import { readJson, withCompany } from '@/lib/voice/api-helpers'
import {
  runCallbackTick,
  scheduleCallback,
  MAX_CALLBACK_ATTEMPTS,
  DEFAULT_CALLBACK_DELAY_MINUTES,
} from '@/lib/voice/callbacks'
import { enqueueCallbackTick } from '@/lib/voice/queue-worker'

export const dynamic = 'force-dynamic'

/**
 * Voice callback scheduler API (master prompt §14 — "If nobody is available,
 * create a callback task" and that callback must actually happen).
 *
 * GET  : callback-scheduled escalations for the tenant (queue visibility).
 * POST : { action: "run" }                        → execute one tick NOW
 *        { action: "schedule", escalationId, delayMinutes? } → (re)schedule
 *
 * The background worker drives the same `runCallbackTick` via the durable
 * queue (`voice.callback.due`); this route is the operator/ops-view entry.
 */
export async function GET() {
  return withCompany(async (auth) => {
    const [scheduled, recent] = await Promise.all([
      db.escalation.findMany({
        where: { companyId: auth.companyId, status: 'callback_scheduled' },
        orderBy: { callbackDueAt: 'asc' },
        take: 100,
        select: {
          id: true, callSessionId: true, trigger: true, reason: true,
          callbackDueAt: true, callbackTaskId: true, createdAt: true,
        },
      }),
      db.escalation.findMany({
        where: { companyId: auth.companyId, status: { in: ['assigned', 'resolved', 'cancelled'] }, resolutionNote: { contains: 'callback' } },
        orderBy: { updatedAt: 'desc' },
        take: 25,
        select: { id: true, status: true, resolutionNote: true, updatedAt: true },
      }),
    ])
    const now = new Date()
    return {
      data: scheduled.map((e) => ({
        ...e,
        due: e.callbackDueAt !== null && e.callbackDueAt.getTime() <= now.getTime(),
        overdueMinutes:
          e.callbackDueAt !== null && e.callbackDueAt.getTime() < now.getTime()
            ? Math.floor((now.getTime() - e.callbackDueAt.getTime()) / 60_000)
            : 0,
      })),
      recentlyExecuted: recent,
      limits: { maxAttempts: MAX_CALLBACK_ATTEMPTS, defaultDelayMinutes: DEFAULT_CALLBACK_DELAY_MINUTES },
    }
  })
}

export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const action = typeof body.action === 'string' ? body.action : ''

    if (action === 'run') {
      const decisions = await runCallbackTick(auth.companyId)
      const dueLeft = await db.escalation.count({
        where: { companyId: auth.companyId, status: 'callback_scheduled', callbackDueAt: { not: null, lte: new Date() } },
      })
      if (dueLeft > 0) await enqueueCallbackTick(auth.companyId) // keep draining on the worker
      return { data: { decisions, dueRemaining: dueLeft } }
    }

    if (action === 'schedule') {
      const escalationId = typeof body.escalationId === 'string' ? body.escalationId : ''
      if (!escalationId) throw new Error('Invalid request: "escalationId" is required')
      const delayMinutes =
        typeof body.delayMinutes === 'number' && Number.isFinite(body.delayMinutes) && body.delayMinutes >= 0
          ? body.delayMinutes
          : DEFAULT_CALLBACK_DELAY_MINUTES
      const escalation = await db.escalation.findFirst({
        where: { id: escalationId, companyId: auth.companyId, status: 'callback_scheduled' },
        select: { id: true },
      })
      if (!escalation) throw new Error(`escalation ${escalationId} not found for this tenant`)
      const dueAt = await scheduleCallback({ companyId: auth.companyId, escalationId: escalation.id, delayMinutes })
      await enqueueCallbackTick(auth.companyId, delayMinutes * 60_000)
      return { data: { escalationId: escalation.id, callbackDueAt: dueAt.toISOString(), delayMinutes } }
    }

    throw new Error('Invalid request: action must be "run" or "schedule"')
  })
}
