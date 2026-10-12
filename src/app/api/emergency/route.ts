import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'

const EMERGENCY_KEYS = [
  { key: 'emergency_stop_communication', label: 'Stop All External Communication' },
  { key: 'emergency_stop_gpu', label: 'Stop All GPU Jobs' },
  { key: 'emergency_disable_paid', label: 'Disable Paid Services' },
  { key: 'emergency_readonly', label: 'Activate Read-Only Mode' },
  { key: 'emergency_revoke_sessions', label: 'Revoke All Active Sessions' },
  { key: 'emergency_stop_queues', label: 'Stop All Job Queues' },
  { key: 'emergency_block_apikeys', label: 'Block All Company API Keys' },
  { key: 'emergency_global_stop', label: 'Global Emergency Stop' },
]

export async function GET(request: NextRequest) {
  try {
    await requireRole('super_admin', 'admin');
    const settings = await db.settings.findMany({
      where: { key: { startsWith: 'emergency_' } },
    })
    const stateMap: Record<string, { enabled: boolean; updatedAt: string | null }> = {}
    for (const s of settings) {
      try {
        const parsed = JSON.parse(s.value)
        stateMap[s.key] = { enabled: !!parsed.enabled, updatedAt: s.updatedAt?.toISOString() ?? null }
      } catch {
        stateMap[s.key] = { enabled: s.value === 'true', updatedAt: s.updatedAt?.toISOString() ?? null }
      }
    }

    // Log query for activity
    const recentLogs = await db.serverLog.findMany({
      where: { message: { contains: 'emergency' } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    const toggles = EMERGENCY_KEYS.map((item) => ({
      ...item,
      enabled: stateMap[item.key]?.enabled ?? false,
      updatedAt: stateMap[item.key]?.updatedAt ?? null,
    }))

    return NextResponse.json({
      toggles,
      activity: recentLogs.map((l) => ({
        id: l.id,
        level: l.level,
        message: l.message,
        metadata: l.metadata,
        createdAt: l.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message === 'Forbidden' ? 'Forbidden' : 'Unauthorized' }, { status: error.message === 'Forbidden' ? 403 : 401 });
    }
    console.error('Emergency GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole('super_admin', 'admin');
    const body = await request.json()
    const { action, enabled } = body as { action: string; enabled: boolean }

    if (!EMERGENCY_KEYS.find((k) => k.key === action)) {
      return NextResponse.json({ error: 'Unknown emergency action' }, { status: 400 })
    }

    const value = JSON.stringify({ enabled })
    await db.settings.upsert({
      where: { key: action },
      update: { value, type: 'json', updatedAt: new Date() },
      create: { key: action, value, type: 'json' },
    })

    await db.serverLog.create({
      data: {
        level: enabled ? 'error' : 'info',
        message: `emergency: ${action} ${enabled ? 'ACTIVATED' : 'DEACTIVATED'}`,
        metadata: JSON.stringify({ action, enabled }),
      },
    })

    return NextResponse.json({ success: true, action, enabled })
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message === 'Forbidden' ? 'Forbidden' : 'Unauthorized' }, { status: error.message === 'Forbidden' ? 403 : 401 });
    }
    console.error('Emergency POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}