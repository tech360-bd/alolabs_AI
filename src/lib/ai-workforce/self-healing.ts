import { db } from '@/lib/db'
import { executeAgentPipeline } from './execution-engine'
import type { Prisma } from '@prisma/client'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseExecutionInput(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value)
  if (!isRecord(parsed)) throw new Error('Execution input is not a JSON object')
  return parsed
}

function taskPriority(value: string): 'critical' | 'high' | 'normal' | 'low' {
  if (value === 'critical' || value === 'high' || value === 'low') return value
  return 'normal'
}

async function recordUnsupportedRecovery(input: {
  instanceId: string
  companyId: string
  recoveryType: string
  triggerReason: string
}) {
  const instance = await db.agentInstance.findFirst({
    where: { id: input.instanceId, companyId: input.companyId },
    select: { id: true, agentId: true },
  })
  if (!instance) throw new Error('Instance not found for this company')

  const error = 'No isolated agent worker controller is configured; this action did not restart or modify the instance.'
  const event = await db.agentRecoveryEvent.create({
    data: {
      instanceId: instance.id,
      agentId: instance.agentId,
      recoveryType: input.recoveryType,
      triggerReason: input.triggerReason,
      actionsTaken: JSON.stringify([]),
      status: 'unsupported',
      error,
      companyId: input.companyId,
    },
  })
  return { success: false, unsupported: true, eventId: event.id, error }
}

export async function autoRestart(instanceId: string, companyId: string) {
  return recordUnsupportedRecovery({
    instanceId,
    companyId,
    recoveryType: 'auto_restart',
    triggerReason: 'manual_restart_requested',
  })
}

export async function retryExecution(executionId: string, companyId: string, retriedBy: string) {
  const execution = await db.agentExecution.findFirst({
    where: { id: executionId, companyId },
  })
  if (!execution) throw new Error('Execution not found for this company')
  if (execution.status !== 'failed') throw new Error('Only failed executions can be retried')
  if (execution.retryCount >= execution.maxRetries) throw new Error('Max retries exceeded')
  if (!execution.userId) throw new Error('Execution has no user context and cannot be retried safely')

  const instance = await db.agentInstance.findFirst({
    where: { id: execution.instanceId, companyId, status: 'active' },
    select: { id: true },
  })
  if (!instance) throw new Error('Active agent instance not found for this company')
  const input = parseExecutionInput(execution.input)

  const claimed = await db.agentExecution.updateMany({
    where: {
      id: execution.id,
      companyId,
      status: 'failed',
      retryCount: execution.retryCount,
    },
    data: { retryCount: { increment: 1 } },
  })
  if (claimed.count !== 1) throw new Error('Execution is no longer eligible for retry')

  const startedAt = Date.now()
  const result = await executeAgentPipeline(execution.instanceId, input, {
    companyId,
    userId: execution.userId,
    priority: taskPriority(execution.priority),
  })
  const recoveryStatus = result.needsApproval ? 'approval_required' : result.success ? 'success' : 'failed'
  const event = await db.agentRecoveryEvent.create({
    data: {
      executionId: execution.id,
      instanceId: execution.instanceId,
      agentId: execution.assignedAgentId ?? undefined,
      recoveryType: 'retry',
      triggerReason: 'authorized_retry_request',
      actionsTaken: JSON.stringify([{ action: 'new_runtime_execution', newExecutionId: result.executionId }]),
      status: recoveryStatus,
      error: result.error,
      durationMs: Date.now() - startedAt,
      companyId,
    },
  })
  await db.auditLog.create({
    data: {
      userId: retriedBy,
      action: 'agent_execution.retry_requested',
      resource: execution.id,
      details: JSON.stringify({ companyId, newExecutionId: result.executionId, status: recoveryStatus }),
    },
  })
  return {
    success: result.success || result.needsApproval === true,
    eventId: event.id,
    newExecutionId: result.executionId,
    status: recoveryStatus,
    ...(result.error ? { error: result.error } : {}),
  }
}

