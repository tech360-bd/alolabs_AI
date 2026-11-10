import { NextResponse } from 'next/server'
import { v1Handler, V1Error } from '@/lib/v1'
import { db } from '@/lib/db'

/**
 * /api/v1/voice/campaigns — versioned campaign surface.
 * GET  : list campaigns (voice:read)
 * POST : create a campaign (voice:write) — starts in `draft`; dialing requires
 *        the explicit approve transition at /campaigns/:id/actions.
 */
export const dynamic = 'force-dynamic'

export const GET = v1Handler(async ({ identity }) => {
  const [total, data] = await Promise.all([
    db.campaign.count({ where: { companyId: identity.companyId } }),
    db.campaign.findMany({
      where: { companyId: identity.companyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ])
  return NextResponse.json({ campaigns: data, total })
})

export const POST = v1Handler(async ({ identity }, request) => {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    throw new V1Error('Invalid JSON body', 400, 'BAD_REQUEST')
  }
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null
  if (!name) throw new V1Error('name is required', 400, 'BAD_REQUEST')
  const campaign = await db.campaign.create({
    data: {
      companyId: identity.companyId,
      name,
      description: typeof body.description === 'string' ? body.description : null,
      type: typeof body.type === 'string' ? body.type : 'follow_up',
      script: typeof body.script === 'string' ? body.script : null,
      voiceAgentId: typeof body.voiceAgentId === 'string' ? body.voiceAgentId : null,
      phoneNumberId: typeof body.phoneNumberId === 'string' ? body.phoneNumberId : null,
      respectDnc: body.respectDnc !== false,
      recordingDisclosure: typeof body.recordingDisclosure === 'string' ? body.recordingDisclosure : null,
      maxConcurrentCalls: typeof body.maxConcurrentCalls === 'number' ? Math.max(1, Math.min(50, body.maxConcurrentCalls)) : 2,
      dailyQuota: typeof body.dailyQuota === 'number' ? Math.max(0, Math.min(100_000, body.dailyQuota)) : 200,
      scheduledEnd: typeof body.scheduledEnd === 'string' ? new Date(body.scheduledEnd) : null,
      expiresAt: typeof body.expiresAt === 'string' ? new Date(body.expiresAt) : null,
    },
  })
  return { campaign, next: 'POST /api/v1/voice/campaigns/:id/actions {action:"approve"} to enable dialing' }
})
