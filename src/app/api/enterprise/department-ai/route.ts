import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAuth, requireCompanyAuth } from '@/lib/api-auth'
import { getOrchestrator } from '@/lib/orchestrator'

// ─── Zod Schema ──────────────────────────────────────────────────────

const executeBodySchema = z.object({
  departmentId: z.string().min(1, 'departmentId is required'),
  task: z.string().min(1, 'task is required').max(10000),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
})

// ─── Helpers ─────────────────────────────────────────────────────────

/** Simple keyword extraction (lowercased, split on non-alpha). */
function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2)
}

/** Jaccard similarity between two keyword sets. */
function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a)
  const setB = new Set(b)
  let intersection = 0
  for (const word of setA) {
    if (setB.has(word)) intersection++
  }
  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

/** Parse a JSON string array safely, returning empty array on failure. */
function parseJsonArray(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// ─── GET Handler ─────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(request.url)
    const departmentId = searchParams.get('departmentId')

    // ── All-departments aggregate view ──────────────────────────────
    if (!departmentId) {
      const departments = await db.department.findMany({
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, status: true },
      })

      const results = await Promise.all(
        departments.map(async (dept) => {
          const agents = await db.agent.findMany({
            where: { departmentId: dept.id },
            select: { id: true, status: true },
          })

          const agentIds = agents.map((a) => a.id)
          let recentRunCount = 0
          let avgConfidence = 0

          if (agentIds.length > 0) {
            const runs = await db.agentRun.findMany({
              where: { agentId: { in: agentIds } },
              select: { confidence: true },
              orderBy: { createdAt: 'desc' },
              take: 100,
            })
            recentRunCount = runs.length
            const validConfidences = runs.filter((r) => r.confidence != null).map((r) => r.confidence as number)
            avgConfidence =
              validConfidences.length > 0
                ? validConfidences.reduce((sum, c) => sum + c, 0) / validConfidences.length
                : 0
          }

          return {
            departmentId: dept.id,
            departmentName: dept.name,
            status: dept.status,
            agentCount: agents.length,
            activeAgentCount: agents.filter((a) => a.status === 'active').length,
            recentRunCount,
            avgConfidence: Math.round(avgConfidence * 100) / 100,
          }
        })
      )

      return NextResponse.json({ departments: results })
    }

    // ── Single-department detailed view ─────────────────────────────
    const department = await db.department.findUnique({
      where: { id: departmentId },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        agentCount: true,
      },
    })

    if (!department) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404 })
    }

    // Run independent queries in parallel
    const [agents, knowledgeNodeCount, sops, memoryCount] = await Promise.all([
      // 1. Agent list (limit 20)
      db.agent.findMany({
        where: { departmentId: department.id },
        select: { agentId: true, name: true, role: true, type: true, status: true, purpose: true, allowedSkills: true },
        orderBy: { createdAt: 'asc' },
        take: 20,
      }),

      // 2. Knowledge nodes count
      db.knowledgeNode.count({
        where: { departmentId: department.id },
      }),

      // 3. Active SOPs
      db.enterpriseSOP.findMany({
        where: { departmentId: department.id, status: 'active' },
        select: { sopId: true, title: true, category: true, priority: true, description: true, estimatedTime: true, version: true },
        orderBy: { updatedAt: 'desc' },
      }),

      // 4. Memory count (sum of agentMemory for all agents)
      (async () => {
        const agentRecords = await db.agent.findMany({
          where: { departmentId: department.id },
          select: { id: true },
        })
        if (agentRecords.length === 0) return 0
        const agentIds = agentRecords.map((a) => a.id)
        return db.agentMemory.count({
          where: { agentId: { in: agentIds } },
        })
      })(),
    ])

    // 5. Unique skills across all department agents
    const allSkills = new Set<string>()
    for (const agent of agents) {
      const skills = parseJsonArray(agent.allowedSkills)
      for (const skill of skills) {
        allSkills.add(skill)
      }
    }
    const skillsInUse = Array.from(allSkills)

    // 6. Recent agent runs (last 20)
    const agentIds = agents.map((a) => a.agentId)
    let recentRuns: Array<{
      id: string
      agentName: string | null
      input: string
      output: string | null
      latencyMs: number | null
      confidence: number | null
      model: string | null
      status: string
      createdAt: Date
    }> = []

    if (agentIds.length > 0) {
      recentRuns = await db.agentRun.findMany({
        where: { agentId: { in: agentIds } },
        select: {
          id: true,
          agentName: true,
          input: true,
          output: true,
          latencyMs: true,
          confidence: true,
          model: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
    }

    return NextResponse.json({
      department: {
        id: department.id,
        name: department.name,
        description: department.description,
        status: department.status,
        agentCount: department.agentCount,
      },
      agents: agents.map((a) => ({
        agentId: a.agentId,
        name: a.name,
        role: a.role,
        type: a.type,
        status: a.status,
        purpose: a.purpose,
      })),
      knowledgeNodeCount,
      skillsInUse,
      skillsCount: skillsInUse.length,
      sops,
      sopsCount: sops.length,
      recentRuns: recentRuns.map((r) => ({
        id: r.id,
        agentName: r.agentName,
        input: r.input,
        output: r.output,
        latencyMs: r.latencyMs,
        confidence: r.confidence,
        model: r.model,
        status: r.status,
        createdAt: r.createdAt,
      })),
      memoryCount,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[DepartmentAI] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── POST Handler ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Department runs are attributed to the caller's tenant.
    const user = await requireCompanyAuth()

    const body = await request.json()
    const parsed = executeBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { departmentId, task, priority } = parsed.data

    // 1. Verify department exists
    const department = await db.department.findUnique({
      where: { id: departmentId },
      select: { id: true, name: true },
    })
    if (!department) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404 })
    }

    // 2. Find active agents in the department (limit 5 for scoring)
    const candidateAgents = await db.agent.findMany({
      where: { departmentId, status: 'active' },
      select: { agentId: true, name: true, role: true, type: true, purpose: true },
      take: 5,
    })

    if (candidateAgents.length === 0) {
      return NextResponse.json(
        { error: 'No active agents found in this department' },
        { status: 404 },
      )
    }

    // 3. Pick the best agent via simple keyword matching on purpose field
    const taskKeywords = extractKeywords(task)
    let bestAgent = candidateAgents[0]
    let bestScore = -1

    for (const agent of candidateAgents) {
      const purposeKeywords = extractKeywords(agent.purpose)
      const roleKeywords = extractKeywords(agent.role + ' ' + agent.name)
      const purposeScore = jaccardSimilarity(taskKeywords, purposeKeywords)
      const roleScore = jaccardSimilarity(taskKeywords, roleKeywords)
      const score = purposeScore * 0.75 + roleScore * 0.25
      if (score > bestScore) {
        bestScore = score
        bestAgent = agent
      }
    }

    // 4. Execute via orchestrator
    const orchestrator = getOrchestrator()
    const result = await orchestrator.execute({
      task,
      userId: user.userId,
      companyId: user.companyId,
      preferredAgentId: bestAgent.agentId,
    })

    return NextResponse.json({
      department: { id: department.id, name: department.name },
      selectedAgent: {
        agentId: bestAgent.agentId,
        name: bestAgent.name,
        role: bestAgent.role,
        matchScore: Math.round(bestScore * 100) / 100,
      },
      priority,
      result: {
        content: result.content,
        confidence: result.confidence,
        model: result.model,
        latencyMs: result.latencyMs,
        contextTokens: result.contextTokens,
        contextSources: result.contextSources,
      },
      routing: result.routing,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[DepartmentAI] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
