import { db } from '@/lib/db'

// ──────────────────────────────────────────────
// Collected system metrics result
// ──────────────────────────────────────────────

export interface SystemMetrics {
  agent_hub_agents_total: number
  agent_hub_tasks_total: Record<string, number>
  agent_hub_queue_items: Record<string, number>
  agent_hub_companies_total: number
  agent_hub_token_usage_daily: number
  collectedAt: string
}

// ──────────────────────────────────────────────
// collectSystemMetrics
//
// Gathers high-level system metrics from the database
// and records each one as a Metric entry.
// Can be called periodically or on-demand.
// ──────────────────────────────────────────────

export async function collectSystemMetrics(): Promise<SystemMetrics> {
  const now = new Date().toISOString()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  // Run independent queries in parallel
  const [
    activeAgents,
    tasksByStatus,
    queueItemsByStatus,
    companies,
    todayTokenUsage,
  ] = await Promise.all([
    // 1. Active agents count
    db.agent.count({ where: { status: 'active' } }),

    // 2. Tasks grouped by status
    db.task.groupBy({
      by: ['status'],
      _count: { id: true },
    }),

    // 3. Queue items grouped by status
    db.queueItem.groupBy({
      by: ['status'],
      _count: { id: true },
    }),

    // 4. Total companies
    db.company.count(),

    // 5. Token usage today
    db.tokenUsage.aggregate({
      where: { createdAt: { gte: todayStart } },
      _sum: { totalTokens: true },
    }),
  ])

  // Build task status map
  const tasksTotal: Record<string, number> = {}
  for (const group of tasksByStatus) {
    tasksTotal[group.status] = group._count.id
  }

  // Build queue items status map
  const queueItems: Record<string, number> = {}
  for (const group of queueItemsByStatus) {
    queueItems[group.status] = group._count.id
  }

  const dailyTokenUsage = todayTokenUsage._sum.totalTokens ?? 0

  const result: SystemMetrics = {
    agent_hub_agents_total: activeAgents,
    agent_hub_tasks_total: tasksTotal,
    agent_hub_queue_items: queueItems,
    agent_hub_companies_total: companies,
    agent_hub_token_usage_daily: dailyTokenUsage,
    collectedAt: now,
  }

  // Record each metric in the Metric table
  const metricRecords = [
    {
      name: 'agent_hub_agents_total',
      value: activeAgents,
      labels: '{}',
      unit: 'agents',
    },
    {
      name: 'agent_hub_companies_total',
      value: companies,
      labels: '{}',
      unit: 'companies',
    },
    {
      name: 'agent_hub_token_usage_daily',
      value: dailyTokenUsage,
      labels: '{}',
      unit: 'tokens',
    },
  ]

  // Per-status task metrics
  for (const [status, count] of Object.entries(tasksTotal)) {
    metricRecords.push({
      name: 'agent_hub_tasks_total',
      value: count,
      labels: JSON.stringify({ status }),
      unit: 'tasks',
    })
  }

  // Per-status queue item metrics
  for (const [status, count] of Object.entries(queueItems)) {
    metricRecords.push({
      name: 'agent_hub_queue_items',
      value: count,
      labels: JSON.stringify({ status }),
      unit: 'items',
    })
  }

  // Batch insert (non-blocking)
  await db.metric
    .createMany({
      data: metricRecords,
    })
    .catch((err) => {
      console.error('Failed to record system metrics:', err)
    })

  return result
}