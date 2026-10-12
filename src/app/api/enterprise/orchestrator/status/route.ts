import { NextRequest, NextResponse } from 'next/server'
import { requireCompanyAuth } from '@/lib/api-auth'
import { getOrchestrator } from '@/lib/multi-agent-orchestrator'

export async function GET(request: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const taskId = request.nextUrl.searchParams.get('taskId')
    if (!taskId) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'taskId query parameter is required',
        },
      }, { status: 400 })
    }

    const task = await getOrchestrator().getTaskStatus(taskId, user.companyId)
    if (!task) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Orchestration task not found for this company',
        },
      }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: {
        taskId: task.id,
        type: task.type,
        status: task.status,
        priority: task.priority,
        input: task.input,
        error: task.error,
        steps: task.steps.map((step) => ({
          id: step.id,
          agentId: step.agentId,
          status: step.status,
          latencyMs: step.latencyMs,
          error: step.error,
          executionId: step.executionId,
          approvalId: step.approvalId,
          startedAt: step.startedAt?.toISOString() ?? null,
          completedAt: step.completedAt?.toISOString() ?? null,
        })),
        result: task.result
          ? {
              finalOutput: task.result.finalOutput,
              totalLatencyMs: task.result.totalLatencyMs,
              totalTokens: task.result.totalTokens,
              costUsd: task.result.costUsd,
              agentIds: task.result.agentIds,
              modelUsed: task.result.modelUsed,
            }
          : null,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500
    return NextResponse.json({
      success: false,
      error: {
        code: status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR',
        message,
      },
    }, { status })
  }
}
