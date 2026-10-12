import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { getExecutionEngine } from '@/lib/agent-runtime'
import type { TaskPriority } from '@/lib/agent-runtime/types'
import type { Prisma } from '@prisma/client'

interface ExecutionContext {
  companyId: string
  userId: string
  priority?: TaskPriority
  approvalId?: string
  existingExecutionId?: string
  approvedBy?: string
}

interface ExecutionResult {
  success: boolean
  executionId: string
  needsApproval?: boolean
  approvalId?: string
  error?: string
  data?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function taskPriority(value: string): TaskPriority {
  if (value === 'critical' || value === 'high' || value === 'low') return value
  return 'normal'
}

function taskText(input: Record<string, unknown>): string {
  for (const key of ['task', 'prompt', 'message', 'text']) {
    const candidate = input[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return JSON.stringify(input)
}

function parseStoredInput(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value)
  if (!isRecord(parsed)) throw new Error('Stored execution input is not an object')
  return parsed
}

export async function executeAgentPipeline(
  instanceId: string,
  input: Record<string, unknown>,
  context: ExecutionContext,
): Promise<ExecutionResult> {
  const membership = await db.companyUser.findUnique({
    where: { companyId_userId: { companyId: context.companyId, userId: context.userId } },
    select: { id: true },
  })
  if (!membership) throw new Error('Forbidden')

  const instance = await db.agentInstance.findFirst({
    where: { id: instanceId, companyId: context.companyId, status: 'active' },
    include: { agent: { select: { id: true, agentId: true, name: true } } },
  })
  if (!instance) throw new Error('Active agent instance not found')

  const access = await db.agentCompanyAccess.findFirst({
    where: { agentId: instance.agentId, companyId: context.companyId },
    select: { id: true },
  })
  if (!access) throw new Error('Agent access has been revoked for this company')

  let execution: Awaited<ReturnType<typeof db.agentExecution.create>>
  if (context.existingExecutionId) {
    if (!context.approvalId) throw new Error('Approval-bound execution requires an approval ID')
    const claimedExecution = await db.$transaction(async (transaction) => {
      const approved = await transaction.approval.findFirst({
        where: {
          id: context.approvalId,
          executionId: context.existingExecutionId,
          companyId: context.companyId,
          status: 'approved',
        },
        select: { id: true },
      })
      if (!approved) throw new Error('Approved company-scoped approval not found')

      const claimed = await transaction.agentExecution.updateMany({
        where: {
          id: context.existingExecutionId,
          instanceId,
          companyId: context.companyId,
          userId: context.userId,
          status: 'approval_required',
          approvalId: context.approvalId,
        },
        data: {
          status: 'running',
          step: 'execution',
          stepNumber: 5,
          startedAt: new Date(),
          completedAt: null,
          error: null,
          errorMessage: null,
        },
      })
      if (claimed.count !== 1) throw new Error('Approval-bound execution has already been claimed')

      const current = await transaction.agentExecution.findFirst({
        where: {
          id: context.existingExecutionId,
          instanceId,
          companyId: context.companyId,
          userId: context.userId,
          status: 'running',
          approvalId: context.approvalId,
        },
      })
      if (!current) throw new Error('Approval-bound execution could not be loaded after claim')
      return current
    })
    execution = claimedExecution
  } else {
    execution = await db.agentExecution.create({
      data: {
        instanceId,
        requestId: randomUUID(),
        companyId: context.companyId,
        userId: context.userId,
        priority: context.priority ?? 'normal',
        input: JSON.stringify(input),
        step: 'execution',
        stepNumber: 5,
        status: 'running',
        startedAt: new Date(),
      },
    })
  }

  const startedAt = Date.now()
  try {
    await db.agentMessage.create({
      data: {
        executionId: execution.id,
        role: 'system',
        content: context.approvalId
          ? 'Approved execution dispatched to the AgentOS runtime.'
          : 'Execution dispatched to the AgentOS runtime.',
      },
    })

    const task = await getExecutionEngine().execute({
      agentId: instance.agent.agentId,
      companyId: context.companyId,
      userId: context.userId,
      instanceId: instance.id,
      approvalExecutionId: execution.id,
      ...(context.approvalId ? { approvalId: context.approvalId } : {}),
      ...(context.approvedBy ? { approvedBy: context.approvedBy } : {}),
      task: taskText(input),
      context: input,
      priority: context.priority ?? taskPriority(execution.priority),
      mode: 'sync',
    })

    const riskScore = task.riskScore ?? 0
    const securityFlags = JSON.stringify(task.securityFlags ?? [])
    if (task.status === 'waiting_approval' && task.approvalId) {
      const updated = await db.agentExecution.update({
        where: { id: execution.id },
        data: {
          assignedAgentId: instance.agent.id,
          status: 'approval_required',
          step: 'approval',
          stepNumber: 4,
          approvalId: task.approvalId,
          riskScore,
          securityFlags,
          validatedInput: JSON.stringify(input),
          durationMs: Date.now() - startedAt,
        },
      })
      await db.agentMessage.create({
        data: {
          executionId: execution.id,
          role: 'system',
          content: 'Execution is paused until the linked approval is reviewed.',
        },
      })
      return {
        success: false,
        needsApproval: true,
        approvalId: task.approvalId,
        executionId: execution.id,
        data: updated,
      }
    }

    if (task.status !== 'completed' || !task.result) {
      const error = task.error?.message ?? `Agent runtime ended in ${task.status}`
      const failed = await db.agentExecution.update({
        where: { id: execution.id },
        data: {
          assignedAgentId: instance.agent.id,
          status: 'failed',
          step: 'failed',
          error: task.error?.code ?? 'runtime_failed',
          errorMessage: error,
          riskScore,
          securityFlags,
          validatedInput: JSON.stringify(input),
          completedAt: new Date(),
          durationMs: Date.now() - startedAt,
        },
      })
      await db.agentMessage.create({
        data: { executionId: execution.id, role: 'system', content: 'Agent runtime did not return a completed result.' },
      })
      return { success: false, executionId: execution.id, error, data: failed }
    }

    const metadata = task.result.metadata ?? {}
    const model = typeof metadata.model === 'string' ? metadata.model : null
    const modelTier = typeof metadata.taskClassification === 'string' ? metadata.taskClassification : null
    const agentRunId = typeof metadata.agentRunId === 'string' ? metadata.agentRunId : null
    const outputValidation = {
      securityValidationPassed: metadata.securityValidationPassed === true,
      heuristicValidationScore: typeof metadata.heuristicValidationScore === 'number'
        ? metadata.heuristicValidationScore
        : null,
      heuristicValidationPassed: metadata.heuristicValidationPassed === true,
    }

    const completed = await db.agentExecution.update({
      where: { id: execution.id },
      data: {
        assignedAgentId: instance.agent.id,
        ...(agentRunId ? { agentRunId } : {}),
        status: 'completed',
        step: 'completed',
        stepNumber: 6,
        riskScore,
        securityFlags,
        validatedInput: JSON.stringify(input),
        executionPlan: JSON.stringify({ model, modelTier, source: 'AgentOS runtime' }),
        executionOutput: task.result.content,
        reviewResult: JSON.stringify(outputValidation),
        completedAt: new Date(),
        durationMs: Date.now() - startedAt,
        error: null,
        errorMessage: null,
      },
    })
    await db.agentMessage.create({
      data: { executionId: execution.id, role: 'assistant', content: task.result.content },
    })

    return { success: true, executionId: execution.id, data: completed }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent runtime failed'
    await db.agentExecution.update({
      where: { id: execution.id },
      data: {
        status: 'failed',
        step: 'failed',
        error: 'runtime_error',
        errorMessage: message,
        completedAt: new Date(),
        durationMs: Date.now() - startedAt,
      },
    }).catch(() => {})
    return { success: false, executionId: execution.id, error: message }
  }
}

export async function getExecutions(filters: {
  companyId: string
  instanceId?: string
  status?: string
  limit?: number
  offset?: number
}) {
  const where: Prisma.AgentExecutionWhereInput = { companyId: filters.companyId }
  if (filters.instanceId) where.instanceId = filters.instanceId
  if (filters.status) where.status = filters.status
  const take = Math.min(Math.max(filters.limit ?? 50, 1), 100)
  const skip = Math.max(filters.offset ?? 0, 0)
  return db.agentExecution.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
    skip,
    include: { messages: { orderBy: { createdAt: 'asc' }, take: 20 } },
  })
}

