import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { requireCompanyAdmin } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { agentCompanyScope } from '@/lib/agent-access'

const ReviewSchema = z.object({
  id: z.string().min(1),
  action: z.enum(['verify', 'reject']),
})

function parseTags(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) && parsed.every((tag) => typeof tag === 'string') ? parsed : []
  } catch {
    return []
  }
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error'
  const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500
  return NextResponse.json({ error: message }, { status })
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompanyAdmin()
    const params = req.nextUrl.searchParams
    const parsedPage = Number(params.get('page') ?? 1)
    const parsedLimit = Number(params.get('limit') ?? 20)
    const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1
    const limit = Number.isSafeInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20
    const visibleAgents = await db.agent.findMany({
      where: agentCompanyScope(user.companyId, 'view'),
      select: { id: true },
    })
    const where: Prisma.AgentMemoryWhereInput = {
      companyId: user.companyId,
      agentId: { in: visibleAgents.map((agent) => agent.id) },
    }
    const agentId = params.get('agentId')
    const category = params.get('category')
    if (agentId) {
      const agent = await db.agent.findFirst({
        where: { id: agentId, ...agentCompanyScope(user.companyId, 'view') },
        select: { id: true },
      })
      if (!agent) return NextResponse.json({ error: 'Agent not found for this company' }, { status: 404 })
      where.agentId = agent.id
    }
    if (category) where.category = category

    const [records, total] = await Promise.all([
      db.agentMemory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { agent: { select: { agentId: true, name: true, departmentName: true } } },
      }),
      db.agentMemory.count({ where }),
    ])
    return NextResponse.json({
      data: records.map((item) => ({
        id: item.id,
        agentId: item.agent.agentId,
        agentName: item.agent.name,
        department: item.agent.departmentName,
        category: item.category,
        content: item.content,
        source: item.source,
        confidence: item.confidence,
        useCount: item.useCount,
        successCount: item.successCount,
        failCount: item.failCount,
        temperature: item.temperature,
        isVerified: item.isVerified,
        tags: parseTags(item.tags),
        createdAt: item.createdAt,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireCompanyAdmin()
    const parsed = ReviewSchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    const record = await db.agentMemory.findFirst({ where: { id: parsed.data.id, companyId: user.companyId } })
    if (!record) return NextResponse.json({ error: 'Knowledge entry not found' }, { status: 404 })
    const agent = await db.agent.findFirst({
      where: { id: record.agentId, ...agentCompanyScope(user.companyId, 'view') },
      select: { id: true },
    })
    if (!agent) return NextResponse.json({ error: 'Knowledge entry not found' }, { status: 404 })

    if (parsed.data.action === 'verify') {
      const data = await db.$transaction(async (transaction) => {
        const updated = await transaction.agentMemory.update({
          where: { id: record.id },
          data: { isVerified: true, promotedAt: new Date() },
        })
        await transaction.auditEvent.create({
          data: {
            actorUserId: user.userId,
            companyId: user.companyId,
            action: 'agent_memory.verify',
            resource: 'agent-memory',
            resourceId: record.id,
            details: JSON.stringify({ agentId: record.agentId, source: record.source }),
          },
        })
        return updated
      })
      return NextResponse.json({ data })
    }
    await db.$transaction(async (transaction) => {
      await transaction.agentMemory.delete({ where: { id: record.id } })
      await transaction.auditEvent.create({
        data: {
          actorUserId: user.userId,
          companyId: user.companyId,
          action: 'agent_memory.reject',
          resource: 'agent-memory',
          resourceId: record.id,
          details: JSON.stringify({ agentId: record.agentId, source: record.source }),
        },
      })
    })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireCompanyAdmin()
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Knowledge ID required' }, { status: 400 })
    const record = await db.agentMemory.findFirst({ where: { id, companyId: user.companyId } })
    if (!record) return NextResponse.json({ error: 'Knowledge entry not found' }, { status: 404 })
    const agent = await db.agent.findFirst({
      where: { id: record.agentId, ...agentCompanyScope(user.companyId, 'view') },
      select: { id: true },
    })
    if (!agent) return NextResponse.json({ error: 'Knowledge entry not found' }, { status: 404 })
    await db.$transaction(async (transaction) => {
      await transaction.agentMemory.delete({ where: { id: record.id } })
      await transaction.auditEvent.create({
        data: {
          actorUserId: user.userId,
          companyId: user.companyId,
          action: 'agent_memory.delete',
          resource: 'agent-memory',
          resourceId: record.id,
          details: JSON.stringify({ agentId: record.agentId }),
        },
      })
    })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}
