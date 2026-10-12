import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'

export type OptimizationType = 'prompt' | 'workflow' | 'planning' | 'skill_selection' | 'tool_selection'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseConfig(json: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(json)
  if (!isRecord(parsed)) throw new Error('Optimization config must be a JSON object')
  return parsed
}

function parseStringArray(value: string): string[] {
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || !parsed.every((item): item is string => typeof item === 'string')) {
    throw new Error('Agent configuration contains an invalid string list')
  }
  return parsed
}

function requireString(config: Record<string, unknown>, key: string): string {
  const value = config[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Optimization config requires a non-empty string field named ${key}`)
  }
  return value
}

function requireStringArray(config: Record<string, unknown>, key: string): string[] {
  const value = config[key]
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string')) {
    throw new Error(`Optimization config requires a string array named ${key}`)
  }
  return value
}

function getConfigForTarget(agent: {
  purpose: string
  allowedSkills: string
  allowedTools: string
  workflowSteps: string
}, targetType: string): Record<string, unknown> {
  switch (targetType) {
    case 'prompt':
      return { purpose: agent.purpose }
    case 'skill_selection':
      return { allowedSkills: parseStringArray(agent.allowedSkills) }
    case 'tool_selection':
      return { allowedTools: parseStringArray(agent.allowedTools) }
    case 'planning':
    case 'workflow':
      return { workflowSteps: parseStringArray(agent.workflowSteps) }
    default:
      throw new Error(`Optimization target "${targetType}" is not supported by the agent configuration contract`)
  }
}

async function applyAgentConfig(
  transaction: Prisma.TransactionClient,
  agentId: string,
  targetType: string,
  configJson: string,
  changeLog: string,
): Promise<number> {
  const config = parseConfig(configJson)
  let data: Prisma.AgentUpdateInput

  switch (targetType) {
    case 'prompt':
      data = { purpose: requireString(config, 'purpose'), version: { increment: 1 } }
      break
    case 'skill_selection':
      data = { allowedSkills: JSON.stringify(requireStringArray(config, 'allowedSkills')), version: { increment: 1 } }
      break
    case 'tool_selection':
      data = { allowedTools: JSON.stringify(requireStringArray(config, 'allowedTools')), version: { increment: 1 } }
      break
    case 'planning':
    case 'workflow':
      data = { workflowSteps: JSON.stringify(requireStringArray(config, 'workflowSteps')), version: { increment: 1 } }
      break
    default:
      throw new Error(`Optimization target "${targetType}" is not supported by the agent configuration contract`)
  }

  const agent = await transaction.agent.update({ where: { id: agentId }, data })
  const snapshot = {
    purpose: agent.purpose,
    allowedSkills: agent.allowedSkills,
    allowedTools: agent.allowedTools,
    workflowSteps: agent.workflowSteps,
    version: agent.version,
  }
  await transaction.agentVersion.create({
    data: {
      agentId,
      version: agent.version,
      config: JSON.stringify(snapshot),
      changeLog,
    },
  })
  return agent.version
}

export async function proposeOptimization(data: {
  agentId: string
  type: OptimizationType
  optimizedValue: Record<string, unknown>
  rationale: string
  companyId: string
  proposedBy: string
}) {
  const agent = await db.agent.findUnique({
    where: { id: data.agentId },
    select: { id: true, purpose: true, allowedSkills: true, allowedTools: true, workflowSteps: true },
  })
  if (!agent) throw new Error('Agent not found')

  const access = await db.agentCompanyAccess.findFirst({
    where: { agentId: agent.id, companyId: data.companyId },
    select: { id: true },
  })
  if (!access) throw new Error('Agent is not available to this company')

  const currentConfig = getConfigForTarget(agent, data.type)
  const proposal = await db.agentImprovementProposal.create({
    data: {
      agentId: agent.id,
      targetType: data.type,
      currentConfig: JSON.stringify(currentConfig),
      proposedConfig: JSON.stringify(data.optimizedValue),
      rationale: data.rationale,
      safetyAssessment: JSON.stringify({ status: 'pending_manual_review', reviewed: false }),
      status: 'pending',
      companyId: data.companyId,
    },
  })

  await db.auditLog.create({
    data: {
      userId: data.proposedBy,
      action: 'optimization.proposed',
      resource: 'AgentImprovementProposal',
      details: JSON.stringify({ proposalId: proposal.id, agentId: agent.id, targetType: data.type }),
    },
  })
  return proposal
}

export async function approveOptimization(id: string, approvedBy: string, companyId: string) {
  return db.$transaction(async (transaction) => {
    const proposal = await transaction.agentImprovementProposal.findFirst({ where: { id, companyId } })
    if (!proposal) throw new Error('Optimization not found')
    if (proposal.status !== 'pending') throw new Error('Only pending optimizations can be approved')

    const approved = await transaction.agentImprovementProposal.update({ where: { id }, data: { status: 'approved' } })
    await transaction.auditLog.create({
      data: {
        userId: approvedBy,
        action: 'optimization.approved',
        resource: 'AgentImprovementProposal',
        details: JSON.stringify({ proposalId: id, agentId: proposal.agentId }),
      },
    })
    return approved
  })
}

export async function applyOptimization(id: string, companyId: string, appliedBy: string) {
  return db.$transaction(async (transaction) => {
    const proposal = await transaction.agentImprovementProposal.findFirst({ where: { id, companyId } })
    if (!proposal) throw new Error('Optimization not found')
    if (proposal.status !== 'approved') throw new Error('Optimization must be approved before it can be applied')

    const appliedVersion = await applyAgentConfig(
      transaction,
      proposal.agentId,
      proposal.targetType,
      proposal.proposedConfig,
      `Optimization ${id} applied`,
    )
    const applied = await transaction.agentImprovementProposal.update({
      where: { id },
      data: { status: 'applied', appliedVersion },
    })
    await transaction.auditLog.create({
      data: {
        userId: appliedBy,
        action: 'optimization.applied',
        resource: 'AgentImprovementProposal',
        details: JSON.stringify({ proposalId: id, agentId: proposal.agentId, version: appliedVersion }),
      },
    })
    return applied
  })
}

export async function rollbackOptimization(id: string, companyId: string, rolledBackBy: string) {
  return db.$transaction(async (transaction) => {
    const proposal = await transaction.agentImprovementProposal.findFirst({ where: { id, companyId } })
    if (!proposal) throw new Error('Optimization not found')
    if (proposal.status !== 'applied') throw new Error('Only applied optimizations can be rolled back')

    await applyAgentConfig(
      transaction,
      proposal.agentId,
      proposal.targetType,
      proposal.currentConfig,
      `Optimization ${id} rolled back`,
    )
    const rolledBack = await transaction.agentImprovementProposal.update({ where: { id }, data: { status: 'rolled_back' } })
    await transaction.auditLog.create({
      data: {
        userId: rolledBackBy,
        action: 'optimization.rolled_back',
        resource: 'AgentImprovementProposal',
        details: JSON.stringify({ proposalId: id, agentId: proposal.agentId }),
      },
    })
    return rolledBack
  })
}

export async function evaluateOptimization(
  id: string,
  score: number,
  details: Record<string, unknown>,
  companyId: string,
  evaluatorId: string,
) {
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new Error('Evaluation score must be between 0 and 100')
  }

  return db.$transaction(async (transaction) => {
    const proposal = await transaction.agentImprovementProposal.findFirst({ where: { id, companyId } })
    if (!proposal) throw new Error('Optimization not found')

    const evaluation = await transaction.agentEvaluation.create({
      data: {
        agentId: proposal.agentId,
        evaluatorId,
        evaluationType: 'optimization_review',
        score,
        detailedResults: JSON.stringify({ proposalId: proposal.id, ...details }),
      },
    })
    await transaction.agentImprovementProposal.update({ where: { id }, data: { evaluatedAt: new Date() } })
    return evaluation
  })
}

export async function getOptimizations(filters: {
  agentId?: string
  type?: OptimizationType
  status?: string
  companyId: string
  limit?: number
}) {
  const where: Prisma.AgentImprovementProposalWhereInput = { companyId: filters.companyId }
  if (filters.agentId) where.agentId = filters.agentId
  if (filters.type) where.targetType = filters.type
  if (filters.status) where.status = filters.status
  return db.agentImprovementProposal.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(filters.limit ?? 50, 1), 100),
  })
}
