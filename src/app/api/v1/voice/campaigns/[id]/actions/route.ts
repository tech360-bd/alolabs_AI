import { v1Handler, V1Error } from '@/lib/v1'
import { db } from '@/lib/db'
import { campaignTransition, isCampaignStatus, type CampaignStatus } from '@/lib/voice/campaign-lifecycle'
import { enqueueCampaignTick } from '@/lib/voice/queue-worker'

/**
 * /api/v1/voice/campaigns/:id/actions — campaign lifecycle (master prompt §22:
 * POST /campaigns/{id}/approve | pause | resume).
 * POST { action: 'approve' | 'pause' | 'resume' | 'cancel' | 'start' }
 *
 * - approve: draft|pending_approval → approved (recorded with approver time)
 * - pause / resume / cancel: validated state-machine transitions
 * - start: enqueue a dialer tick on the durable voice queue
 */
export const dynamic = 'force-dynamic'

export const POST = v1Handler(async ({ identity }, request) => {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean)
  const id = segments[segments.indexOf('campaigns') + 1]
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    throw new V1Error('Invalid JSON body', 400, 'BAD_REQUEST')
  }
  const action = typeof body.action === 'string' ? body.action : ''
  const campaign = await db.campaign.findFirst({
    where: { id, companyId: identity.companyId },
  })
  if (!campaign) throw new V1Error('Campaign not found', 404, 'NOT_FOUND')
  const current = (isCampaignStatus(campaign.status) ? campaign.status : 'draft') as CampaignStatus

  if (action === 'start') {
    const queueItemId = await enqueueCampaignTick(identity.companyId)
    return { campaignId: campaign.id, dialer: 'tick enqueued', queueItemId }
  }
  if (!['approve', 'pause', 'resume', 'cancel'].includes(action)) {
    throw new V1Error('action must be approve, pause, resume, cancel or start', 400, 'BAD_REQUEST')
  }
  if (campaign.scheduledEnd && campaign.scheduledEnd.getTime() <= Date.now() && action !== 'cancel') {
    await db.campaign.update({ where: { id: campaign.id }, data: { status: 'expired' } })
    throw new V1Error('Campaign has expired (scheduledEnd passed)', 409, 'EXPIRED')
  }
  const target: CampaignStatus =
    action === 'approve' ? 'approved' : action === 'pause' ? 'paused' : action === 'resume' ? 'running' : 'cancelled'
  const transitioned = campaignTransition(current, target)
  const updated = await db.campaign.update({
    where: { id: campaign.id },
    data: {
      status: transitioned.to,
      ...(action === 'approve' ? { approvedAt: new Date() } : {}),
    },
  })
  return { campaign: updated, transition: { from: transitioned.from, to: transitioned.to } }
})
