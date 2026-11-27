import { db } from '@/lib/db'
import { legacyTenant, tenantWhere, legacyAuthResponse } from '@/lib/api/legacy-session'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const tenant = await legacyTenant(request)
    const { taskId } = await params

    const task = await db.task.findFirst({
      where: tenantWhere(tenant, { id: taskId }),
      select: { id: true },
    })
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const steps = await db.taskStep.findMany({
      where: { taskId },
      orderBy: [{ stepNumber: 'asc' }, { createdAt: 'asc' }],
    })

    return NextResponse.json(steps)
  } catch (error) {
    const authFailure = legacyAuthResponse(error)
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status })
    console.error('[Task Steps] Error:', error)
    return NextResponse.json(
      { error: 'Failed to load task steps' },
      { status: 500 }
    )
  }
}
