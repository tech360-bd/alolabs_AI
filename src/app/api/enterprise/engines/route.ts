import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

interface EngineRecord {
  id: string
  action: string
  status: 'completed' | 'failed' | 'pending' | 'running'
  duration: number
  score: number | null
  timestamp: string
}

interface EngineStats {
  total: number
  completed: number
  failed: number
  avgDuration: number
  avgScore: number
}

function buildAgentRunWhere(status?: string, action?: string): Prisma.AgentRunWhereInput {
  const conditions: Prisma.AgentRunWhereInput[] = []

  if (status && status !== 'all') {
    conditions.push({ status })
  }

  // Map engine actions to agent run statuses where applicable
  if (action && action !== 'all') {
    // AgentRun doesn't have an "action" field, so we skip action filtering
    // unless we can derive it from the agent name or other context
  }

  return conditions.length > 0 ? { AND: conditions } : {}
}

function buildTokenUsageWhere(status?: string, action?: string): Prisma.TokenUsageWhereInput {
  const conditions: Prisma.TokenUsageWhereInput[] = []

  // No direct status/action mapping for TokenUsage
  return conditions.length > 0 ? { AND: conditions } : {}
}

function buildHealthWhere(status?: string): Prisma.AgentHealthWhereInput {
  const conditions: Prisma.AgentHealthWhereInput[] = []

  if (status && status !== 'all') {
    // Map engine statuses to health statuses
    if (status === 'failed') {
      conditions.push({ status: 'unhealthy' })
    } else if (status === 'completed') {
      conditions.push({ status: 'healthy' })
    }
  }

  return conditions.length > 0 ? { AND: conditions } : {}
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const engineType = searchParams.get('engineType') || 'memory'
    const statusFilter = searchParams.get('status') ?? undefined
    const actionFilter = searchParams.get('action') ?? undefined
    const limit = Math.min(Number(searchParams.get('limit') || 50), 200)

    let records: EngineRecord[] = []
    let stats: EngineStats = { total: 0, completed: 0, failed: 0, avgDuration: 0, avgScore: 0 }

    if (engineType === 'memory' || engineType === 'all') {
      // Query AgentRun records for execution data
      const runWhere = buildAgentRunWhere(statusFilter, actionFilter)
      const [runs, runCount] = await Promise.all([
        db.agentRun.findMany({
          where: runWhere,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            durationMs: true,
            createdAt: true,
            agent: { select: { name: true } },
          },
        }),
        db.agentRun.count({ where: runWhere }),
      ])

      records = runs.map((r) => ({
        id: r.id,
        action: r.agent?.name || 'unknown',
        status: mapRunStatus(r.status),
        duration: r.durationMs ?? 0,
        score: null,
        timestamp: r.createdAt.toISOString(),
      }))

      const completedCount = await db.agentRun.count({ where: { ...runWhere, status: 'completed' } })
      const failedCount = await db.agentRun.count({ where: { ...runWhere, status: 'failed' } })

      // Calculate average duration from completed runs
      const completedRuns = await db.agentRun.findMany({
        where: { ...runWhere, status: 'completed', durationMs: { not: null } },
        select: { durationMs: true },
        take: 1000,
      })

      const avgDuration = completedRuns.length > 0
        ? Math.round(completedRuns.reduce((sum, r) => sum + (r.durationMs ?? 0), 0) / completedRuns.length)
        : 0

      stats = {
        total: runCount,
        completed: completedCount,
        failed: failedCount,
        avgDuration,
        avgScore: 0, // AgentRun doesn't have score field
      }
    } else if (engineType === 'evaluation' || engineType === 'self-optimization') {
      // Query AgentPerformanceScore for evaluation/optimization data
      const perfWhere: Prisma.AgentPerformanceScoreWhereInput = {}
      const [perfScores, perfCount] = await Promise.all([
        db.agentPerformanceScore.findMany({
          where: perfWhere,
          take: limit,
          orderBy: { calculatedAt: 'desc' },
          select: {
            id: true,
            agentId: true,
            period: true,
            successRate: true,
            avgRuntimeMs: true,
            productivityScore: true,
            calculatedAt: true,
          },
        }),
        db.agentPerformanceScore.count({ where: perfWhere }),
      ])

      records = perfScores.map((p) => ({
        id: p.id,
        action: engineType === 'evaluation' ? 'evaluate' : 'optimize',
        status: p.successRate >= 0.8 ? 'completed' : p.successRate >= 0.5 ? 'running' : 'failed',
        duration: p.avgRuntimeMs,
        score: Math.round(p.productivityScore * 10) / 10,
        timestamp: p.calculatedAt.toISOString(),
      }))

      const highPerf = await db.agentPerformanceScore.count({
        where: { productivityScore: { gte: 0.8 } },
      })
      const lowPerf = await db.agentPerformanceScore.count({
        where: { productivityScore: { lt: 0.5 } },
      })

      const allPerf = await db.agentPerformanceScore.findMany({
        select: { productivityScore: true, avgRuntimeMs: true },
      })

      const avgDuration = allPerf.length > 0
        ? Math.round(allPerf.reduce((sum, p) => sum + p.avgRuntimeMs, 0) / allPerf.length)
        : 0
      const avgScore = allPerf.length > 0
        ? Math.round(allPerf.reduce((sum, p) => sum + p.productivityScore, 0) / allPerf.length * 10) / 10
        : 0

      stats = {
        total: perfCount,
        completed: highPerf,
        failed: lowPerf,
        avgDuration,
        avgScore,
      }
    } else {
      // For other engine types (planning, reflection, self-healing, governance, compliance, audit, security),
      // query AgentHealth for health/status data and AgentRun for activity
      const healthWhere = buildHealthWhere(statusFilter)
      const [healthRecords, healthCount] = await Promise.all([
        db.agentHealth.findMany({
          where: healthWhere,
          take: limit,
          orderBy: { checkedAt: 'desc' },
          include: {
            agent: { select: { name: true } },
          },
        }),
        db.agentHealth.count({ where: healthWhere }),
      ])

      records = healthRecords.map((h) => ({
        id: h.id,
        action: mapEngineAction(engineType),
        status: mapHealthStatus(h.status),
        duration: 0, // Health checks don't have duration
        score: h.consecutiveFailures === 0 ? 100 : Math.max(0, 100 - h.consecutiveFailures * 10),
        timestamp: h.checkedAt.toISOString(),
      }))

      const healthyCount = await db.agentHealth.count({ where: { status: 'healthy' } })
      const unhealthyCount = await db.agentHealth.count({ where: { status: 'unhealthy' } })

      stats = {
        total: healthCount,
        completed: healthyCount,
        failed: unhealthyCount,
        avgDuration: 0,
        avgScore: healthCount > 0 ? Math.round((healthyCount / healthCount) * 1000) / 10 : 0,
      }
    }

    return NextResponse.json({ records, stats })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Enterprise API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function mapRunStatus(runStatus: string): 'completed' | 'failed' | 'pending' | 'running' {
  if (runStatus === 'completed') return 'completed'
  if (runStatus === 'failed') return 'failed'
  if (runStatus === 'pending') return 'pending'
  return 'running'
}

function mapHealthStatus(healthStatus: string): 'completed' | 'failed' | 'pending' | 'running' {
  if (healthStatus === 'healthy') return 'completed'
  if (healthStatus === 'unhealthy') return 'failed'
  if (healthStatus === 'degraded') return 'running'
  return 'pending'
}

function mapEngineAction(engineType: string): string {
  const actionMap: Record<string, string> = {
    planning: 'plan',
    reflection: 'reflect',
    'self-healing': 'repair',
    governance: 'govern',
    compliance: 'comply',
    audit: 'audit',
    security: 'secure',
  }
  return actionMap[engineType] || 'execute'
}
