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
    const [protectionLogsCount, blockedActionsCount, auditLogsCount] = await Promise.all([
      db.protectionLog.count(),
      db.blockedAction.count(),
      db.auditLog.count(),
    ])

    const recentProtectionLogs = await db.protectionLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    const recentBlockedActions = await db.blockedAction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
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

    const auditByAction = await db.auditLog.groupBy({
      by: ['action'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 20,
    })

    const auditByResource = await db.auditLog.groupBy({
      by: ['resource'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 20,
    })

    const recentAuditLogs = await db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { user: { select: { name: true, email: true } } },
    })

    return NextResponse.json({
      summary: {
        protectionLogs: protectionLogsCount,
        blockedActions: blockedActionsCount,
        auditLogs: auditLogsCount,
      },
      blockedByType,
      blockedActionByType,
      auditByAction,
      auditByResource,
      recentProtectionLogs,
      recentBlockedActions,
      recentAuditLogs,
    })
  } catch (error) {
    console.error('[Security Dashboard] Error:', error)
    return NextResponse.json(
      { error: 'Failed to load security dashboard' },
      { status: 500 }
    )
  }
}