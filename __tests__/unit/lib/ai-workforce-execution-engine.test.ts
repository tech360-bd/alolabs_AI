import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const db = {
    companyUser: { findUnique: vi.fn() },
    agentInstance: { findFirst: vi.fn() },
    agentCompanyAccess: { findFirst: vi.fn() },
    agentExecution: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    agentMessage: { create: vi.fn() },
    approval: { findFirst: vi.fn(), updateMany: vi.fn() },
    agentRun: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  }

  return { db, runtimeExecute: vi.fn() }
})

vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/lib/agent-runtime', () => ({
  getExecutionEngine: () => ({ execute: mocks.runtimeExecute }),
}))

import {
  approveExecution,
  executeAgentPipeline,
  getExecution,
  getExecutions,
  rejectExecution,
} from '@/lib/ai-workforce/execution-engine'

const execution = {
  id: 'execution-1',
  instanceId: 'instance-1',
  agentRunId: null,
  companyId: 'company-1',
  userId: 'user-1',
  priority: 'normal',
  input: JSON.stringify({ task: 'Review this request' }),
  approvalId: 'approval-1',
  status: 'approval_required',
}

const instance = {
  id: 'instance-1',
  agentId: 'agent-db-1',
  companyId: 'company-1',
  status: 'active',
  agent: { id: 'agent-db-1', agentId: 'agent-1', name: 'Review Agent' },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.db.$transaction.mockImplementation(async (operation) => operation(mocks.db))
  mocks.db.companyUser.findUnique.mockResolvedValue({ id: 'membership-1' })
  mocks.db.agentInstance.findFirst.mockResolvedValue(instance)
  mocks.db.agentCompanyAccess.findFirst.mockResolvedValue({ id: 'access-1' })
  mocks.db.agentExecution.create.mockResolvedValue({
    ...execution,
    approvalId: null,
    status: 'running',
  })
  mocks.db.agentExecution.findFirst.mockResolvedValue(execution)
  mocks.db.agentExecution.findMany.mockResolvedValue([])
  mocks.db.agentExecution.update.mockImplementation(async ({ data }) => ({ ...execution, ...data }))
  mocks.db.agentExecution.updateMany.mockResolvedValue({ count: 1 })
  mocks.db.agentMessage.create.mockResolvedValue({ id: 'message-1' })
  mocks.db.approval.findFirst.mockResolvedValue({ id: 'approval-1' })
  mocks.db.approval.updateMany.mockResolvedValue({ count: 1 })
  mocks.db.agentRun.findMany.mockResolvedValue([])
  mocks.db.auditLog.create.mockResolvedValue({ id: 'audit-1' })
  mocks.runtimeExecute.mockResolvedValue({
    id: 'runtime-task-1',
    status: 'waiting_approval',
    approvalId: 'approval-1',
    riskScore: 0.8,
    securityFlags: ['high-risk'],
    result: null,
  })
})

