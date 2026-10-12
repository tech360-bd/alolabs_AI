import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth check
  const authHeader = _request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { verifySessionToken } = await import('@/lib/auth');
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  try {
    const { id } = await params
    const trigger = await db.automationTrigger.findUnique({ where: { id } })
    if (!trigger) {
      return NextResponse.json({ error: 'Trigger not found' }, { status: 404 })
    }

    const newEnabled = !trigger.enabled
    await db.automationTrigger.update({
      where: { id },
      data: { enabled: newEnabled },
    })

    return NextResponse.json({
      data: {
        id: trigger.id,
        name: trigger.name,
        enabled: newEnabled,
        previousState: trigger.enabled,
      },
    })
  } catch (error) {
    console.error('[POST /api/automation/triggers/[id]/toggle]', error)
    return NextResponse.json({ error: 'Failed to toggle trigger' }, { status: 500 })
  }
}