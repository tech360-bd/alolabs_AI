import { NextResponse } from 'next/server'
import { v1Handler, V1Error } from '@/lib/v1'
import { db } from '@/lib/db'

/**
 * /api/v1/voice/agents/[id]/versions — immutable voice agent version history
 * (master prompt §10: Version + Audit history per agent profile).
 * GET : list versions, newest first (voice:read). Config JSON is parsed for
 *       readability; pass ?raw=1 to keep the stored string.
 */
export const dynamic = 'force-dynamic'

export const GET = v1Handler(async ({ identity }, request) => {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean)
  // /api/v1/voice/agents/<id>/versions
  const agentId = segments[4] ?? ''
  if (!agentId) throw new V1Error('agent id is required', 400, 'BAD_REQUEST')

  const agent = await db.voiceAgent.findFirst({
    where: { id: agentId, companyId: identity.companyId }, // tenant isolation
    select: { id: true, name: true },
  })
  if (!agent) throw new V1Error('voice agent not found for this tenant', 404, 'NOT_FOUND')

  const raw = request.nextUrl.searchParams.get('raw') === '1'
  const versions = await db.voiceAgentVersion.findMany({
    where: { companyId: identity.companyId, agentId },
    orderBy: { version: 'desc' },
    take: 200,
  })
  return NextResponse.json({
    agent: { id: agent.id, name: agent.name },
    total: versions.length,
    versions: versions.map((v) => ({
      version: v.version,
      changedById: v.changedById,
      note: v.note,
      createdAt: v.createdAt,
      config: raw ? v.config : (JSON.parse(v.config) as Record<string, unknown>),
    })),
  })
})