describe('AI workforce execution persistence', () => {
  it('rejects a user outside the company before creating an execution', async () => {
    mocks.db.companyUser.findUnique.mockResolvedValue(null)

    await expect(executeAgentPipeline(
      'instance-1',
      { task: 'Review this request' },
      { companyId: 'company-1', userId: 'user-1' },
    )).rejects.toThrow('Forbidden')

    expect(mocks.db.agentExecution.create).not.toHaveBeenCalled()
    expect(mocks.db.agentInstance.findFirst).not.toHaveBeenCalled()
  })

  it('persists a company-scoped execution before requesting approval', async () => {
    const result = await executeAgentPipeline(
      'instance-1',
      { task: 'Review this request' },
      { companyId: 'company-1', userId: 'user-1' },
    )

    expect(mocks.db.agentInstance.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'instance-1', companyId: 'company-1', status: 'active' },
    }))
    expect(mocks.db.agentExecution.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        instanceId: 'instance-1',
        companyId: 'company-1',
        userId: 'user-1',
        status: 'running',
      }),
    }))
    expect(mocks.runtimeExecute).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'agent-1',
      companyId: 'company-1',
      userId: 'user-1',
      instanceId: 'instance-1',
      approvalExecutionId: 'execution-1',
      task: 'Review this request',
    }))
    expect(mocks.db.agentExecution.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'execution-1' },
      data: expect.objectContaining({ status: 'approval_required', approvalId: 'approval-1' }),
    }))
    expect(result).toMatchObject({
      success: false,
      needsApproval: true,
      executionId: 'execution-1',
      approvalId: 'approval-1',
    })
  })

  it('resumes the original persisted execution after a scoped approval is claimed', async () => {
    mocks.db.agentExecution.findFirst
      .mockResolvedValueOnce(execution)
      .mockResolvedValueOnce({ ...execution, status: 'running' })
    mocks.db.approval.findFirst
      .mockResolvedValueOnce({ id: 'approval-1' })
      .mockResolvedValueOnce({ id: 'approval-1' })
    mocks.runtimeExecute.mockResolvedValue({
      id: 'runtime-task-2',
      status: 'completed',
      riskScore: 0.1,
      securityFlags: [],
      result: { content: 'Approved result', metadata: { model: 'model-1' } },
    })

    const result = await approveExecution('execution-1', 'company-1', 'reviewer-1')

    expect(mocks.db.approval.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'approval-1',
        executionId: 'execution-1',
        companyId: 'company-1',
        status: 'pending',
      }),
      data: expect.objectContaining({ status: 'approved', reviewedBy: 'reviewer-1' }),
    }))
    expect(mocks.db.agentExecution.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'execution-1',
        companyId: 'company-1',
        userId: 'user-1',
        status: 'approval_required',
        approvalId: 'approval-1',
      }),
    }))
    expect(mocks.runtimeExecute).toHaveBeenCalledWith(expect.objectContaining({
      approvalExecutionId: 'execution-1',
      approvalId: 'approval-1',
      approvedBy: 'reviewer-1',
    }))
    expect(result).toMatchObject({ success: true, executionId: 'execution-1' })
  })

  it('does not dispatch an approval twice after another reviewer claims it', async () => {
    mocks.db.agentExecution.findFirst.mockResolvedValue(execution)
    mocks.db.approval.findFirst.mockResolvedValue({ id: 'approval-1' })
    mocks.db.approval.updateMany.mockResolvedValue({ count: 0 })

    await expect(approveExecution('execution-1', 'company-1', 'reviewer-1'))
      .rejects.toThrow('Approval is no longer pending')

    expect(mocks.db.approval.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'approval-1',
        executionId: 'execution-1',
        companyId: 'company-1',
        status: 'pending',
      }),
    }))
    expect(mocks.runtimeExecute).not.toHaveBeenCalled()
  })

  it('atomically rejects an approval and fails its linked execution', async () => {
    mocks.db.agentExecution.findFirst
      .mockResolvedValueOnce(execution)
      .mockResolvedValueOnce({ ...execution, status: 'failed' })

    const result = await rejectExecution(
      'execution-1',
      'company-1',
      'reviewer-1',
      'Rejected by reviewer',
    )

    expect(mocks.db.approval.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'approval-1',
        executionId: 'execution-1',
        companyId: 'company-1',
        status: 'pending',
      }),
      data: expect.objectContaining({ status: 'rejected', reviewedBy: 'reviewer-1' }),
    }))
    expect(mocks.db.agentExecution.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'execution-1',
        companyId: 'company-1',
        status: 'approval_required',
      }),
      data: expect.objectContaining({ status: 'failed', error: 'rejected' }),
    }))
    expect(result).toMatchObject({ id: 'execution-1', status: 'failed' })
    expect(mocks.runtimeExecute).not.toHaveBeenCalled()
  })

  it('scopes execution reads to the company and clamps pagination', async () => {
    await getExecutions({ companyId: 'company-1', limit: 500, offset: -20 })
    await getExecution('execution-1', 'company-1')

    expect(mocks.db.agentExecution.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { companyId: 'company-1' },
      take: 100,
      skip: 0,
    }))
    expect(mocks.db.agentExecution.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'execution-1', companyId: 'company-1' },
    }))
  })
})
