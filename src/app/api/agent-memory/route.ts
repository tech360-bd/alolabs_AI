import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireCompanyAuth } from '@/lib/api-auth'
import {
  parseQuery,
  paginationQuery,
  buildOrderBy,
  paginatedResponse,
} from '@/lib/validators'

const CreateSchema = z.object({
  agentId: z.string().min(1),
  category: z.string().trim().min(1).max(80).default('general'),
  content: z.string().trim().min(1).max(20000),
  temperature: z.enum(['hot', 'warm', 'cold']).default('hot'),
})

const UpdateSchema = z.object({
  category: z.string().trim().min(1).max(80).optional(),
  content: z.string().trim().min(1).max(20000).optional(),
  temperature: z.enum(['hot', 'warm', 'cold']).optional(),
  successCount: z.number().int().min(0).optional(),
  useCount: z.number().int().min(0).optional(),
  promotedAt: z.string().datetime().nullable().optional(),
})
const UpdateRequestSchema = UpdateSchema.extend({ id: z.string().min(1) })

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error'
  const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500
  return NextResponse.json({ error: message, success: false }, { status })
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const parsed = parseQuery(paginationQuery, request.nextUrl.searchParams)
    if (parsed.error) return NextResponse.json({ error: parsed.error.message }, { status: parsed.error.status })
    const { page, limit, sort, order, search } = parsed.data
    const where: Prisma.AgentMemoryWhereInput = {
      companyId: user.companyId,
      ...(search ? { OR: [{ category: { contains: search } }, { content: { contains: search } }] } : {}),
    }
    const orderBy = buildOrderBy(sort, order)
    const [records, total] = await Promise.all([
      db.agentMemory.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy }),
      db.agentMemory.count({ where }),
    ])
    return NextResponse.json(paginatedResponse(records, page, limit, total))
  } catch (error: unknown) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const parsed = CreateSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const access = await db.agentCompanyAccess.findFirst({
      where: { agentId: parsed.data.agentId, companyId: user.companyId, agent: { status: 'active' } },
      select: { id: true },
    })
    if (!access) return NextResponse.json({ error: 'Agent is not available to this company' }, { status: 404 })

    const record = await db.agentMemory.create({
      data: { ...parsed.data, companyId: user.companyId },
    })
    await db.auditLog.create({
      data: { action: 'create', resource: 'AgentMemory', details: JSON.stringify({ id: record.id }), userId: user.userId },
    })
    return NextResponse.json({ data: record }, { status: 201 })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const parsed = UpdateRequestSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    const { id, ...fields } = parsed.data
    const existing = await db.agentMemory.findFirst({ where: { id, companyId: user.companyId } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const data = {
      ...(fields.category !== undefined ? { category: fields.category } : {}),
      ...(fields.content !== undefined ? { content: fields.content } : {}),
      ...(fields.temperature !== undefined ? { temperature: fields.temperature } : {}),
      ...(fields.successCount !== undefined ? { successCount: fields.successCount } : {}),
      ...(fields.useCount !== undefined ? { useCount: fields.useCount } : {}),
      ...(fields.promotedAt !== undefined ? { promotedAt: fields.promotedAt === null ? null : new Date(fields.promotedAt) } : {}),
    }
    const record = await db.agentMemory.update({ where: { id: existing.id }, data })
    await db.auditLog.create({
      data: { action: 'update', resource: 'AgentMemory', details: JSON.stringify({ id, changes: fields }), userId: user.userId },
    })
    return NextResponse.json({ data: record })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const id = request.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    const existing = await db.agentMemory.findFirst({ where: { id, companyId: user.companyId } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await db.agentMemory.delete({ where: { id: existing.id } })
    await db.auditLog.create({
      data: { action: 'delete', resource: 'AgentMemory', details: JSON.stringify({ id }), userId: user.userId },
    })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}
