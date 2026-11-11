import { v1Handler } from '@/lib/v1'
import { db } from '@/lib/db'
import { voiceMetricsSnapshot } from '@/lib/voice/metrics'

/**
 * /api/v1/voice/analytics — real call-center analytics (master prompt §17/§22).
 * All values are live database aggregates; simulated usage is labeled so
 * demo data can never inflate business reporting.
 */
export const dynamic = 'force-dynamic'

export const GET = v1Handler(async ({ identity }) => {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const where = { companyId: identity.companyId }

  const [total, inbound, outbound, byStatus, completed, failed, avgDuration, escalations, appointments, usage] =
    await Promise.all([
      db.callSession.count({ where }),
      db.callSession.count({ where: { ...where, direction: 'inbound' } }),
      db.callSession.count({ where: { ...where, direction: 'outbound' } }),
      db.callSession.groupBy({ by: ['status'], where, _count: { _all: true } }),
      db.callSession.count({ where: { ...where, status: 'completed' } }),
      db.callSession.count({ where: { ...where, status: 'failed' } }),
      db.callSession.aggregate({ where, _avg: { durationSeconds: true } }),
      db.escalation.findMany({
        where: { companyId: identity.companyId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, trigger: true, status: true, assignedUserId: true, createdAt: true },
      }),
      db.appointment.count({ where }),
      db.voiceUsageEntry.groupBy({
        by: ['dimension'],
        where: { companyId: identity.companyId, recordedAt: { gte: since30d } },
        _sum: { quantity: true },
      }),
    ])

  const statusCounts = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]))
  const answered = statusCounts['completed'] ?? 0
  const aiResolutionRate = total > 0 ? Math.round((answered / total) * 1000) / 10 : null

  return {
    window: 'all-time counts, rolling-30d usage',
    totals: {
      calls: total,
      inbound,
      outbound,
      completed,
      failed,
      appointments,
    },
    statusCounts,
    aiResolutionRatePercent: aiResolutionRate,
    averageDurationSeconds: Math.round((avgDuration._avg.durationSeconds ?? 0) * 100) / 100,
    escalations: {
      open: escalations.filter((e: { status: string }) => ['assigned', 'callback_scheduled'].includes(e.status)).length,
      recent: escalations.slice(0, 10),
    },
    usage30d: Object.fromEntries(usage.map((u: { dimension: string; _sum: { quantity: number | null } }) => [u.dimension, u._sum.quantity ?? 0])),
  }
})