export async function getExecution(id: string, companyId: string) {
  return db.agentExecution.findFirst({
    where: { id, companyId },
    include: { messages: { orderBy: { createdAt: 'asc' } }, instance: true },
  })
}

export async function approveExecution(executionId: string, companyId: string, approvedBy: string) {
  const execution = await db.$transaction(async (transaction) => {
    const current = await transaction.agentExecution.findFirst({
      where: { id: executionId, companyId, status: 'approval_required' },
    })
    if (!current || !current.approvalId) throw new Error('Approval-required execution not found')

    const approval = await transaction.approval.findFirst({
      where: {
        id: current.approvalId,
        executionId: current.id,
        companyId,
        status: 'pending',
      },
      select: { id: true },
    })
    if (!approval) throw new Error('Pending company-scoped approval not found')

    const claimedApproval = await transaction.approval.updateMany({
      where: {
        id: approval.id,
        executionId: current.id,
        companyId,
        status: 'pending',
      },
      data: { status: 'approved', reviewedBy: approvedBy, reviewedAt: new Date() },
    })
    if (claimedApproval.count !== 1) throw new Error('Approval is no longer pending')

    await transaction.auditLog.create({
      data: {
        action: 'agent_execution_approved',
        resource: current.id,
        userId: approvedBy,
        details: JSON.stringify({ companyId, approvalId: approval.id }),
      },
    })
    return current
  })

  if (!execution.companyId || !execution.userId || !execution.approvalId) {
    throw new Error('Execution is missing its company, user, or approval context')
  }
  return executeAgentPipeline(
    execution.instanceId,
    parseStoredInput(execution.input),
    {
      companyId,
      userId: execution.userId,
      priority: taskPriority(execution.priority),
      approvalId: execution.approvalId,
      existingExecutionId: execution.id,
      approvedBy,
    },
  )
}

