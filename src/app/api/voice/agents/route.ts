import { db } from '@/lib/db'
import { readJson, requireString, optionalString, withCompany, parseJsonColumn } from '@/lib/voice/api-helpers'

export const dynamic = 'force-dynamic'

function optionalNumber(body: Record<string, unknown>, field: string): number | undefined {
  const v = body[field]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/**
 * AI voice agent CRUD (Module B). Configuration only — actual conversation
 * turns run through src/lib/voice/orchestrator.ts during calls.
 */
export async function GET() {
  return withCompany(async (auth) => {
    const agents = await db.voiceAgent.findMany({
      where: { companyId: auth.companyId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return {
      data: agents.map((a) => ({
        ...a,
        escalationRules: parseJsonColumn<unknown[]>(a.escalationRules, []),
        knowledgeScope: parseJsonColumn<unknown[]>(a.knowledgeScope, []),
      })),
      total: agents.length,
    }
  })
}

export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const name = requireString(body, 'name')
    const agent = await db.voiceAgent.create({
      data: {
        companyId: auth.companyId,
        name,
        description: optionalString(body, 'description'),
        purpose: optionalString(body, 'purpose'),
        language: optionalString(body, 'language') ?? 'bn-BD',
        voiceLibraryItemId: optionalString(body, 'voiceLibraryItemId'),
        greeting: optionalString(body, 'greeting'),
        systemInstructions: optionalString(body, 'systemInstructions'),
        fallbackMessage: optionalString(body, 'fallbackMessage'),
        maxCallSeconds: optionalNumber(body, 'maxCallSeconds') ?? 600,
        status: optionalString(body, 'status') ?? 'draft',
        phoneNumberId: optionalString(body, 'phoneNumberId'),
      },
    })
    // Version 1 snapshot — every profile starts with an immutable audit trail (§10).
    const { recordAgentVersion } = await import('@/lib/voice/agent-versions')
    const version = await recordAgentVersion({
      companyId: auth.companyId,
      agentId: agent.id,
      changedById: auth.userId,
      note: 'created via /api/voice/agents',
    })
    return { data: agent, version: version.version }
  })
}

export async function PATCH(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const id = requireString(body, 'id')
    const allowed = ['description', 'greeting', 'systemInstructions', 'fallbackMessage', 'status', 'voiceLibraryItemId', 'language', 'purpose'] as const
    const data: Record<string, string> = {}
    for (const field of allowed) {
      const v = optionalString(body, field)
      if (v !== undefined) data[field] = v
    }
    if (body.maxCallSeconds !== undefined) data.maxCallSeconds = String(optionalNumber(body, 'maxCallSeconds') ?? 600)
    if (Object.keys(data).length === 0) throw new Error('Invalid request: nothing to update')
    // Tenant-scoped update: updateMany with companyId filter refuses cross-tenant writes.
    const existing = await db.voiceAgent.findFirst({ where: { id, companyId: auth.companyId } })
    if (!existing) throw new Error(`voice agent ${id} not found for this tenant`)
    const result = await db.voiceAgent.updateMany({ where: { id, companyId: auth.companyId }, data })
    if (result.count === 0) throw new Error(`voice agent ${id} not found for this tenant`)
    // Immutable version snapshot when the auditable config actually changed (§10).
    const { recordAgentVersion, agentConfigSnapshot } = await import('@/lib/voice/agent-versions')
    const version = await recordAgentVersion({
      companyId: auth.companyId,
      agentId: existing.id,
      changedById: auth.userId,
      note: 'updated via /api/voice/agents',
      previousConfig: agentConfigSnapshot(existing as unknown as Record<string, unknown>),
    })
    return { data: { ok: true, updated: result.count }, version: version.version, versionSkipped: version.skipped }
  })
}
