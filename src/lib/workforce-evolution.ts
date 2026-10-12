import { db } from '@/lib/db'

// ── Types ──────────────────────────────────────────────────────────────────

export interface EvolutionProposal {
  parentAgentId: string
  parentAgentName: string
  departmentId: string
  departmentName: string
  proposedRole: string
  proposedName: string
  proposedPurpose: string
  proposedSkills: string[]
  proposedType: string
  reason: string
  capabilityGap: string
  generation: number
  isLoopAgent?: boolean
}

export interface EvolutionConfig {
  maxPopulation: number
  maxGeneration: number
  maxProposalsPerAgent: number
  maxConcurrencyPerDept: number
  phase: 'phase1_descendants' | 'phase2_loop_agents' | 'phase3_department_models' | 'locked'
  phase1MaxDescendants: number
  phase2MaxLoopAgents: number
  requireHumanApproval: boolean
}

const DEFAULT_CONFIG: EvolutionConfig = {
  maxPopulation: 5000,
  maxGeneration: 3,
  maxProposalsPerAgent: 5,
  maxConcurrencyPerDept: 50,
  phase: 'phase1_descendants',
  phase1MaxDescendants: 5,
  phase2MaxLoopAgents: 1,
  requireHumanApproval: false,
}

function safeParseJSON<T = unknown>(jsonStr: string | null | undefined, fallback: T): T {
  if (!jsonStr) return fallback
  try {
    return JSON.parse(jsonStr) as T
  } catch {
    return fallback
  }
}

