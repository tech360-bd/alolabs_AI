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

    const outputs = await db.output.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(outputs)
  } catch (error) {
    const authFailure = legacyAuthResponse(error)
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status })
    console.error('[Outputs] Error:', error)
    return NextResponse.json(
      { error: 'Failed to load outputs' },
      { status: 500 }
    )
  }
}
