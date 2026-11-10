/**
 * Voice campaign tick — durable-queue glue for the dialer.
 *
 * The campaign dialer runs on the SAME durable Prisma queue the AgentOS
 * worker uses (`src/lib/job-queue.ts`), as job type `voice.campaign.tick`
 * on the `voice` queue. No second scheduler stack; leases, retries and
 * crash recovery come from the queue.
 *
 * Tick cadence: at most one tick per company per minute (idempotency key
 * bucket). After a tick the handler re-enqueues the next tick while any
 * campaign still has dialing-enabled state, so a started campaign drains
 * itself; quiet tenants stop scheduling.
 */

import { db } from '@/lib/db'
import { enqueue, type QueueItemData } from '@/lib/job-queue'
import { runCampaignTick } from './dialer'

export const VOICE_QUEUE = 'voice'
export const VOICE_TICK_JOB_TYPE = 'voice.campaign.tick'
export const TICK_INTERVAL_MS = 60_000

/** Enqueue one dialer tick for a tenant (max one per minute, per company). */
export async function enqueueCampaignTick(companyId: string, delayMs = 0): Promise<string> {
  const bucket = Math.floor((Date.now() + delayMs) / TICK_INTERVAL_MS)
  const item = await enqueue(
    VOICE_QUEUE,
    VOICE_TICK_JOB_TYPE,
    { companyId },
    {
      idempotencyKey: `voice-campaign-tick:${companyId}:${bucket}`,
      delayMs,
      maxRetries: 3,
    },
  )
  return item.id
}

/** True when the tenant still has campaigns the dialer should keep driving. */
async function hasActiveCampaignWork(companyId: string): Promise<boolean> {
  const count = await db.campaign.count({
    where: { companyId, status: { in: ['approved', 'running'] } },
  })
  if (count === 0) return false
  const pending = await db.campaignCall.count({
    where: { companyId, status: { in: ['queued', 'pending'] } },
  })
  return pending > 0
}

/**
 * Executor for `voice.campaign.tick`. Used by the background worker
 * (src/instrumentation.node.ts) and the manual trigger route so both paths
 * behave identically.
 */
export async function dispatchVoiceJob(job: QueueItemData): Promise<unknown> {
  let payload: Record<string, unknown> = {}
  try {
    payload = JSON.parse(job.payload) as Record<string, unknown>
  } catch {
    payload = {}
  }
  if (job.jobType !== VOICE_TICK_JOB_TYPE) {
    throw new Error(`unknown voice job type: ${job.jobType}`)
  }
  const companyId = typeof payload.companyId === 'string' ? payload.companyId : null
  if (!companyId) throw new Error('voice.campaign.tick job missing companyId')

  const decisions = await runCampaignTick(companyId)
  if (await hasActiveCampaignWork(companyId)) {
    await enqueueCampaignTick(companyId, TICK_INTERVAL_MS)
  }
  return { companyId, decisions, dialed: decisions.filter((d) => d.action === 'dial').length }
}
