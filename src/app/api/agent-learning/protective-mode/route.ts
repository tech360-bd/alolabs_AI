import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/api-auth'
import { db } from '@/lib/db'

const DEFAULTS = {
  enabled: true,
  safetyLevel: 'standard',
  blockedPatterns: [] as string[],
  allowedDomains: [] as string[],
  maxKnowledgePerDay: 50,
  maxConfidence: 0.95,
  requireVerification: true,
  autoFilterToxic: true,
  learningScope: 'task_domain',
  dataRetentionDays: 90,
  violationCount: 0,
}

const UpdateSchema = z.object({
  agentId: z.string().min(1),
  enabled: z.boolean().optional(),
  safetyLevel: z.enum(['minimal', 'standard', 'strict', 'maximum']).optional(),
  blockedPatterns: z.array(z.string().trim().min(1).max(500)).max(100).optional(),
  allowedDomains: z.array(z.string().trim().min(1).max(253)).max(100).optional(),
  maxKnowledgePerDay: z.number().int().min(0).max(10_000).optional(),
  maxConfidence: z.number().min(0).max(1).optional(),
  requireVerification: z.boolean().optional(),
  autoFilterToxic: z.boolean().optional(),
  learningScope: z.enum(['task_domain', 'cross_domain', 'open', 'restricted']).optional(),
  dataRetentionDays: z.number().int().min(1).max(3650).optional(),
}).strict()

function parseStringArray(value: string | null | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]')
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : []
  } catch {
    return []
  }
}

function serializeMode(mode: Record<string, unknown> | null, agent: { id: string; agentId: string; name: string; departmentName: string }) {
  return {
    agentId: agent.id,
    agent: { agentId: agent.agentId, name: agent.name, departmentName: agent.departmentName },
    ...DEFAULTS,
    ...(mode ?? {}),
    blockedPatterns: parseStringArray(typeof mode?.blockedPatterns === 'string' ? mode.blockedPatterns : undefined),
    allowedDomains: parseStringArray(typeof mode?.allowedDomains === 'string' ? mode.allowedDomains : undefined),
  }
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error'
  const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500
  return NextResponse.json({ error: message }, { status })
}

export async function GET(req: NextRequest) {
  try {
    await requireRole('super_admin')
    const agentId = req.nextUrl.searchParams.get('agentId')
    if (agentId) {
      const agent = await db.agent.findUnique({
        where: { id: agentId },
        select: { id: true, agentId: true, name: true, departmentName: true },
      })
      if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
      const mode = await db.agentProtectiveMode.findUnique({ where: { agentId } })
      return NextResponse.json({ data: serializeMode(mode as unknown as Record<string, unknown> | null, agent) })
    }

    const agents = await db.agent.findMany({
      where: { status: 'active' },
      take: 100,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, agentId: true, name: true, departmentName: true },
    })
    const modes = agents.length
      ? await db.agentProtectiveMode.findMany({ where: { agentId: { in: agents.map((agent) => agent.id) } } })
      : []
    const modeByAgent = new Map(modes.map((mode) => [mode.agentId, mode]))
    const data = agents.map((agent) => serializeMode(modeByAgent.get(agent.id) as unknown as Record<string, unknown> | undefined ?? null, agent))
    const violations = data.map((item) => Number(item.violationCount) || 0)
    return NextResponse.json({
      data,
      stats: {
        listedAgents: data.length,
        configuredAgents: modes.length,
        enabledConfiguredAgents: modes.filter((mode) => mode.enabled).length,
        recordedViolations: violations.reduce((sum, value) => sum + value, 0),
      },
      limited: true,
    })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireRole('super_admin')
    const parsed = UpdateSchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    const { agentId, ...changes } = parsed.data
    const agent = await db.agent.findUnique({ where: { id: agentId }, select: { id: true, agentId: true, name: true, departmentName: true } })
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

    const { blockedPatterns, allowedDomains, ...scalarChanges } = changes
    const data = {
      ...scalarChanges,
      ...(blockedPatterns !== undefined ? { blockedPatterns: JSON.stringify(blockedPatterns) } : {}),
      ...(allowedDomains !== undefined ? { allowedDomains: JSON.stringify(allowedDomains) } : {}),
    }
    const mode = await db.$transaction(async (transaction) => {
      const updated = await transaction.agentProtectiveMode.upsert({
        where: { agentId },
        create: { agentId, ...data },
        update: data,
      })
      await transaction.auditEvent.create({
        data: {
          actorUserId: user.userId,
          action: 'agent_protective_mode.update',
          resource: 'agent-protective-mode',
          resourceId: updated.id,
          details: JSON.stringify({ agentId, changedFields: Object.keys(changes) }),
        },
      })
      return updated
    })
    return NextResponse.json({ data: serializeMode(mode as unknown as Record<string, unknown>, agent) })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}
