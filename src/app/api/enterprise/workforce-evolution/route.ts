import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { db } from '@/lib/db'
import {
  evaluateAgentQualification,
  proposeAssistantAgent,
  executeLearningCycle,
  getDepartmentModelConfig,
  isGlobalEmergencyStopActive,
  triggerEmergencyStop,
  liftEmergencyStop,
} from '@/lib/agent-evolution-engine'
import {
  submitProposal,
  getProposals,
  getEvolutionStats,
} from '@/lib/workforce-evolution'

const proposalSchema = z.object({
  parentAgentId: z.string().min(1),
  parentAgentName: z.string().optional(),
  departmentId: z.string().min(1),
  departmentName: z.string().optional(),
  proposedRole: z.string().min(1),
  proposedName: z.string().min(1),
  proposedPurpose: z.string().min(1),
  proposedSkills: z.array(z.string()).optional(),
  proposedTools: z.array(z.string()).optional(),
  proposedType: z.string().optional(),
  reason: z.string().min(1),
  capabilityGap: z.string().min(1),
  generation: z.number().int().min(0).default(0),
  isLoopAgent: z.boolean().optional(),
  estimatedTokenBudget: z.number().optional(),
  estimatedCostBudget: z.number().optional(),
})

const learningCycleSchema = z.object({
  agentId: z.string().min(1),
  parentAgentId: z.string().optional(),
  observations: z.record(z.string(), z.unknown()).default({}),
  failures: z.array(z.string()).default([]),
  proposedImprovement: z.object({
    targetType: z.enum([
      'prompt',
      'task_strategy',
      'workflow',
      'skill_selection',
      'tool_selection',
      'knowledge_retrieval',
      'planning',
    ]),
    currentConfig: z.record(z.string(), z.unknown()).default({}),
    proposedConfig: z.record(z.string(), z.unknown()).default({}),
    rationale: z.string().min(1),
  }),
  metricsBefore: z.record(z.string(), z.unknown()).default({}),
})

const emergencyStopSchema = z.object({
  scope: z.enum(['global', 'department', 'lineage', 'agent']).default('global'),
  targetId: z.string().optional(),
  reason: z.string().min(1),
  action: z.enum(['trigger', 'lift']).default('trigger'),
  stopId: z.string().optional(),
  resolution: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    await requireAuth()

    const { searchParams } = new URL(request.url)
    const departmentId = searchParams.get('departmentId') || undefined
    const agentId = searchParams.get('agentId') || undefined
    const stats = searchParams.get('stats')
    const view = searchParams.get('view') // 'lineage' | 'qualification' | 'cycles' | 'models' | 'stop'

    if (view === 'qualification' && agentId) {
      const qualification = await evaluateAgentQualification(agentId)
      return NextResponse.json({ success: true, qualification })
    }

    if (view === 'lineage') {
      const where: Record<string, unknown> = {}
      if (agentId) where.agentId = agentId
      const lineage = await db.agentLineage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
      return NextResponse.json({ success: true, lineage })
    }

    if (view === 'cycles') {
      const where: Record<string, unknown> = {}
      if (agentId) where.agentId = agentId
      const cycles = await db.agentLearningCycle.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      return NextResponse.json({ success: true, cycles })
    }

    if (view === 'department-model' && departmentId) {
      const modelConfig = await getDepartmentModelConfig(departmentId)
      return NextResponse.json({ success: true, modelConfig })
    }

    if (view === 'emergency-stop') {
      const isStopActive = await isGlobalEmergencyStopActive()
      const activeStops = await db.evolutionEmergencyStop.findMany({
        where: { isActive: true },
        orderBy: { activatedAt: 'desc' },
      })
      return NextResponse.json({ success: true, isGlobalStopActive: isStopActive, activeStops })
    }

    if (stats) {
      const evolutionStats = await getEvolutionStats()
      const isStopActive = await isGlobalEmergencyStopActive()
      return NextResponse.json({ ...evolutionStats, isGlobalStopActive: isStopActive })
    }

    const proposals = await getProposals(departmentId)
    return NextResponse.json({ proposals })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Workforce evolution GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'propose'

    const body = await request.json()

    // 1. Emergency Stop Action
    if (action === 'emergency-stop') {
      const parsed = emergencyStopSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid stop parameters', details: parsed.error.flatten() }, { status: 400 })
      }
      if (parsed.data.action === 'trigger') {
        const result = await triggerEmergencyStop(parsed.data.reason, user.userId, parsed.data.scope, parsed.data.targetId)
        return NextResponse.json({ ...result, success: true })
      } else {
        if (!parsed.data.stopId) {
          return NextResponse.json({ error: 'stopId required to lift stop' }, { status: 400 })
        }
        await liftEmergencyStop(parsed.data.stopId, parsed.data.resolution || 'Resolved by administrator')
        return NextResponse.json({ success: true, message: 'Emergency stop lifted' })
      }
    }

    // 2. Learning Cycle Action (Month 2)
    if (action === 'learning-cycle') {
      const parsed = learningCycleSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid learning cycle payload', details: parsed.error.flatten() }, { status: 400 })
      }
      const result = await executeLearningCycle(parsed.data, user.userId)
      return NextResponse.json({ ...result, userId: user.userId }, { status: result.success ? 200 : 403 })
    }

    // 3. Qualification Check Action
    if (action === 'qualify') {
      const agentId = body.agentId
      if (!agentId) {
        return NextResponse.json({ error: 'agentId is required' }, { status: 400 })
      }
      const qualification = await evaluateAgentQualification(agentId)
      return NextResponse.json({ success: true, qualification })
    }

    // 4. Default: Propose Assistant Agent (Month 1 & Month 3)
    const parsed = proposalSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const data = parsed.data
    const result = await proposeAssistantAgent(
      {
        parentAgentId: data.parentAgentId,
        departmentId: data.departmentId,
        proposedRole: data.proposedRole,
        proposedName: data.proposedName,
        proposedPurpose: data.proposedPurpose,
        proposedSkills: data.proposedSkills || [],
        proposedTools: data.proposedTools || ['search', 'reporter'],
        capabilityGap: data.capabilityGap,
        reason: data.reason,
        isLoopAgent: data.isLoopAgent,
        estimatedTokenBudget: data.estimatedTokenBudget,
        estimatedCostBudget: data.estimatedCostBudget,
      },
      user.userId
    )

    return NextResponse.json({
      success: result.success,
      approved: result.success,
      proposalId: result.proposalId,
      reason: result.reasons.join('; '),
      newAgentId: result.newAgentId ?? null,
      userId: user.userId,
    }, { status: result.success ? 200 : 400 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Workforce evolution POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
