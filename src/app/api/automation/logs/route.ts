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
    const { searchParams } = new URL(request.url)
    const triggerId = searchParams.get('triggerId') || undefined
    const status = searchParams.get('status') || undefined
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))

    const where: Record<string, unknown> = {}
    if (triggerId) where.triggerId = triggerId
    if (status) where.status = status

    const [logs, total] = await Promise.all([
      db.automationTriggerLog.findMany({
        where,
        include: {
          trigger: {
            select: { id: true, name: true, type: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.automationTriggerLog.count({ where }),
    ])

    return NextResponse.json({
      data: logs.map((l) => ({
        ...l,
        eventData: JSON.parse(l.eventData || '{}'),
        actionResults: JSON.parse(l.actionResults || '[]'),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('[GET /api/automation/logs]', error)
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 })
  }
}