import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCompanyAuth } from '@/lib/api-auth'
import { loadConversationHistory, persistConversationMessages } from '@/lib/agent-runtime'
import { buildConversationMessages } from '@/lib/agent-runtime/pipeline'
import { executeAgentPipeline } from '@/lib/ai-workforce/execution-engine'
import { db } from '@/lib/db'
import { randomUUID } from 'node:crypto'

const AgentChatSchema = z.object({
  agentId: z.string().min(1),
  message: z.string().trim().min(1).max(50_000),
  conversationId: z.string().min(1).optional(),
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseRunMetadata(value: string | null): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error'
  const status = message === 'Unauthorized' ? 401
    : message === 'Forbidden' ? 403
      : message.includes('not found') ? 404
        : 500
  return NextResponse.json({ success: false, error: message }, { status })
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const parsed = AgentChatSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 })
    }

    const { agentId, message } = parsed.data
    const conversationId = parsed.data.conversationId ?? randomUUID()
    const startTime = Date.now()

    const agent = await db.agent.findFirst({
      where: {
        agentId,
        status: 'active',
        agentCompanyAccess: { some: { companyId: user.companyId } },
      },
      select: { id: true, agentId: true, name: true, departmentId: true },
    })
    if (!agent) {
      return NextResponse.json({ success: false, error: 'Active agent not found for this company' }, { status: 404 })
    }

    const instance = await db.agentInstance.findFirst({
      where: { agentId: agent.id, companyId: user.companyId, status: 'active' },
      orderBy: { installedAt: 'asc' },
      select: { id: true },
    })
    if (!instance) {
      return NextResponse.json({
        success: false,
        error: 'Install an active agent instance for this company before starting a persisted chat execution',
      }, { status: 409 })
    }

    if (parsed.data.conversationId) {
      const conversation = await db.conversation.findFirst({
        where: { id: conversationId, companyId: user.companyId, userId: user.userId },
        select: { id: true },
      })
      if (!conversation) return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 })
    }

    const history = parsed.data.conversationId
      ? await loadConversationHistory(conversationId, user.companyId, user.userId, 10)
      : []
    const historyMessages = buildConversationMessages(history)
    const executionResult = await executeAgentPipeline(
      instance.id,
      {
        task: message,
        conversationHistory: historyMessages,
      },
      { companyId: user.companyId, userId: user.userId },
    )

    if (!executionResult.success) {
      if (executionResult.needsApproval && executionResult.approvalId) {
        return NextResponse.json({
          success: false,
          needsApproval: true,
          approvalId: executionResult.approvalId,
          executionId: executionResult.executionId,
          conversationId,
          error: 'Execution is paused until its company-scoped approval is reviewed',
        }, { status: 202 })
      }
      return NextResponse.json(
        { success: false, executionId: executionResult.executionId, error: executionResult.error ?? 'Agent execution did not complete' },
        { status: 502 },
      )
    }

    const execution = await db.agentExecution.findFirst({
      where: { id: executionResult.executionId, companyId: user.companyId },
      select: { executionOutput: true, agentRunId: true, durationMs: true },
    })
    if (!execution?.executionOutput) {
      return NextResponse.json({ success: false, error: 'Completed execution output was not persisted' }, { status: 502 })
    }

    const agentRun = execution.agentRunId
      ? await db.agentRun.findFirst({
          where: { id: execution.agentRunId, companyId: user.companyId },
          select: { model: true, contextSources: true, reviewResult: true, tokensUsed: true, latencyMs: true, confidence: true },
        })
      : null
    const metadata = parseRunMetadata(agentRun?.reviewResult ?? null)
    const model = agentRun?.model ?? null
    const contextSources = agentRun?.contextSources ?? ''
    const taskClassification = typeof metadata.taskClassification === 'string' ? metadata.taskClassification : null
    const heuristicValidationScore = typeof metadata.heuristicValidationScore === 'number'
      ? metadata.heuristicValidationScore
      : null
    const heuristicValidationPassed = typeof metadata.heuristicValidationPassed === 'boolean'
      ? metadata.heuristicValidationPassed
      : null
    const securityValidationPassed = typeof metadata.securityValidationPassed === 'boolean'
      ? metadata.securityValidationPassed
      : null
    const ragResults = typeof metadata.ragResults === 'number' ? metadata.ragResults : null
    const promptTokens = typeof metadata.promptTokens === 'number' ? metadata.promptTokens : null
    const latencyMs = agentRun?.latencyMs ?? execution.durationMs ?? Date.now() - startTime

    await persistConversationMessages({
      conversationId,
      companyId: user.companyId,
      userId: user.userId,
      agentId: agent.agentId,
      agentName: agent.name,
      departmentId: agent.departmentId,
      userMessage: message,
      agentResponse: execution.executionOutput,
      model: model ?? 'unreported',
      tokensUsed: agentRun?.tokensUsed ?? 0,
      latencyMs,
      contextSources,
      ...(typeof agentRun?.confidence === 'number' ? { confidence: agentRun.confidence } : {}),
    })

    return NextResponse.json({
      success: true,
      data: {
        content: execution.executionOutput,
        ...(typeof agentRun?.confidence === 'number' ? { confidence: agentRun.confidence } : {}),
        model,
        latencyMs,
        promptTokens,
        contextSources,
        conversationId,
        executionId: executionResult.executionId,
        pipeline: {
          taskClassification,
          heuristicValidationScore,
          heuristicValidationPassed,
          securityValidationPassed,
          ragResults,
        },
      },
    })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}
