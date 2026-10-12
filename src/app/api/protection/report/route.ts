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
    const totalProtectionLogs = await db.protectionLog.count()
    const totalBlockedActions = await db.blockedAction.count()

    const blockedLogsCount = await db.protectionLog.count({
      where: { blocked: true },
    })

    const allowedLogsCount = await db.protectionLog.count({
      where: { blocked: false },
    })

    const blockedByType = await db.protectionLog.groupBy({
      by: ['actionType'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    })

    const blockedActionByType = await db.blockedAction.groupBy({
      by: ['actionType'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    })

    const recentBlocks = await db.protectionLog.findMany({
      where: { blocked: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    const recentBlockedActions = await db.blockedAction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayBlocks = await db.protectionLog.count({
      where: { blocked: true, createdAt: { gte: today } },
    })

    const lastWeek = new Date()
    lastWeek.setDate(lastWeek.getDate() - 7)
    const weekBlocks = await db.protectionLog.count({
      where: { blocked: true, createdAt: { gte: lastWeek } },
    })

    return NextResponse.json({
      summary: {
        totalProtectionLogs,
        totalBlockedActions,
        blockedLogs: blockedLogsCount,
        allowedLogs: allowedLogsCount,
        todayBlocks,
        weekBlocks,
      },
      blockedByType,
      blockedActionByType,
      recentBlocks,
      recentBlockedActions,
    })
  } catch (error) {
    console.error('[Protection Report] Error:', error)
    return NextResponse.json(
      { error: 'Failed to load protection report' },
      { status: 500 }
    )
  }
}