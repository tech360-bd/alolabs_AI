import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireCompanyAuth } from '@/lib/api-auth'
import type { Prisma } from '@prisma/client'

const CreateMetricSchema = z.object({
  instanceId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  metricType: z.string().trim().min(1),
  metricName: z.string().trim().min(1),
  value: z.number().finite(),
  unit: z.string().trim().optional(),
  dimensions: z.record(z.string(), z.unknown()).default({}),
}).refine((value) => value.instanceId || value.agentId, {
  message: 'instanceId or agentId is required',
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
    const where: Prisma.MetricWhereInput = { companyId: user.companyId }
    const instanceId = search.get('instanceId')
    const agentId = search.get('agentId')
    const metricType = search.get('metricType')
    if (instanceId) where.instanceId = instanceId
    if (agentId) where.agentId = agentId
    if (metricType) where.metricType = metricType

    const data = await db.metric.findMany({
      where,
      orderBy: { recordedAt: 'desc' },
      take: 500,
    })
    return NextResponse.json({ data, success: true })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const parsed = CreateMetricSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten(), success: false }, { status: 400 })
    }

    let agentId = parsed.data.agentId
    if (parsed.data.instanceId) {
      const instance = await db.agentInstance.findFirst({
        where: { id: parsed.data.instanceId, companyId: user.companyId },
        select: { agentId: true },
      })
      if (!instance) {
        return NextResponse.json({ error: 'Instance not found for this company', success: false }, { status: 404 })
      }
      if (agentId && agentId !== instance.agentId) {
        return NextResponse.json({ error: 'Agent does not match the instance', success: false }, { status: 400 })
      }
      agentId = instance.agentId
    } else if (agentId) {
      const access = await db.agentCompanyAccess.findFirst({
        where: { agentId, companyId: user.companyId },
        select: { id: true },
      })
      if (!access) {
        return NextResponse.json({ error: 'Agent is not available to this company', success: false }, { status: 404 })
      }
    }

    const data = await db.metric.create({
      data: {
        instanceId: parsed.data.instanceId,
        agentId,
        companyId: user.companyId,
        metricType: parsed.data.metricType,
        name: parsed.data.metricName,
        value: parsed.data.value,
        unit: parsed.data.unit || 'count',
        dimensions: JSON.stringify(parsed.data.dimensions),
      },
    })
    return NextResponse.json({ data, success: true }, { status: 201 })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}
