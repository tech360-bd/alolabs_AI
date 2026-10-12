import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireCompanyAuth } from '@/lib/api-auth'

const CreateAlertSchema = z.object({
  instanceId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  alertType: z.string().trim().min(1).max(100),
  severity: z.enum(['critical', 'high', 'medium', 'warning', 'low']).default('warning'),
  message: z.string().trim().min(1).max(5000),
  metadata: z.record(z.string(), z.unknown()).default({}),
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
    const where: Prisma.AgentAlertWhereInput = { companyId: user.companyId }
    const agentId = search.get('agentId')
    const severity = search.get('severity')
    const acknowledged = search.get('acknowledged')
    if (agentId) where.agentId = agentId
    if (severity) where.severity = severity
    if (acknowledged === 'true' || acknowledged === 'false') where.isAcknowledged = acknowledged === 'true'

    const data = await db.agentAlert.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 })
    return NextResponse.json({ data, success: true })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const parsed = CreateAlertSchema.safeParse(await req.json())
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

    const data = await db.agentAlert.create({
      data: {
        instanceId: parsed.data.instanceId,
        agentId,
        companyId: user.companyId,
        alertType: parsed.data.alertType,
        severity: parsed.data.severity,
        message: parsed.data.message,
        metadata: JSON.stringify(parsed.data.metadata),
      },
    })
    return NextResponse.json({ data, success: true }, { status: 201 })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const parsed = z.object({ id: z.string().min(1) }).safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten(), success: false }, { status: 400 })
    }

    const result = await db.agentAlert.updateMany({
      where: { id: parsed.data.id, companyId: user.companyId },
      data: { isAcknowledged: true, acknowledgedBy: user.userId, resolvedAt: new Date() },
    })
    if (result.count === 0) {
      return NextResponse.json({ error: 'Alert not found for this company', success: false }, { status: 404 })
    }
    const data = await db.agentAlert.findFirst({ where: { id: parsed.data.id, companyId: user.companyId } })
    return NextResponse.json({ data, success: true })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}
