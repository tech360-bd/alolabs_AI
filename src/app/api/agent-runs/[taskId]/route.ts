import { db } from '@/lib/db'
import { legacyTenant, tenantWhere, legacyAuthResponse } from '@/lib/api/legacy-session'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  // Session → live Company membership. Authentication alone never authorises.
  const tenant = await legacyTenant(request);
  try {
    const { taskId } = await params

    const runs = await db.agentRun.findMany({
      where: tenantWhere(tenant),
      where: { taskId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(runs)
  } catch (error) {
    const authFailure = legacyAuthResponse(error);
    if (authFailure) return NextResponse.json({ error: authFailure.error }, { status: authFailure.status });
    console.error('[Agent Runs] Error:', error)
    return NextResponse.json(
      { error: 'Failed to load agent runs' },
      { status: 500 }
    )
  }
}