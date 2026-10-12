import { NextRequest, NextResponse } from 'next/server'
import { requireCompanyAuth } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { runHealthCheck } from '@/lib/ai-workforce'

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error'
  const status = message === 'Unauthorized' ? 401
    : message === 'Forbidden' ? 403
      : message === 'Instance not found' ? 404
        : 500
  return NextResponse.json({ error: message, success: false }, { status })
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompanyAuth()
    const { id } = await params
    const instance = await db.agentInstance.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true, healthStatus: true, lastHealthCheck: true },
    })
    if (!instance) return NextResponse.json({ error: 'Instance not found', success: false }, { status: 404 })
    const checks = await db.agentHealthCheck.findMany({
      where: { instanceId: instance.id },
      orderBy: { checkedAt: 'desc' },
      take: 100,
    })
    return NextResponse.json({ data: { instance, checks }, success: true })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCompanyAuth()
    const { id } = await params
    const data = await runHealthCheck(id, user.companyId)
    return NextResponse.json({ data, success: true })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}
