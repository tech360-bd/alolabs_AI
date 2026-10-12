'use client'

/**
 * ALO Labs AgentOS — Runs panel
 *
 * Lists every orchestrator run for the tenant with live status, and opens
 * the Live Run View for the selected run.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { Loader2, CheckCircle2, XCircle, Clock, ArrowRight, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { fetchApi } from '@/lib/api'
import { RunView } from './run-view'

interface RunSummary {
  id: string
  objective: string
  status: string
  summary: string | null
  error: string | null
  createdAt: string
  completedAt: string | null
}

const STATUS_STYLE: Record<string, string> = {
  queued: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  planning: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  waiting_approval: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  cancelled: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
}

function StatusBadge({ status }: { status: string }) {
  return <Badge className={STATUS_STYLE[status] ?? STATUS_STYLE.queued}>{status.replace(/_/g, ' ')}</Badge>
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
  if (status === 'failed') return <XCircle className="h-4 w-4 shrink-0 text-red-500" />
  if (status === 'running' || status === 'planning') return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
  if (status === 'waiting_approval') return <FileText className="h-4 w-4 shrink-0 text-amber-500" />
  return <Clock className="h-4 w-4 shrink-0 text-slate-400" />
}

const FILTERS = ['all', 'running', 'planning', 'queued', 'waiting_approval', 'completed', 'failed', 'cancelled']

export default function AgentOSRunsPanel() {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const q = filter === 'all' ? '' : `?status=${filter}`
      const json = await fetchApi<{ data: RunSummary[] }>(`/api/runs?limit=100${q}`)
      setRuns(json.data ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load runs')
    }
  }, [filter])

  useEffect(() => {
    void load()
    const timer = setInterval(load, 10000)
    return () => clearInterval(timer)
  }, [load])

  if (selected) {
    return (
      <div className="flex h-full flex-col gap-3 p-4 md:p-6">
        <div>
          <button
            onClick={() => setSelected(null)}
            className="text-sm text-[#003ABC] hover:underline"
          >
            ← Back to runs
          </button>
        </div>
        <RunView runId={selected} onFinished={() => void load()} />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Runs</h1>
          <p className="text-sm text-slate-500">Every objective executed by the Master Orchestrator.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-[#003ABC] text-white'
                  : 'border border-slate-200 text-slate-600 hover:border-[#003ABC]/40 hover:text-[#003ABC] dark:border-slate-700 dark:text-slate-400'
              }`}
            >
              {f.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[calc(100vh-220px)]">
            {error && <p className="p-4 text-sm text-red-600">{error}</p>}
            {!error && runs.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No runs found.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {runs.map((run) => (
                  <button
                    key={run.id}
                    onClick={() => setSelected(run.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <StatusIcon status={run.status} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{run.objective}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                        <span>{run.id.slice(0, 8)}</span>
                        <span>·</span>
                        <span>{new Date(run.createdAt).toLocaleString()}</span>
                        {run.summary && <><span>·</span><span className="truncate">{run.summary}</span></>}
                        {run.error && <><span>·</span><span className="truncate text-red-500">{run.error}</span></>}
                      </p>
                    </div>
                    <StatusBadge status={run.status} />
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
