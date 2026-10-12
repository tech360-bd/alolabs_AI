import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  db: {
    agentRun: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    agentExecution: { findFirst: vi.fn() },
    companyUser: { findUnique: vi.fn() },
    agent: { findMany: vi.fn() },
    agentInstance: { findFirst: vi.fn() },
    agentCompanyAccess: { findFirst: vi.fn() },
  },
  publish: vi.fn(),
  executeAgentPipeline: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/lib/event-bus', () => ({ getEventBus: () => ({ publish: mocks.publish }) }))
vi.mock('@/lib/ai-workforce/execution-engine', () => ({
  executeAgentPipeline: mocks.executeAgentPipeline,
}))

import { MultiAgentOrchestrator } from '@/lib/multi-agent-orchestrator/orchestrator'

const storedTask = {
  id: 'task-1',
  type: 'sequential',
  steps: [{
    id: 'step-1',
    agentId: 'agent-1',
    task: 'Complete the requested work',
    status: 'waiting_approval',
    executionId: 'execution-1',
    approvalId: 'approval-1',
    startedAt: '2026-10-08T08:00:00.000Z',
  }],
  input: 'Complete the requested work',
  companyId: 'company-1',
  userId: 'user-1',
  status: 'waiting_approval',
  createdAt: '2026-10-08T08:00:00.000Z',
  updatedAt: '2026-10-08T08:01:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.publish.mockResolvedValue(undefined)
  mocks.executeAgentPipeline.mockResolvedValue({ success: true, executionId: 'execution-1' })
  mocks.db.agentRun.findFirst.mockResolvedValue({
    output: JSON.stringify(storedTask),
    status: 'waiting_approval',
    errorMessage: null,
  })
  mocks.db.agentRun.updateMany.mockResolvedValue({ count: 1 })
  mocks.db.agentExecution.findFirst.mockResolvedValue({
    status: 'approval_required',
    executionOutput: null,
    errorMessage: null,
    durationMs: null,
    completedAt: null,
    agentRunId: null,
  })
})

describe('multi-agent orchestration persistence', () => {
  it('loads task state only from the authenticated company record', async () => {
    const orchestrator = new MultiAgentOrchestrator()
    const task = await orchestrator.getTaskStatus('task-1', 'company-1')

    expect(mocks.db.agentRun.findFirst).toHaveBeenCalledWith({
      where: { id: 'task-1', companyId: 'company-1', step: 'orchestration' },
      select: { output: true, status: true, errorMessage: true },
    })
    expect(mocks.db.agentExecution.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'execution-1', companyId: 'company-1', userId: 'user-1' },
    }))
    expect(task).toMatchObject({
      id: 'task-1',
      companyId: 'company-1',
      status: 'waiting_approval',
      steps: [{ status: 'waiting_approval', executionId: 'execution-1', approvalId: 'approval-1' }],
    })
    expect(task?.steps[0].startedAt).toBeInstanceOf(Date)
  })

  it('returns not found for a task outside the authenticated company', async () => {
    mocks.db.agentRun.findFirst.mockResolvedValue(null)

    const task = await new MultiAgentOrchestrator().getTaskStatus('task-1', 'company-2')

    expect(task).toBeNull()
    expect(mocks.db.agentRun.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ companyId: 'company-2' }),
    }))
    expect(mocks.db.agentExecution.findFirst).not.toHaveBeenCalled()
  })

  it('uses a conditional database claim before resuming an approved task', async () => {
    mocks.db.agentExecution.findFirst.mockResolvedValue({
      status: 'completed',
      executionOutput: 'Approved result',
      errorMessage: null,
      durationMs: 125,
      completedAt: new Date('2026-10-08T08:02:00.000Z'),
      agentRunId: null,
    })
    // A parallel status poll already claimed the resume. This call must not start
    // a second orchestration worker.
    mocks.db.agentRun.updateMany.mockResolvedValue({ count: 0 })

    const task = await new MultiAgentOrchestrator().getTaskStatus('task-1', 'company-1')

    expect(mocks.db.agentRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'task-1',
        companyId: 'company-1',
        step: 'orchestration',
        status: 'waiting_approval',
      },
      data: expect.objectContaining({ status: 'pending' }),
    }))
    expect(task).toMatchObject({
      status: 'pending',
      steps: [{ status: 'completed', result: 'Approved result', executionId: 'execution-1' }],
    })
    expect(mocks.executeAgentPipeline).not.toHaveBeenCalled()
  })
})
