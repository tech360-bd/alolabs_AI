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
    const [costEstimates, paymentGuardLogs, paidApiUsageLogs] = await Promise.all([
      db.costEstimate.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      db.paymentGuardLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      db.usageLog.findMany({
        where: { paidApiUsed: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ])

    const totalEstimatedCost = await db.costEstimate.aggregate({
      _sum: { estimatedCost: true },
    })

    const totalActualCost = await db.costEstimate.aggregate({
      where: { actualCost: { not: null } },
      _sum: { actualCost: true },
    })

    const approvedCosts = await db.costEstimate.aggregate({
      where: { status: 'approved' },
      _sum: { estimatedCost: true, actualCost: true },
      _count: { id: true },
    })

    const rejectedCosts = await db.costEstimate.aggregate({
      where: { status: 'rejected' },
      _sum: { estimatedCost: true },
      _count: { id: true },
    })

    const pendingCosts = await db.costEstimate.aggregate({
      where: { status: 'pending' },
      _sum: { estimatedCost: true },
      _count: { id: true },
    })

    const blockedPayments = await db.paymentGuardLog.count({
      where: { blocked: true },
    })

    const allowedPayments = await db.paymentGuardLog.count({
      where: { blocked: false },
    })

    const replacementsUsed = await db.paymentGuardLog.count({
      where: { replacementUsed: true },
    })

    const blockedSavings = await db.paymentGuardLog.aggregate({
      where: { blocked: true },
      _count: { id: true },
    })

    const costByProvider = await db.costEstimate.groupBy({
      by: ['provider'],
      _sum: { estimatedCost: true, actualCost: true },
      _count: { id: true },
      orderBy: { _sum: { estimatedCost: 'desc' } },
    })

    const costByCompany = await db.costEstimate.groupBy({
      by: ['companyId'],
      _sum: { estimatedCost: true, actualCost: true },
      _count: { id: true },
      orderBy: { _sum: { estimatedCost: 'desc' } },
    })

    const paidApiTotalTokens = await db.usageLog.aggregate({
      where: { paidApiUsed: true },
      _sum: { tokensOrLocalUsed: true },
      _count: { id: true },
    })

    return NextResponse.json({
      costEstimates,
      paymentGuardLogs,
      paidApiUsageLogs,
      summary: {
        totalEstimatedCost: totalEstimatedCost._sum.estimatedCost ?? 0,
        totalActualCost: totalActualCost._sum.actualCost ?? 0,
        approved: {
          count: approvedCosts._count.id,
          estimatedCost: approvedCosts._sum.estimatedCost ?? 0,
          actualCost: approvedCosts._sum.actualCost ?? 0,
        },
        rejected: {
          count: rejectedCosts._count.id,
          estimatedCost: rejectedCosts._sum.estimatedCost ?? 0,
        },
        pending: {
          count: pendingCosts._count.id,
          estimatedCost: pendingCosts._sum.estimatedCost ?? 0,
        },
        paymentGuard: {
          blocked: blockedPayments,
          allowed: allowedPayments,
          replacementsUsed,
          blockedCount: blockedSavings._count.id,
        },
        paidApi: {
          totalRequests: paidApiTotalTokens._count.id,
          totalTokens: paidApiTotalTokens._sum.tokensOrLocalUsed ?? 0,
        },
      },
      costByProvider,
      costByCompany,
    })
  } catch (error) {
    console.error('[Cost Dashboard] Error:', error)
    return NextResponse.json(
      { error: 'Failed to load cost dashboard' },
      { status: 500 }
    )
  }
}