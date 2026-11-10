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
  return NextResponse.json({
    agent,
    notice: 'Profile created in draft — set status:"active" via the dashboard after testing. Agents are reusable profiles, not dedicated processes.',
  })
})
