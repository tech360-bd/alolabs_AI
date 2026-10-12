import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const [byCompany, byAgent, byWorkflow] = await Promise.all([
      db.usageLog.groupBy({
        by: ['companyId', 'companyName'],
        _count: { id: true },
        _sum: { tokensOrLocalUsed: true },
        where: { companyId: { not: null } },
        orderBy: { _count: { id: 'desc' } },
        take: 50,
      }),
      db.usageLog.groupBy({
        by: ['agentId', 'agentName'],
        _count: { id: true },
        _sum: { tokensOrLocalUsed: true },
        where: { agentId: { not: null } },
        orderBy: { _count: { id: 'desc' } },
        take: 50,
      }),
      db.usageLog.groupBy({
        by: ['workflowId', 'workflowName'],
        _count: { id: true },
        _sum: { tokensOrLocalUsed: true },
        where: { workflowId: { not: null } },
        orderBy: { _count: { id: 'desc' } },
        take: 50,
      }),
    ])

    const companySummaries = await db.companyUsageSummary.findMany({
      orderBy: { calculatedAt: 'desc' },
      take: 100,
    })

    const agentSummaries = await db.agentUsageSummary.findMany({
      orderBy: { calculatedAt: 'desc' },
      take: 100,
    })

    const workflowSummaries = await db.workflowUsageSummary.findMany({
      orderBy: { calculatedAt: 'desc' },
      take: 100,
    })

    const totalLogs = await db.usageLog.count()
    const paidApiCount = await db.usageLog.count({ where: { paidApiUsed: true } })
    const blockedCount = await db.usageLog.count({ where: { status: 'blocked' } })

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
    console.error('[Usage Dashboard] Error:', error)
    return NextResponse.json(
      { error: 'Failed to load usage dashboard' },
      { status: 500 }
    )
  }
}