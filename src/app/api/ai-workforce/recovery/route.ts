import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCompanyAuth } from '@/lib/api-auth'
import {
  autoRestart,
  getRecoveryEvents,
  recoverAgent,
  recoverQueue,
  recoverWorkflow,
  retryExecution,
  rollbackInstance,
} from '@/lib/ai-workforce'

const RecoveryRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('retry'), executionId: z.string().min(1) }),
  z.object({ action: z.literal('recover_queue') }),
  z.object({ action: z.literal('recover_workflow'), workflowId: z.string().min(1) }),
  z.object({ action: z.literal('auto_restart'), instanceId: z.string().min(1) }),
  z.object({ action: z.literal('rollback'), instanceId: z.string().min(1) }),
  z.object({ action: z.literal('recover_agent'), agentId: z.string().min(1) }),
])

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error'
  const status = message === 'Unauthorized' ? 401
    : message === 'Forbidden' ? 403
      : message.includes('not found') ? 404
        : message.includes('Only failed') || message.includes('Max retries') || message.includes('no longer') ? 409
          : 500
  return NextResponse.json({ error: message, success: false }, { status })
}

function canInitiateRecovery(user: { role: string; companyRole?: string }): boolean {
  return user.role === 'admin' || user.role === 'super_admin' || user.role === 'owner' ||
    user.companyRole === 'admin' || user.companyRole === 'owner' || user.companyRole === 'manager'
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const search = req.nextUrl.searchParams
    const limitValue = Number(search.get('limit') ?? 50)
    const limit = Number.isSafeInteger(limitValue) ? Math.min(Math.max(limitValue, 1), 100) : 50
    const data = await getRecoveryEvents({
      companyId: user.companyId,
      ...(search.get('instanceId') ? { instanceId: search.get('instanceId')! } : {}),
      ...(search.get('agentId') ? { agentId: search.get('agentId')! } : {}),
      ...(search.get('type') ? { type: search.get('type')! } : {}),
      ...(search.get('status') ? { status: search.get('status')! } : {}),
      limit,
    })
    return NextResponse.json({ data, success: true })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    if (!canInitiateRecovery(user)) {
      return NextResponse.json({ error: 'Forbidden', success: false }, { status: 403 })
    }
    const parsed = RecoveryRequestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten(), success: false }, { status: 400 })
    }

    const request = parsed.data
    switch (request.action) {
      case 'retry': {
        const data = await retryExecution(request.executionId, user.companyId, user.userId)
        const status = data.status === 'approval_required' ? 202 : data.success ? 200 : 502
        return NextResponse.json({ data, success: data.success }, { status })
      }
      case 'recover_queue': {
        const data = await recoverQueue('agent-execution', user.companyId)
        return NextResponse.json({ data, success: true })
      }
      case 'recover_workflow': {
        const data = await recoverWorkflow(request.workflowId, user.companyId)
        return NextResponse.json({ data, success: true })
      }
      case 'auto_restart': {
        const data = await autoRestart(request.instanceId, user.companyId)
        return NextResponse.json({ data, success: false }, { status: 501 })
      }
      case 'rollback': {
        const data = await rollbackInstance(request.instanceId, user.companyId)
        return NextResponse.json({ data, success: false }, { status: 501 })
      }
      case 'recover_agent': {
        const data = await recoverAgent(request.agentId, user.companyId)
        return NextResponse.json({ data, success: false }, { status: 501 })
      }
    }
  } catch (error: unknown) {
    return errorResponse(error)
  }
}
