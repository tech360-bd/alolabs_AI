import { NextResponse } from 'next/server'
import { requireCompanyAuth } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { agentCompanyScope } from '@/lib/agent-access'
import { isKnowledgeVisibleToCompany } from '@/lib/tenant-knowledge'

const DAY_MS = 24 * 60 * 60 * 1000
const EVENT_RUN_SAMPLE = 250

export async function GET() {
  try {
    const user = await requireCompanyAuth()
    const { companyId } = user
    const since = new Date(Date.now() - DAY_MS)

    // Load tenant-owned departments and agents explicitly shared with this
    // tenant. The tables without a companyId are only counted through these
    // scoped IDs or through an explicit public/tenant access relation below.
    const [departments, agents] = await Promise.all([
      db.department.findMany({
        where: { companyId },
        select: { id: true, name: true, slug: true, status: true, sortOrder: true },
        orderBy: { sortOrder: 'asc' },
      }),
      db.agent.findMany({
        where: agentCompanyScope(companyId, 'view'),
        select: { id: true, agentId: true, status: true, departmentId: true },
      }),
    ])

    const departmentIds = departments.map((department) => department.id)
    const tenantDepartmentScope = departmentIds.length > 0
      ? [{ departmentId: { in: departmentIds } }]
      : []
    // KnowledgeNode has no relational owner. Fetch tenant-department nodes and
    // unassigned rows whose metadata could explicitly allow tenant/public/global
    // visibility, then apply the same fail-closed check as context assembly.
    const knowledgeCandidates = await db.knowledgeNode.findMany({
      where: {
        OR: [
          ...tenantDepartmentScope,
          { departmentId: null, metadata: { contains: companyId } },
          { departmentId: null, metadata: { contains: 'public' } },
          { departmentId: null, metadata: { contains: 'global' } },
          { departmentId: null, metadata: { contains: 'isPublic' } },
        ],
      },
      select: { id: true, departmentId: true, metadata: true },
    })
    const knowledgeNodes = knowledgeCandidates.filter((node) => isKnowledgeVisibleToCompany(
      node.metadata,
      companyId,
      node.departmentId !== null && departmentIds.includes(node.departmentId),
    )).length
    const ruleWhere = {
      isActive: true,
      AND: [
        { OR: [{ companyId: null }, { companyId }] },
        { OR: [{ departmentId: null }, ...tenantDepartmentScope] },
      ],
    }
    // EnterpriseSOP has no tenant owner or explicit global-visibility flag.
    // Count only SOPs attached to a company-owned department.
    const sopWhere = {
      isActive: true,
      status: 'active',
      departmentId: { in: departmentIds },
    }
    const promptWhere = {
      isActive: true,
      isPublic: true,
      OR: [{ departmentId: null }, ...tenantDepartmentScope],
    }
    const skillWhere = {
      OR: [
        { status: 'approved' },
        { status: 'private', skillCompanyAccess: { some: { companyId } } },
      ],
    }

    const [
      constitutionalRules,
      sops,
      skills,
      prompts,
      ragCollections,
      ragDocuments,
      ragChunks,
      ragQueries,
      averageRagQueryDuration,
      collaborations,
      agentMemory,
      companyMemory,
      workflowRuns,
      engineRecords,
      engineRecordsByType,
      securityEvents,
      dataLakeEntries,
      companyUsers,
      runsTotal,
      runs24h,
      activeRuns,
      completedRuns24h,
      failedRuns24h,
      agentRuns24h,
      completedAgentRuns24h,
      failedAgentRuns24h,
      averageAgentRunLatency,
      usageLogs24h,
      failedUsageLogs24h,
      recentRuns,
    ] = await Promise.all([
      db.constitutionalRule.count({ where: ruleWhere }),
      db.enterpriseSOP.count({ where: sopWhere }),
      db.skill.count({ where: skillWhere }),
      db.promptTemplate.count({ where: promptWhere }),
      db.ragCollection.count({ where: { companyId } }),
      db.ragDocument.count({ where: { companyId } }),
      db.ragChunk.count({ where: { companyId } }),
      db.ragQuery.count({ where: { companyId } }),
      db.ragQuery.aggregate({ where: { companyId }, _avg: { durationMs: true } }),
      db.collaborationSession.count({ where: { companyId } }),
      db.agentMemory.count({ where: { companyId } }),
      db.companyMemory.count({ where: { companyId } }),
      db.workflowRun.count({ where: { companyId } }),
      db.engineRecord.count({ where: { departmentId: { in: departmentIds } } }),
      departmentIds.length > 0
        ? db.engineRecord.groupBy({
            by: ['engineType'],
            where: { departmentId: { in: departmentIds } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      db.securityEvent.count({ where: { companyId } }),
      departmentIds.length > 0
        ? db.dataLakeEntry.count({ where: { departmentId: { in: departmentIds } } })
        : Promise.resolve(0),
      db.companyUser.count({ where: { companyId } }),
      db.agentOSRun.count({ where: { companyId } }),
      db.agentOSRun.count({ where: { companyId, createdAt: { gte: since } } }),
      db.agentOSRun.count({ where: { companyId, status: { in: ['queued', 'planning', 'running', 'waiting_approval'] } } }),
      db.agentOSRun.count({ where: { companyId, status: 'completed', createdAt: { gte: since } } }),
      db.agentOSRun.count({ where: { companyId, status: { in: ['failed', 'cancelled'] }, createdAt: { gte: since } } }),
      db.agentRun.count({ where: { companyId, createdAt: { gte: since } } }),
      db.agentRun.count({ where: { companyId, status: { in: ['completed', 'success'] }, createdAt: { gte: since } } }),
      db.agentRun.count({ where: { companyId, status: { in: ['failed', 'error'] }, createdAt: { gte: since } } }),
      db.agentRun.aggregate({ where: { companyId, createdAt: { gte: since } }, _avg: { latencyMs: true } }),
      db.usageLog.count({ where: { companyId, createdAt: { gte: since } } }),
      db.usageLog.count({ where: { companyId, status: { in: ['failed', 'error'] }, createdAt: { gte: since } } }),
      db.agentOSRun.findMany({
        where: { companyId },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
        take: EVENT_RUN_SAMPLE + 1,
      }),
    ])

    const sampledRuns = recentRuns.slice(0, EVENT_RUN_SAMPLE)
    const recentRunIds = sampledRuns.map((run) => run.id)
    const events = recentRunIds.length > 0
      ? await db.runEvent.count({ where: { runId: { in: recentRunIds } } })
      : 0

    const agentsByDepartment = new Map<string, number>()
    for (const agent of agents) {
      if (!agent.departmentId) continue
      agentsByDepartment.set(agent.departmentId, (agentsByDepartment.get(agent.departmentId) ?? 0) + 1)
    }
    const topDepartments = departments
      .map((department) => ({
        id: department.id,
        name: department.name,
        slug: department.slug,
        status: department.status,
        sortOrder: department.sortOrder,
        agentCount: agentsByDepartment.get(department.id) ?? 0,
      }))
      .sort((a, b) => b.agentCount - a.agentCount || a.sortOrder - b.sortOrder)
      .slice(0, 10)

    const activeAgents = agents.filter((agent) => agent.status === 'active').length
    const provisionedAgents = agents.filter((agent) => agent.status === 'provisioned').length
    const successfulAgentRuns = completedAgentRuns24h
    const terminalAgentRuns = successfulAgentRuns + failedAgentRuns24h
    const successfulRunCount = completedRuns24h
    const terminalRuns = successfulRunCount + failedRuns24h

    const rag = {
      collections: ragCollections,
      documents: ragDocuments,
      chunks: ragChunks,
      queries: ragQueries,
      averageQueryDurationMs: averageRagQueryDuration._avg.durationMs == null ? null : Math.round(averageRagQueryDuration._avg.durationMs),
    }
    const memoryRecords = agentMemory + companyMemory
    const execution = {
      window: '24h',
      runs24h,
      completedRuns24h,
      failedRuns24h,
      activeRuns,
      runSuccessRate: terminalRuns > 0 ? successfulRunCount / terminalRuns : null,
      agentRuns24h,
      completedAgentRuns24h,
      failedAgentRuns24h,
      agentRunSuccessRate: terminalAgentRuns > 0 ? successfulAgentRuns / terminalAgentRuns : null,
      averageAgentRunLatencyMs: averageAgentRunLatency._avg.latencyMs == null
        ? null
        : Math.round(averageAgentRunLatency._avg.latencyMs),
      usageLogs24h,
      failedUsageLogs24h,
      usageErrorRate: usageLogs24h > 0 ? failedUsageLogs24h / usageLogs24h : null,
    }
    const dbCounts = {
      departments: departments.length,
      agents: agents.length,
      activeAgents,
      provisionedAgents,
      rules: constitutionalRules,
      sops,
      skills,
      prompts,
      knowledgeNodes,
      collaborations,
      memoryRecords,
      workflowRuns,
      engineRecords,
      engineRecordsByType: Object.fromEntries(engineRecordsByType.map((entry) => [entry.engineType, entry._count._all])),
      securityEvents,
      events,
      runsTotal,
      eventScope: { recentRuns: sampledRuns.length, maxRuns: EVENT_RUN_SAMPLE, truncated: recentRuns.length > EVENT_RUN_SAMPLE },
      dataLakeEntries,
      companyUsers,
      rag,
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      scope: { companyId, metricsWindow: '24h' },
      db: dbCounts,
      execution,
      topDepartments,
      // Backward-compatible flat fields; every value is an actual tenant-scoped
      // database count (or a count of explicit public/shared records above).
      departments: dbCounts.departments,
      agents: dbCounts.agents,
      rules: dbCounts.rules,
      sops: dbCounts.sops,
      skills: dbCounts.skills,
      prompts: dbCounts.prompts,
      knowledgeNodes: dbCounts.knowledgeNodes,
      collaborations: dbCounts.collaborations,
      engineRecords: dbCounts.engineRecords,
      events: dbCounts.events,
      dataLakeEntries: dbCounts.dataLakeEntries,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500
    if (status === 500) console.error('Enterprise stats API error:', error)
    return NextResponse.json({ error: status === 500 ? 'Internal server error' : message }, { status })
  }
}
