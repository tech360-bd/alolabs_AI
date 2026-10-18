'use client'

import { useEffect, useState } from 'react'
import { Eye, Activity, Bot, Clock, Database, AlertTriangle, CheckCircle2, XCircle, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchApi } from '@/lib/api'

interface ObservabilityStats {
  generatedAt: string
  execution: {
    window: string
    runs24h: number
    completedRuns24h: number
    failedRuns24h: number
    activeRuns: number
    runSuccessRate: number | null
    agentRuns24h: number
    completedAgentRuns24h: number
    failedAgentRuns24h: number
    agentRunSuccessRate: number | null
    averageAgentRunLatencyMs: number | null
    usageLogs24h: number
    failedUsageLogs24h: number
    usageErrorRate: number | null
  }
}

function numberLabel(value: number | null | undefined): string {
  return value == null ? 'Not measured' : value.toLocaleString()
}

function percentageLabel(value: number | null | undefined): string {
  return value == null ? 'Not measured' : `${(value * 100).toFixed(2)}%`
}

export default function Observability() {
  const [stats, setStats] = useState<ObservabilityStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setError('')
      try {
        setStats(await fetchApi<ObservabilityStats>('/api/enterprise/stats', { signal: controller.signal }))
      } catch (cause) {
        if (cause instanceof Error && cause.name !== 'AbortError') {
          setError(cause.message)
          setStats(null)
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [])

  if (loading) return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 w-full rounded-xl" />)}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )

  const execution = stats?.execution
  const metrics = [
    { label: 'Runs created · 24h', value: numberLabel(execution?.runs24h), icon: Zap, color: 'text-[#003ABC]' },
    { label: 'Currently active runs', value: numberLabel(execution?.activeRuns), icon: Activity, color: 'text-blue-600' },
    { label: 'Run completion rate · 24h', value: percentageLabel(execution?.runSuccessRate), icon: CheckCircle2, color: 'text-emerald-600' },
    { label: 'Recorded agent runs · 24h', value: numberLabel(execution?.agentRuns24h), icon: Bot, color: 'text-violet-600' },
    { label: 'Mean agent-run latency', value: execution?.averageAgentRunLatencyMs == null ? 'Not measured' : `${execution.averageAgentRunLatencyMs.toLocaleString()} ms`, icon: Clock, color: 'text-[#FF6A00]' },
    { label: 'Usage records · 24h', value: numberLabel(execution?.usageLogs24h), icon: Database, color: 'text-cyan-600' },
    { label: 'Usage error rate · 24h', value: percentageLabel(execution?.usageErrorRate), icon: XCircle, color: 'text-red-600' },
    { label: 'Failed agent runs · 24h', value: numberLabel(execution?.failedAgentRuns24h), icon: AlertTriangle, color: 'text-amber-600' },
  ]

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/30">
          <Eye className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Observability</h2>
          <p className="text-sm text-slate-500">Tenant-scoped run and usage evidence from persisted database records.</p>
        </div>
        <Badge variant="outline" className="ml-auto">24-hour window</Badge>
      </div>

      {error && <p role="status" className="text-sm text-amber-700 dark:text-amber-400">Telemetry is unavailable: {error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon
          return (
            <Card key={metric.label} className="rounded-xl shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-500">{metric.label}</p>
                    <p className={`mt-1 text-xl font-bold ${metric.color}`}>{stats ? metric.value : '—'}</p>
                  </div>
                  <Icon className="h-5 w-5 shrink-0 text-slate-400" />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-base">Operational telemetry coverage</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-4 dark:bg-slate-800/60">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Host resource and service-probe telemetry is not exposed to this tenant view.</p>
              <p className="mt-1 text-xs text-slate-500">CPU, memory, disk, uptime, connection counts, and per-service latency are shown as unavailable rather than estimated. Configure tenant-safe instrumentation before reporting those values.</p>
            </div>
          </div>
          {execution ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3"><p className="text-xs text-slate-500">Completed runs</p><p className="mt-1 text-lg font-semibold">{execution.completedRuns24h.toLocaleString()}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-slate-500">Failed or cancelled runs</p><p className="mt-1 text-lg font-semibold">{execution.failedRuns24h.toLocaleString()}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-slate-500">Agent-run completion rate</p><p className="mt-1 text-lg font-semibold">{percentageLabel(execution.agentRunSuccessRate)}</p></div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No tenant-scoped telemetry could be loaded.</p>
          )}
          {stats && <p className="text-[11px] text-slate-400">Read from persisted usage and execution records. Snapshot time: {new Date(stats.generatedAt).toLocaleString()}.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
