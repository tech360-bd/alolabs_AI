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
    const company = searchParams.get('company')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const blocked = searchParams.get('blocked')
    const actionType = searchParams.get('actionType')

    const where: Record<string, unknown> = {}
    if (company) {
      where.commandId = undefined
    }
    if (blocked !== null && blocked !== undefined) {
      where.blocked = blocked === 'true'
    }
    if (actionType) {
      where.actionType = actionType
    }

    const [logs, total] = await Promise.all([
      db.protectionLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.protectionLog.count({ where }),
    ])

    return NextResponse.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('[Protection Logs] Error:', error)
    return NextResponse.json(
      { error: 'Failed to load protection logs' },
      { status: 500 }
    )
  }
}