function generateAgentId(): string {
  const random = Math.random().toString(36).substring(2, 8)
  return `agent_${Date.now()}_${random}`
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// ── getEvolutionConfig ────────────────────────────────────────────────────

export function getEvolutionConfig(): EvolutionConfig {
  return { ...DEFAULT_CONFIG }
}

export async function getEvolutionConfigFromDB(): Promise<EvolutionConfig> {
  try {
    const setting = await db.settings.findUnique({
      where: { key: 'workforce_evolution_config' },
    })
    if (!setting) return { ...DEFAULT_CONFIG }
    return safeParseJSON<EvolutionConfig>(setting.value, { ...DEFAULT_CONFIG })
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

// ── submitProposal ────────────────────────────────────────────────────────

export async function submitProposal(proposal: EvolutionProposal): Promise<{
  approved: boolean
  reason: string
  newAgentId?: string
}> {
  try {
    const config = await getEvolutionConfigFromDB()

    if (config.phase === 'locked') {
      return { approved: false, reason: 'Workforce evolution is currently locked by system policy' }
    }

    // 1. Check parent agent exists and is active
    const parentAgent = await db.agent.findUnique({
      where: { agentId: proposal.parentAgentId },
    })
    if (!parentAgent) {
      return { approved: false, reason: 'Parent agent does not exist' }
    }
    if (parentAgent.status !== 'active') {
      return { approved: false, reason: 'Parent agent is not active' }
    }

    // Parse parent agent metadata for genealogy
    const parentSelfImp = safeParseJSON<Record<string, unknown>>(parentAgent.selfImprovement, {})
    const parentGeneration = Number(parentSelfImp.generation ?? 0)
    const currentGeneration = parentGeneration + 1
    const proposedDescendantsCount = Number(parentSelfImp.descendantCount ?? 0)

    // 2. Check total agent count < maxPopulation
    const totalAgents = await db.agent.count()
    if (totalAgents >= config.maxPopulation) {
      return {
        approved: false,
        reason: `Workforce population limit reached (${config.maxPopulation})`,
      }
    }

    // 3. Check generation < maxGeneration
    if (currentGeneration > config.maxGeneration) {
      return {
        approved: false,
        reason: `Maximum generation depth reached (${config.maxGeneration})`,
      }
    }

    // 4. Phase-specific evolution rules (Section 7)
    // Phase 1 (First 3 months): up to 5 descendant agents per qualified parent
    if (config.phase === 'phase1_descendants') {
      if (proposal.isLoopAgent) {
        return {
          approved: false,
          reason: 'Loop agents are only permitted in Phase 2 (Months 4-6)',
        }
      }
      if (proposedDescendantsCount >= config.phase1MaxDescendants) {
        return {
          approved: false,
          reason: `Parent agent has reached the maximum of ${config.phase1MaxDescendants} descendant agents for Phase 1`,
        }
      }
    }

    // Phase 2 (Months 4-6): 1 loop AI agent per qualified parent
    if (config.phase === 'phase2_loop_agents' && proposal.isLoopAgent) {
      const loopCount = Number(parentSelfImp.loopAgentCount ?? 0)
      if (loopCount >= config.phase2MaxLoopAgents) {
        return {
          approved: false,
          reason: `Parent agent has already created the maximum of ${config.phase2MaxLoopAgents} loop agent for Phase 2`,
        }
      }
    }

    // 5. Check department concurrency < maxConcurrencyPerDept
    const deptAgentCount = await db.agent.count({
      where: { departmentId: proposal.departmentId, status: 'active' },
    })
    if (deptAgentCount >= config.maxConcurrencyPerDept) {
      return {
        approved: false,
        reason: `Department concurrency limit reached (${config.maxConcurrencyPerDept})`,
      }
    }

    // 6. Check no duplicate (same role + department + purpose)
    const duplicate = await db.agent.findFirst({
      where: {
        role: proposal.proposedRole,
        departmentId: proposal.departmentId,
        purpose: proposal.proposedPurpose,
      },
    })
    if (duplicate) {
      return {
        approved: false,
        reason: `Duplicate agent already exists: ${duplicate.agentId}`,
      }
    }

    // All checks passed — create the new agent with genealogy tracking
    const newAgentId = generateAgentId()
    const slug = slugify(`${proposal.proposedName}-${Date.now()}`)

    const childSelfImprovement = JSON.stringify({
      parentAgentId: proposal.parentAgentId,
      parentAgentName: proposal.parentAgentName,
      generation: currentGeneration,
      evolutionReason: proposal.reason,
      capabilityGap: proposal.capabilityGap,
      isLoopAgent: Boolean(proposal.isLoopAgent),
      descendantCount: 0,
      loopAgentCount: 0,
      createdAt: new Date().toISOString(),
    })

    const newAgent = await db.agent.create({
      data: {
        agentId: newAgentId,
        name: proposal.proposedName,
        slug,
        departmentId: proposal.departmentId,
        departmentName: proposal.departmentName,
        purpose: proposal.proposedPurpose,
        type: proposal.isLoopAgent ? 'loop_agent' : proposal.proposedType || 'specialist',
        role: proposal.proposedRole,
        allowedSkills: JSON.stringify(proposal.proposedSkills || []),
        forbiddenSkills: '[]',
        allowedTools: '[]',
        forbiddenTools: '[]',
        inputSchema: '{}',
        outputSchema: '{}',
        workflowSteps: '[]',
        protectionRules: '[]',
        approvalRules: '[]',
        handoffRules: '[]',
        qualityChecklist: '[]',
        selfImprovement: childSelfImprovement,
        productivityRules: '{}',
        status: 'active',
        version: 1,
      },
    })

    // Create Initial Version Entry for rollback and auditability
    try {
      await db.agentVersion.create({
        data: {
          agentId: newAgent.id,
          version: 1,
          changeLog: `Initial evolution from parent ${proposal.parentAgentName} (${proposal.parentAgentId}): ${proposal.reason}`,
          config: JSON.stringify(newAgent),
        },
      })
    } catch {
      // Continue even if version table fails
    }

    // Update parent agent's descendant/loop count
    const updatedSelfImp = {
      ...parentSelfImp,
      descendantCount: proposal.isLoopAgent ? proposedDescendantsCount : proposedDescendantsCount + 1,
      loopAgentCount: proposal.isLoopAgent ? Number(parentSelfImp.loopAgentCount ?? 0) + 1 : Number(parentSelfImp.loopAgentCount ?? 0),
    }

    await db.agent.update({
      where: { id: parentAgent.id },
      data: {
        selfImprovement: JSON.stringify(updatedSelfImp),
      },
    })

    return {
      approved: true,
      reason: `Agent '${proposal.proposedName}' created successfully via evolution (Gen-${currentGeneration})`,
      newAgentId,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { approved: false, reason: `Internal error: ${message}` }
  }
}

// ── getProposals ──────────────────────────────────────────────────────────

export async function getProposals(departmentId?: string): Promise<unknown[]> {
  try {
    const where: Record<string, unknown> = {
      status: 'active',
    }
    if (departmentId) {
      where.departmentId = departmentId
    }

    const agents = await db.agent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        agentId: true,
        name: true,
        role: true,
        type: true,
        departmentId: true,
        departmentName: true,
        purpose: true,
        allowedSkills: true,
        selfImprovement: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return agents.map((a) => {
      const selfImp = safeParseJSON<Record<string, unknown>>(a.selfImprovement, {})
      return {
        ...a,
        allowedSkills: safeParseJSON<string[]>(a.allowedSkills, []),
        genealogy: {
          parentAgentId: selfImp.parentAgentId ?? null,
          parentAgentName: selfImp.parentAgentName ?? null,
          generation: selfImp.generation ?? 0,
          isLoopAgent: selfImp.isLoopAgent ?? false,
        },
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      }
    })
  } catch (error) {
    console.error('Failed to get proposals:', error)
    return []
  }
}

// ── getEvolutionStats ─────────────────────────────────────────────────────

export async function getEvolutionStats(): Promise<{
  totalAgents: number
  totalDepartments: number
  config: EvolutionConfig
  proposalsThisMonth: number
  agentsByGeneration: Record<string, number>
}> {
  try {
    const [totalAgents, totalDepartments, proposalsThisMonth, allAgents] = await Promise.all([
      db.agent.count(),
      db.department.count(),
      db.agent.count({
        where: {
          createdAt: {
            gte: new Date(
              new Date().getFullYear(),
              new Date().getMonth(),
              1
            ),
          },
        },
      }),
      db.agent.findMany({
        select: { selfImprovement: true },
      }),
    ])

    const config = await getEvolutionConfigFromDB()

    const agentsByGeneration: Record<string, number> = {
      '0': 0,
      '1': 0,
      '2': 0,
      '3': 0,
    }

    for (const agent of allAgents) {
      const selfImp = safeParseJSON<Record<string, unknown>>(agent.selfImprovement, {})
      const gen = String(selfImp.generation ?? '0')
      agentsByGeneration[gen] = (agentsByGeneration[gen] || 0) + 1
    }

    return {
      totalAgents,
      totalDepartments,
      config,
      proposalsThisMonth,
      agentsByGeneration,
    }
  } catch (error) {
    console.error('Failed to get evolution stats:', error)
    const config = await getEvolutionConfigFromDB()
    return {
      totalAgents: 0,
      totalDepartments: 0,
      config,
      proposalsThisMonth: 0,
      agentsByGeneration: { '0': 0, '1': 0, '2': 0, '3': 0 },
    }
  }
}
