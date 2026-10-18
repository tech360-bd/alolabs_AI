import { NextRequest, NextResponse } from 'next/server'
import { requireCompanyAuth } from '@/lib/api-auth'
import { db } from '@/lib/db'

const RUN_SAMPLE_LIMIT = 500
const DEFAULT_LIMIT = 60
const MAX_LIMIT = 200

const CRITICAL_EVENTS = new Set([
  'run.failed',
  'task.failed',
  'qc.failed',
  'approval.rejected',
  'approval.expired',
])
const WARNING_EVENTS = new Set(['approval.requested', 'task.skipped', 'run.paused'])
const DEBUG_EVENTS = new Set(['tool.started', 'tool.completed'])

function severityFor(type: string): 'critical' | 'warning' | 'info' | 'debug' {
  if (CRITICAL_EVENTS.has(type)) return 'critical'
  if (WARNING_EVENTS.has(type)) return 'warning'
  if (DEBUG_EVENTS.has(type)) return 'debug'
  return 'info'
}

function parsePayload(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return { value: parsed }
  } catch {
    return { value: value.slice(0, 1000) }
  }
}

function messageFor(type: string, payload: Record<string, unknown>): string {
  for (const key of ['message', 'summary', 'title', 'error', 'note']) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 500)
  }
  return type.replace(/\./g, ' ')
}

function boundedInteger(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback
}

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireCompanyAuth()
    const params = request.nextUrl.searchParams
    const limit = boundedInteger(params.get('limit'), DEFAULT_LIMIT, MAX_LIMIT)
    const page = boundedInteger(params.get('page'), 1, 100_000)
    const selectedSeverity = params.get('severity') ?? 'all'
    const selectedType = params.get('type') ?? 'all'
    const allowedSeverities = new Set(['all', 'critical', 'warning', 'info', 'debug'])
    if (!allowedSeverities.has(selectedSeverity)) {
      return NextResponse.json({ error: 'Invalid severity filter' }, { status: 400 })
    }

    // RunEvent has no companyId of its own. Resolve only this tenant's latest
    // durable run IDs first, then query events through that explicit boundary.
    const recentRuns = await db.agentOSRun.findMany({
      where: { companyId },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: RUN_SAMPLE_LIMIT + 1,
    })
    const sampledRuns = recentRuns.slice(0, RUN_SAMPLE_LIMIT)
    const runIds = sampledRuns.map((run) => run.id)
    if (runIds.length === 0) {
      return NextResponse.json({
        events: [],
        stats: { total: 0, bySeverity: {}, byType: {}, sampledRunCount: 0, runSampleLimit: RUN_SAMPLE_LIMIT },
        total: 0,
        page,
        limit,
        scope: { runCount: 0, runSampleLimit: RUN_SAMPLE_LIMIT, truncated: false },
      })
    }

    const baseWhere = { runId: { in: runIds } }
    const [typeCounts, totalInScope] = await Promise.all([
      db.runEvent.groupBy({
        by: ['type'],
        where: baseWhere,
        _count: { _all: true },
      }),
      db.runEvent.count({ where: baseWhere }),
    ])

    const byType = Object.fromEntries(typeCounts.map((entry) => [entry.type, entry._count._all]))
    const bySeverity: Record<string, number> = {}
    for (const [type, count] of Object.entries(byType)) {
      const severity = severityFor(type)
      bySeverity[severity] = (bySeverity[severity] ?? 0) + count
    }

    const severityTypes = selectedSeverity === 'all'
      ? undefined
      : typeCounts
          .filter((entry) => severityFor(entry.type) === selectedSeverity)
          .map((entry) => entry.type)
    const typeFilter = severityTypes
      ? (selectedType && selectedType !== 'all'
          ? severityTypes.filter((type) => type === selectedType)
          : severityTypes)
      : (selectedType && selectedType !== 'all' ? [selectedType] : undefined)
    const where = {
      ...baseWhere,
      ...(typeFilter ? { type: { in: typeFilter } } : {}),
    }
    const filteredTotal = await db.runEvent.count({ where })
    const rows = await db.runEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    })

    const events = rows.map((event) => {
      const payload = parsePayload(event.data)
      return {
        id: event.id,
        runId: event.runId,
        type: event.type,
        source: event.source,
        severity: severityFor(event.type),
        timestamp: event.createdAt.toISOString(),
        payload,
        message: messageFor(event.type, payload),
      }
    })

    return NextResponse.json({
      events,
      stats: { total: totalInScope, bySeverity, byType, sampledRunCount: runIds.length, runSampleLimit: RUN_SAMPLE_LIMIT },
      total: filteredTotal,
      page,
      limit,
      scope: { runCount: runIds.length, runSampleLimit: RUN_SAMPLE_LIMIT, truncated: recentRuns.length > RUN_SAMPLE_LIMIT },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500
    if (status === 500) console.error('Enterprise activity API error:', error)
    return NextResponse.json({ error: status === 500 ? 'Internal server error' : message }, { status })
  }
}
