import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    const where: Record<string, unknown> = {}
    if (status && status !== 'all') {
      where.status = status
    }

    const workflows = await db.workflow.findMany({
      where,
      include: {
        workflowSteps: { orderBy: { stepNumber: 'asc' } },
        _count: { select: { runs: true, tasks: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    // Get success rates from workflow runs
    const workflowIds = workflows.map(w => w.id)
    const runStats = workflowIds.length > 0
      ? await db.workflowRun.groupBy({
          by: ['workflowId'],
          where: { workflowId: { in: workflowIds } },
          _count: { id: true },
          _sum: { durationMs: true },
          _avg: { durationMs: true },
        })
      : []

    // Get success counts
    const successCounts = workflowIds.length > 0
      ? await db.workflowRun.groupBy({
          by: ['workflowId'],
          where: { workflowId: { in: workflowIds }, status: 'completed' },
          _count: { id: true },
        })
      : []

    const successMap = Object.fromEntries(successCounts.map(r => [r.workflowId, r._count.id]))
    const runMap = Object.fromEntries(runStats.map(r => [r.workflowId, r]))

    const mapped = workflows.map(w => {
      const stats = runMap[w.id]
      const successCount = successMap[w.id] || 0
      const totalRuns = stats?._count.id ?? w._count.runs
      return {
        id: w.id,
        name: w.name,
        type: w.slug.includes('etl') ? 'etl'
          : w.slug.includes('approval') ? 'approval'
          : w.slug.includes('notification') ? 'notification'
          : w.slug.includes('integration') ? 'integration'
          : w.slug.includes('ai') ? 'ai_pipeline'
          : w.slug.includes('compliance') ? 'compliance'
          : 'monitoring',
        status: w.status,
        steps: w.workflowSteps.map((step) => ({
          id: step.id,
          name: `Step ${step.stepNumber}: ${step.action}`,
          status: 'pending' as const,
        })),
        successRate: totalRuns > 0 ? Math.round((successCount / totalRuns) * 100) : 0,
        avgDuration: stats?._avg.durationMs == null ? 0 : Math.round(stats._avg.durationMs / 1000),
        runsCount: totalRuns,
        createdAt: w.createdAt.toISOString(),
      }
    })

    const [total, active, completed] = await Promise.all([
      db.workflow.count({ where }),
      db.workflow.count({ where: { ...where, status: 'active' } }),
      db.workflow.count({ where: { ...where, status: 'completed' } }),
    ])

    // Overall success rate
    const [totalRuns, totalSuccessRuns] = await Promise.all([
      db.workflowRun.count(),
      db.workflowRun.count({ where: { status: 'completed' } }),
    ])
    const overallSuccessRate = totalRuns > 0 ? Number(((totalSuccessRuns / totalRuns) * 100).toFixed(1)) : 0
    const overallAvgDuration = totalRuns > 0
      ? Math.round(((await db.workflowRun.aggregate({ _avg: { durationMs: true } }))._avg.durationMs ?? 0) / 1000)
      : 0

    return NextResponse.json({
      workflows: mapped,
      stats: { total, active, completed, successRate: overallSuccessRate, avgDuration: overallAvgDuration },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Enterprise workflows error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
