import { db } from '@/lib/db'
import { legacyTenant, tenantWhere, legacyAuthResponse } from '@/lib/api/legacy-session'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const tenant = await legacyTenant(request)
    const [byCompany, byAgent, byWorkflow] = await Promise.all([
      db.usageLog.groupBy({
        by: ['companyId', 'companyName'],
        _count: { id: true },
        _sum: { tokensOrLocalUsed: true },
        where: tenantWhere(tenant),
        orderBy: { _count: { id: 'desc' } },
        take: 50,
      }),
      db.usageLog.groupBy({
        by: ['agentId', 'agentName'],
        _count: { id: true },
        _sum: { tokensOrLocalUsed: true },
        where: tenantWhere(tenant, { agentId: { not: null } }),
        orderBy: { _count: { id: 'desc' } },
        take: 50,
      }),
      db.usageLog.groupBy({
        by: ['workflowId', 'workflowName'],
        _count: { id: true },
        _sum: { tokensOrLocalUsed: true },
        where: tenantWhere(tenant, { workflowId: { not: null } }),
        orderBy: { _count: { id: 'desc' } },
        take: 50,
      }),
    ])

    const companySummaries = await db.companyUsageSummary.findMany({
      where: tenantWhere(tenant),
      orderBy: { calculatedAt: 'desc' },
      take: 100,
    })

    const companyAgents = await db.agent.findMany({
      where: tenantWhere(tenant),
      select: { id: true },
    })
    const companyWorkflowIds = Array.from(
      new Set(
        byWorkflow
          .map((w) => w.workflowId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    )

    const agentSummaries = companyAgents.length > 0
      ? await db.agentUsageSummary.findMany({
          where: { agentId: { in: companyAgents.map((a) => a.id) } },
          orderBy: { calculatedAt: 'desc' },
          take: 100,
        })
      : []

    const workflowSummaries = companyWorkflowIds.length > 0
      ? await db.workflowUsageSummary.findMany({
          where: { workflowId: { in: companyWorkflowIds } },
          orderBy: { calculatedAt: 'desc' },
          take: 100,
        })
      : []

    const totalLogs = await db.usageLog.count({ where: tenantWhere(tenant) })
    const paidApiCount = await db.usageLog.count({ where: tenantWhere(tenant, { paidApiUsed: true }) })
    const blockedCount = await db.usageLog.count({ where: tenantWhere(tenant, { status: 'blocked' }) })

    return NextResponse.json({
      byCompany,
      byAgent,
      byWorkflow,
      companySummaries,
      agentSummaries,
      workflowSummaries,
      totals: {
        totalLogs,
        paidApiCount,
        blockedCount,
      },
    })
  } catch (error) {
    const authFailure = legacyAuthResponse(error)
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status })
    console.error('[Usage Dashboard] Error:', error)
    return NextResponse.json(
      { error: 'Failed to load usage dashboard' },
      { status: 500 }
    )
  }
}
