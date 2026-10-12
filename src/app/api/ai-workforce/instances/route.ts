import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireCompanyAuth } from '@/lib/api-auth'
import type { Prisma } from '@prisma/client'

const CreateInstanceSchema = z.object({
  agentId: z.string().min(1),
  catalogId: z.string().min(1).optional(),
  config: z.record(z.string(), z.unknown()).default({}),
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseConfigTemplate(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value)
  if (!isRecord(parsed)) throw new Error('Catalog config template must be a JSON object')
  return parsed
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error'
  const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500
  return NextResponse.json({ error: message, success: false }, { status })
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const search = req.nextUrl.searchParams
    const where: Prisma.AgentInstanceWhereInput = { companyId: user.companyId }
    const status = search.get('status')
    const agentId = search.get('agentId')
    if (status) where.status = status
    if (agentId) where.agentId = agentId

    const data = await db.agentInstance.findMany({
      where,
      orderBy: { installedAt: 'desc' },
      include: {
        agent: { select: { id: true, agentId: true, name: true, status: true } },
        catalog: true,
        _count: { select: { executions: true, healthChecks: true } },
      },
    })
    return NextResponse.json({ data, success: true })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const parsed = CreateInstanceSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten(), success: false }, { status: 400 })
    }

    const agent = await db.agent.findFirst({
      where: {
        id: parsed.data.agentId,
        status: 'active',
        agentCompanyAccess: { some: { companyId: user.companyId } },
      },
      select: { id: true },
    })
    if (!agent) {
      return NextResponse.json({ error: 'Active agent is not available to this company', success: false }, { status: 404 })
    }

    const catalogItem = parsed.data.catalogId
      ? await db.agentCatalogItem.findFirst({
          where: { id: parsed.data.catalogId, isActive: true },
          select: { id: true, configTemplate: true },
        })
      : null
    if (parsed.data.catalogId && !catalogItem) {
      return NextResponse.json({ error: 'Active catalog item not found', success: false }, { status: 404 })
    }
    const template = catalogItem ? parseConfigTemplate(catalogItem.configTemplate) : {}
    const config = { ...template, ...parsed.data.config }

    const data = await db.$transaction(async (transaction) => {
      const instance = await transaction.agentInstance.create({
        data: {
          agentId: parsed.data.agentId,
          catalogId: parsed.data.catalogId,
          companyId: user.companyId,
          config: JSON.stringify(config),
          status: 'active',
        },
      })
      if (catalogItem) {
        await transaction.agentCatalogItem.update({
          where: { id: catalogItem.id },
          data: { installCount: { increment: 1 } },
        })
      }
      return instance
    })
    return NextResponse.json({ data, success: true }, { status: 201 })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}