export async function rollbackInstance(instanceId: string, companyId: string) {
  return recordUnsupportedRecovery({
    instanceId,
    companyId,
    recoveryType: 'rollback',
    triggerReason: 'manual_rollback_requested',
  })
}

export async function recoverQueue(queueName: string, companyId: string) {
  if (queueName !== 'agent-execution') {
    throw new Error('Only the agent-execution queue is backed by persisted execution records')
  }

  const startedAt = Date.now()
  const cutoff = new Date(startedAt - 5 * 60 * 1000)
  const staleExecutions = await db.agentExecution.findMany({
    where: { companyId, status: 'running', updatedAt: { lt: cutoff } },
    select: { id: true },
    take: 500,
  })
  let recovered = 0
  for (const execution of staleExecutions) {
    const result = await db.agentExecution.updateMany({
      where: { id: execution.id, companyId, status: 'running', updatedAt: { lt: cutoff } },
      data: {
        status: 'failed',
        step: 'failed',
        error: 'stale_execution_timeout',
        errorMessage: 'Marked failed because no runtime update was recorded for five minutes',
        completedAt: new Date(),
      },
    })
    recovered += result.count
  }

  const event = await db.agentRecoveryEvent.create({
    data: {
      recoveryType: 'queue_recovery',
      triggerReason: `queue:${queueName}`,
      actionsTaken: JSON.stringify([{ action: 'mark_stale_executions_failed', count: recovered }]),
      status: 'completed',
      durationMs: Date.now() - startedAt,
      companyId,
    },
  })
  return { success: true, recovered, eventId: event.id }
}

export async function recoverWorkflow(workflowId: string, companyId: string) {
  const workflow = await db.workflow.findFirst({
    where: { id: workflowId, workflowPermissions: { some: { companyId } } },
    select: { id: true },
  })
  if (!workflow) throw new Error('Workflow not found for this company')

  const startedAt = Date.now()
  const cutoff = new Date(startedAt - 5 * 60 * 1000)
  const staleRuns = await db.workflowRun.findMany({
    where: { workflowId, companyId, status: 'running', createdAt: { lt: cutoff } },
    select: { id: true, createdAt: true },
    take: 500,
  })
  let recovered = 0
  for (const run of staleRuns) {
    const result = await db.workflowRun.updateMany({
      where: { id: run.id, workflowId, companyId, status: 'running', createdAt: { lt: cutoff } },
      data: { status: 'failed', completedAt: new Date(), output: 'Marked failed after stale-run timeout' },
    })
    recovered += result.count
  }
  const event = await db.agentRecoveryEvent.create({
    data: {
      recoveryType: 'workflow_recovery',
      triggerReason: `workflow:${workflowId}`,
      actionsTaken: JSON.stringify([{ action: 'mark_stale_workflow_runs_failed', count: recovered }]),
      status: 'completed',
      durationMs: Date.now() - startedAt,
      companyId,
    },
  })
  return { success: true, recovered, eventId: event.id }
}

export async function recoverAgent(agentId: string, companyId: string) {
  const instance = await db.agentInstance.findFirst({
    where: { agentId, companyId },
    select: { id: true },
  })
  if (!instance) throw new Error('Agent instance not found for this company')
  return recordUnsupportedRecovery({
    instanceId: instance.id,
    companyId,
    recoveryType: 'agent_recovery',
    triggerReason: 'manual_recovery_requested',
  })
}

export async function getRecoveryEvents(filters: {
  companyId: string
  instanceId?: string
  agentId?: string
  type?: string
  status?: string
  limit?: number
}) {
  const where: Prisma.AgentRecoveryEventWhereInput = { companyId: filters.companyId }
  if (filters.instanceId) where.instanceId = filters.instanceId
  if (filters.agentId) where.agentId = filters.agentId
  if (filters.type) where.recoveryType = filters.type
  if (filters.status) where.status = filters.status
  const take = Math.min(Math.max(filters.limit ?? 50, 1), 100)
  return db.agentRecoveryEvent.findMany({ where, orderBy: { createdAt: 'desc' }, take })
}
