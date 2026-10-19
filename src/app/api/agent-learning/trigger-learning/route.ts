import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCompanyAdmin } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { agentCompanyScope } from '@/lib/agent-access'
import { LearningEngine } from '@/lib/agent-learning'

const TriggerTypeSchema = z.enum(['task_completion', 'feedback', 'manual'])
const LearningSchema = z.object({
  agentId: z.string().min(1),
  triggerType: TriggerTypeSchema.default('manual'),
  triggerDetail: z.string().max(2000).optional(),
  agentRunId: z.string().min(1).optional(),
  corrections: z.array(z.string().trim().min(1).max(2000)).max(50).optional(),
  insights: z.array(z.string().trim().min(1).max(2000)).max(50).optional(),
}).strict().superRefine((value, context) => {
  if (value.triggerType === 'task_completion' && !value.agentRunId) {
    context.addIssue({ code: 'custom', path: ['agentRunId'], message: 'task_completion requires an existing completed agentRunId' })
  }
})

const BatchLearningSchema = z.object({
  agentIds: z.array(z.string().min(1)).min(1).max(50),
  triggerType: z.enum(['feedback', 'manual']).default('manual'),
  insights: z.array(z.string().trim().min(1).max(2000)).max(50).optional(),
}).strict().superRefine((value, context) => {
  if (new Set(value.agentIds).size !== value.agentIds.length) {
    context.addIssue({ code: 'custom', path: ['agentIds'], message: 'agentIds must be unique' })
  }
})

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error'
  const status = message === 'Unauthorized' ? 401
    : message === 'Forbidden' ? 403
      : message.includes('not found') ? 404
        : 500
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAdmin()
    const parsed = LearningSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const agent = await db.agent.findFirst({
      where: { id: parsed.data.agentId, ...agentCompanyScope(user.companyId, 'execute') },
      select: { id: true },
    })
    if (!agent) return NextResponse.json({ error: 'Agent not found for this company' }, { status: 404 })

    let runEvidence: { input: string; output: string | null } | null = null
    if (parsed.data.agentRunId) {
      runEvidence = await db.agentRun.findFirst({
        where: {
          id: parsed.data.agentRunId,
          agentId: agent.id,
          companyId: user.companyId,
          ...(parsed.data.triggerType === 'task_completion' ? { status: 'completed' } : {}),
        },
        select: { input: true, output: true },
      })
      if (!runEvidence) return NextResponse.json({ error: 'Agent run not found for this company and agent' }, { status: 404 })
      if (parsed.data.triggerType === 'task_completion' && !runEvidence.output?.trim()) {
        return NextResponse.json({ error: 'Completed agent run has no output to review' }, { status: 409 })
      }
    }

    const engine = new LearningEngine()
    const result = await engine.learn({
      agentId: agent.id,
      actorUserId: user.userId,
      companyId: user.companyId,
      triggerType: parsed.data.triggerType,
      ...(parsed.data.triggerDetail ? { triggerDetail: parsed.data.triggerDetail } : {}),
      ...(parsed.data.agentRunId ? { agentRunId: parsed.data.agentRunId } : {}),
      ...(runEvidence ? { taskInput: runEvidence.input } : {}),
      ...(runEvidence?.output ? { taskOutput: runEvidence.output } : {}),
      ...(parsed.data.triggerType === 'task_completion' ? { wasSuccess: true } : {}),
      ...(parsed.data.corrections ? { corrections: parsed.data.corrections } : {}),
      ...(parsed.data.insights ? { insights: parsed.data.insights } : {}),
    })
    return NextResponse.json({
      data: {
        ...result,
        status: result.candidateCount > 0 ? 'pending_human_review' : 'no_candidate',
        verified: false,
      },
    }, { status: 202 })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireCompanyAdmin()
    const parsed = BatchLearningSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    const agentIds = parsed.data.agentIds
    const visibleAgents = await db.agent.findMany({
      where: { id: { in: agentIds }, ...agentCompanyScope(user.companyId, 'execute') },
      select: { id: true },
    })
    if (visibleAgents.length !== agentIds.length) return NextResponse.json({ error: 'One or more agents are unavailable to this company' }, { status: 404 })

    await db.auditEvent.create({
      data: {
        actorUserId: user.userId,
        companyId: user.companyId,
        action: 'agent_learning.batch.request',
        resource: 'agent-learning-batch',
        details: JSON.stringify({ agentIds, triggerType: parsed.data.triggerType }),
      },
    })
    const engine = new LearningEngine()
    const results = await engine.batchLearn(agentIds.map((agentId) => ({
      agentId,
      actorUserId: user.userId,
      companyId: user.companyId,
      triggerType: parsed.data.triggerType,
      ...(parsed.data.insights ? { insights: parsed.data.insights } : {}),
    })))
    const candidateCount = Array.from(results.values()).reduce((total, result) => total + result.candidateCount, 0)
    return NextResponse.json({
      data: Object.fromEntries(results),
      requestedAgents: agentIds.length,
      processedAgents: results.size,
      failedAgentIds: agentIds.filter((agentId) => !results.has(agentId)),
      candidateCount,
      status: candidateCount > 0 ? 'pending_human_review' : 'no_candidate',
      verified: false,
    }, { status: 202 })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}
