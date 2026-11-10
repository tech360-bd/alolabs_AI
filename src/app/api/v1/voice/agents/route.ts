import { NextResponse } from 'next/server'
import { v1Handler, V1Error } from '@/lib/v1'
import { db } from '@/lib/db'

/**
 * /api/v1/voice/agents — reusable voice agent profiles (master prompt §10).
 * GET  : list voice agent profiles for the tenant (voice:read)
 * POST : register a profile (voice:write) — a profile is CONFIGURATION, not a
 *        running process; calls are served by the shared worker pool.
 */
export const dynamic = 'force-dynamic'

export const GET = v1Handler(async ({ identity }) => {
  const [total, data] = await Promise.all([
    db.voiceAgent.count({ where: { companyId: identity.companyId } }),
    db.voiceAgent.findMany({
      where: { companyId: identity.companyId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ])
  return NextResponse.json({ agents: data, total })
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
  const agent = await db.voiceAgent.create({
    data: {
      companyId: identity.companyId,
      name,
      description: typeof body.description === 'string' ? body.description : null,
      purpose: typeof body.purpose === 'string' ? body.purpose : null,
      language: typeof body.language === 'string' ? body.language : 'bn-BD',
      voiceLibraryItemId: typeof body.voiceLibraryItemId === 'string' ? body.voiceLibraryItemId : null,
      greeting: typeof body.greeting === 'string' ? body.greeting : null,
      systemInstructions: typeof body.systemInstructions === 'string' ? body.systemInstructions : null,
      fallbackMessage: typeof body.fallbackMessage === 'string' ? body.fallbackMessage : null,
      knowledgeScope: JSON.stringify(Array.isArray(body.knowledgeScope) ? body.knowledgeScope : []),
      maxCallSeconds: typeof body.maxCallSeconds === 'number' ? Math.max(30, Math.min(3600, body.maxCallSeconds)) : 600,
      allowBargeIn: body.allowBargeIn !== false,
      humanFallbackUserId: typeof body.humanFallbackUserId === 'string' ? body.humanFallbackUserId : null,
      phoneNumberId: typeof body.phoneNumberId === 'string' ? body.phoneNumberId : null,
      status: 'draft',
    },
  })
  // Version 1 snapshot — every profile starts with an immutable audit trail (§10).
  const { recordAgentVersion } = await import('@/lib/voice/agent-versions')
  const version = await recordAgentVersion({
    companyId: identity.companyId,
    agentId: agent.id,
    changedById: identity.userId,
    note: 'created via /api/v1/voice/agents',
  })
  return NextResponse.json({
    agent,
    version: version.version,
    notice: 'Profile created in draft — set status:"active" via the dashboard after testing. Agents are reusable profiles, not dedicated processes.',
  })
})

export const PATCH = v1Handler(async ({ identity }, request) => {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    throw new V1Error('Invalid JSON body', 400, 'BAD_REQUEST')
  }
  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : null
  if (!id) throw new V1Error('id is required', 400, 'BAD_REQUEST')

  const existing = await db.voiceAgent.findFirst({
    where: { id, companyId: identity.companyId }, // tenant isolation
  })
  if (!existing) throw new V1Error('voice agent not found for this tenant', 404, 'NOT_FOUND')

  const strFields = ['description', 'purpose', 'language', 'voiceLibraryItemId', 'greeting', 'systemInstructions', 'fallbackMessage', 'humanFallbackUserId', 'phoneNumberId', 'status'] as const
  const data: Record<string, unknown> = {}
  for (const f of strFields) {
    const v = body[f]
    if (typeof v === 'string' || v === null) data[f] = v
  }
  if (body.maxCallSeconds !== undefined) {
    if (typeof body.maxCallSeconds !== 'number' || !Number.isFinite(body.maxCallSeconds)) {
      throw new V1Error('maxCallSeconds must be a number', 400, 'BAD_REQUEST')
    }
    data.maxCallSeconds = Math.max(30, Math.min(3600, body.maxCallSeconds))
  }
  if (body.allowBargeIn !== undefined) data.allowBargeIn = body.allowBargeIn === true
  if (body.knowledgeScope !== undefined) {
    if (!Array.isArray(body.knowledgeScope)) throw new V1Error('knowledgeScope must be an array of ids', 400, 'BAD_REQUEST')
    data.knowledgeScope = JSON.stringify(body.knowledgeScope)
  }
  if (body.escalationRules !== undefined) {
    if (!Array.isArray(body.escalationRules)) throw new V1Error('escalationRules must be an array', 400, 'BAD_REQUEST')
    data.escalationRules = JSON.stringify(body.escalationRules)
  }
  if (Object.keys(data).length === 0) throw new V1Error('nothing to update', 400, 'BAD_REQUEST')

  await db.voiceAgent.update({ where: { id: existing.id }, data })
  const { recordAgentVersion, agentConfigSnapshot } = await import('@/lib/voice/agent-versions')
  const version = await recordAgentVersion({
    companyId: identity.companyId,
    agentId: existing.id,
    changedById: identity.userId,
    note: 'updated via /api/v1/voice/agents',
    previousConfig: agentConfigSnapshot(existing as unknown as Record<string, unknown>),
  })
  const updated = await db.voiceAgent.findUniqueOrThrow({ where: { id: existing.id } })
  return NextResponse.json({
    agent: updated,
    version: version.version,
    versionSkipped: version.skipped,
    notice: 'Every config change is snapshotted as an immutable VoiceAgentVersion (master prompt §10 audit history).',
  })
})
