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
    const [totalBlocked, totalAllowed, totalReplacements] = await Promise.all([
      db.paymentGuardLog.count({ where: { blocked: true } }),
      db.paymentGuardLog.count({ where: { blocked: false } }),
      db.paymentGuardLog.count({ where: { replacementUsed: true } }),
    ])

    const blockedByApi = await db.paymentGuardLog.groupBy({
      by: ['apiName'],
      where: { blocked: true },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    })

    const allowedByApi = await db.paymentGuardLog.groupBy({
      by: ['apiName'],
      where: { blocked: false },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    })

    const replacementsByApi = await db.paymentGuardLog.groupBy({
      by: ['replacementName'],
      where: { replacementUsed: true },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    })

    const recentBlocked = await db.paymentGuardLog.findMany({
      where: { blocked: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    const recentApproved = await db.paymentGuardLog.findMany({
      where: { blocked: false },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    const estimatedCostSavings = await db.costEstimate.aggregate({
      where: { status: 'rejected' },
      _sum: { estimatedCost: true },
    })

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayBlocked = await db.paymentGuardLog.count({
      where: { blocked: true, createdAt: { gte: today } },
    })

    return NextResponse.json({
      summary: {
        totalBlocked,
        totalAllowed,
        totalReplacements,
        todayBlocked,
        estimatedCostSavings: estimatedCostSavings._sum.estimatedCost ?? 0,
      },
      blockedByApi,
      allowedByApi,
      replacementsByApi,
      recentBlocked,
      recentApproved,
    })
  } catch (error) {
    console.error('[Payment Guard Report] Error:', error)
    return NextResponse.json(
      { error: 'Failed to load payment guard report' },
      { status: 500 }
    )
  }
}