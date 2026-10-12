import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireCompanyAuth } from '@/lib/api-auth'
import { uploadSource } from '@/lib/training'

const CreateSourceSchema = z.object({
  name: z.string().trim().min(1).max(255),
  type: z.string().trim().min(1).max(100),
  sourceUrl: z.string().url().optional(),
  content: z.string().max(200_000).optional(),
  level: z.number().int().min(1).max(10).optional(),
  departmentId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
})

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error'
  const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500
  return NextResponse.json({ error: message, success: false }, { status })
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const search = req.nextUrl.searchParams
    const where: Prisma.TrainingSourceWhereInput = { companyId: user.companyId }
    const status = search.get('status')
    const rawLevel = search.get('level')
    const agentId = search.get('agentId')
    if (status) where.status = status
    if (rawLevel) {
      const level = Number(rawLevel)
      if (!Number.isInteger(level) || level < 1 || level > 10) {
        return NextResponse.json({ error: 'level must be an integer from 1 to 10', success: false }, { status: 400 })
      }
      where.level = level
    }
    if (agentId) where.agentId = agentId

    const data = await db.trainingSource.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return NextResponse.json({ data, success: true })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const parsed = CreateSourceSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten(), success: false }, { status: 400 })
    }

    if (parsed.data.agentId) {
      const access = await db.agentCompanyAccess.findFirst({
        where: { agentId: parsed.data.agentId, companyId: user.companyId },
        select: { id: true },
      })
      if (!access) {
        return NextResponse.json({ error: 'Agent is not available to this company', success: false }, { status: 404 })
      }
    }

    const data = await uploadSource({ ...parsed.data, companyId: user.companyId })
    return NextResponse.json({ data, success: true }, { status: 201 })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}
