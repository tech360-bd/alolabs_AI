import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  requireCompanyAuth: vi.fn(),
  loadConversationHistory: vi.fn(),
  persistConversationMessages: vi.fn(),
  buildConversationMessages: vi.fn(),
  executeAgentPipeline: vi.fn(),
  db: {
    agent: { findFirst: vi.fn() },
    agentInstance: { findFirst: vi.fn() },
    conversation: { findFirst: vi.fn() },
    agentExecution: { findFirst: vi.fn() },
    agentRun: { findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/api-auth', () => ({ requireCompanyAuth: mocks.requireCompanyAuth }))
vi.mock('@/lib/agent-runtime', () => ({
  loadConversationHistory: mocks.loadConversationHistory,
  persistConversationMessages: mocks.persistConversationMessages,
}))
vi.mock('@/lib/agent-runtime/pipeline', () => ({
  buildConversationMessages: mocks.buildConversationMessages,
}))
vi.mock('@/lib/ai-workforce/execution-engine', () => ({
  executeAgentPipeline: mocks.executeAgentPipeline,
}))
vi.mock('@/lib/db', () => ({ db: mocks.db }))

import { POST } from '@/app/api/enterprise/agent-chat/route'

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/enterprise/agent-chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireCompanyAuth.mockResolvedValue({ userId: 'user-1', companyId: 'company-1' })
  mocks.db.agent.findFirst.mockResolvedValue({
    id: 'agent-db-1',
    agentId: 'agent-1',
    name: 'Support Agent',
    departmentId: 'department-1',
  })
  mocks.db.agentInstance.findFirst.mockResolvedValue({ id: 'instance-1' })
  mocks.db.conversation.findFirst.mockResolvedValue({ id: 'conversation-1' })
  mocks.db.agentExecution.findFirst.mockResolvedValue({
    executionOutput: 'Persisted answer',
    agentRunId: 'run-1',
    durationMs: 42,
  })
  mocks.db.agentRun.findFirst.mockResolvedValue({
    model: 'model-1',
    contextSources: 'company knowledge base',
    reviewResult: JSON.stringify({
      taskClassification: 'research',
      heuristicValidationScore: 0.94,
      heuristicValidationPassed: true,
      securityValidationPassed: true,
      ragResults: 3,
      promptTokens: 120,
    }),
    tokensUsed: 180,
    latencyMs: 42,
    confidence: 0.97,
  })
  mocks.loadConversationHistory.mockResolvedValue([{ role: 'user', content: 'Earlier message' }])
  mocks.buildConversationMessages.mockReturnValue([{ role: 'user', content: 'Earlier message' }])
  mocks.executeAgentPipeline.mockResolvedValue({ success: true, executionId: 'execution-1' })
  mocks.persistConversationMessages.mockResolvedValue(undefined)
})

describe('POST /api/enterprise/agent-chat', () => {
  it('uses the company-scoped persisted execution pipeline and stores its output', async () => {
    const response = await POST(createRequest({
      agentId: 'agent-1',
      message: '  Please help  ',
      conversationId: 'conversation-1',
    }))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      success: true,
      data: {
        content: 'Persisted answer',
        conversationId: 'conversation-1',
        executionId: 'execution-1',
        model: 'model-1',
        pipeline: {
          taskClassification: 'research',
          heuristicValidationScore: 0.94,
          heuristicValidationPassed: true,
          securityValidationPassed: true,
          ragResults: 3,
        },
      },
    })

    expect(mocks.db.agent.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        agentId: 'agent-1',
        agentCompanyAccess: { some: { companyId: 'company-1' } },
      }),
    }))
    expect(mocks.db.conversation.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'conversation-1', companyId: 'company-1', userId: 'user-1' },
    }))
    expect(mocks.loadConversationHistory).toHaveBeenCalledWith('conversation-1', 'company-1', 'user-1', 10)
    expect(mocks.executeAgentPipeline).toHaveBeenCalledWith(
      'instance-1',
      { task: 'Please help', conversationHistory: [{ role: 'user', content: 'Earlier message' }] },
      { companyId: 'company-1', userId: 'user-1' },
    )
    expect(mocks.persistConversationMessages).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conversation-1',
      companyId: 'company-1',
      userId: 'user-1',
      agentResponse: 'Persisted answer',
      model: 'model-1',
    }))
  })

  it('returns the approval handle without claiming an execution completed or saving chat output', async () => {
    mocks.executeAgentPipeline.mockResolvedValue({
      success: false,
      needsApproval: true,
      approvalId: 'approval-1',
      executionId: 'execution-1',
    })

    const response = await POST(createRequest({ agentId: 'agent-1', message: 'Send the campaign' }))

    expect(response.status).toBe(202)
    expect(await response.json()).toMatchObject({
      success: false,
      needsApproval: true,
      approvalId: 'approval-1',
      executionId: 'execution-1',
    })
    expect(mocks.db.agentExecution.findFirst).not.toHaveBeenCalled()
    expect(mocks.persistConversationMessages).not.toHaveBeenCalled()
  })

  it('rejects a conversation outside the authenticated user and company before running the agent', async () => {
    mocks.db.conversation.findFirst.mockResolvedValue(null)

    const response = await POST(createRequest({
      agentId: 'agent-1',
      message: 'Continue this thread',
      conversationId: 'foreign-conversation',
    }))

    expect(response.status).toBe(404)
    expect(mocks.executeAgentPipeline).not.toHaveBeenCalled()
    expect(mocks.loadConversationHistory).not.toHaveBeenCalled()
  })
})