export async function rejectExecution(
  executionId: string,
  companyId: string,
  rejectedBy: string,
  note: string,
) {
  return db.$transaction(async (transaction) => {
    const execution = await transaction.agentExecution.findFirst({
      where: { id: executionId, companyId, status: 'approval_required' },
    })
    if (!execution || !execution.approvalId) throw new Error('Approval-required execution not found')

    const approval = await transaction.approval.findFirst({
      where: {
        id: execution.approvalId,
        executionId: execution.id,
        companyId,
        status: 'pending',
      },
      select: { id: true },
    })
    if (!approval) throw new Error('Pending company-scoped approval not found')

    const claimedApproval = await transaction.approval.updateMany({
      where: {
        id: approval.id,
        executionId: execution.id,
        companyId,
        status: 'pending',
      },
      data: {
        status: 'rejected',
        reviewedBy: rejectedBy,
        responseNote: note,
        reviewedAt: new Date(),
      },
    })
    if (claimedApproval.count !== 1) throw new Error('Approval is no longer pending')

    const rejected = await transaction.agentExecution.updateMany({
      where: {
        id: execution.id,
        companyId,
        status: 'approval_required',
        approvalId: approval.id,
      },
      data: {
        status: 'failed',
        step: 'rejected',
        error: 'rejected',
        errorMessage: note,
        completedAt: new Date(),
      },
    })
    if (rejected.count !== 1) throw new Error('Execution is no longer awaiting approval')

    await transaction.auditLog.create({
      data: {
        action: 'agent_execution_rejected',
        resource: execution.id,
        userId: rejectedBy,
        details: JSON.stringify({ companyId, approvalId: approval.id, note }),
      },
    })
    const rejectedExecution = await transaction.agentExecution.findFirst({
      where: { id: execution.id, companyId },
    })
    if (!rejectedExecution) throw new Error('Rejected execution could not be reloaded')
    return rejectedExecution
  })
}
