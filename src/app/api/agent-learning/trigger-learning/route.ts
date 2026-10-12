import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCompanyAuth } from '@/lib/api-auth'
import { LearningEngine } from '@/lib/agent-learning'

const TriggerTypeSchema = z.enum(['task_completion', 'feedback', 'scheduled', 'manual', 'cross_agent'])
const LearningSchema = z.object({
  agentId: z.string().min(1),
  triggerType: TriggerTypeSchema.default('manual'),
  triggerDetail: z.string().max(2000).optional(),
  agentRunId: z.string().min(1).optional(),
  taskOutput: z.string().max(20000).optional(),
  taskInput: z.string().max(20000).optional(),
  wasSuccess: z.boolean().optional(),
  error: z.string().max(5000).optional(),
  corrections: z.array(z.string().max(2000)).max(100).optional(),
  insights: z.array(z.string().max(2000)).max(100).optional(),
})

const BatchLearningSchema = z.object({
  agentIds: z.array(z.string().min(1)).min(1).max(100),
  triggerType: TriggerTypeSchema.default('manual'),
  insights: z.array(z.string().max(2000)).max(100).optional(),
})

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error'
  const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const parsed = LearningSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    const engine = new LearningEngine()
    const result = await engine.learn({ ...parsed.data, companyId: user.companyId })
    return NextResponse.json({ data: result })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireCompanyAuth()
    const parsed = BatchLearningSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    const engine = new LearningEngine()
    const results = await engine.batchLearn(parsed.data.agentIds.map((agentId) => ({
      agentId,
      companyId: user.companyId,
      triggerType: parsed.data.triggerType,
      ...(parsed.data.insights ? { insights: parsed.data.insights } : {}),
    })))
    return NextResponse.json({
      data: Object.fromEntries(results),
      totalAgents: parsed.data.agentIds.length,
      successful: results.size,
    })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}
