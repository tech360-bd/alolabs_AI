'use client'

/**
 * ALO Labs AgentOS — Live Run View
 *
 * Shows one orchestrator run end-to-end: objective, plan, tasks (agent,
 * model, tokens, QC), live event stream (SSE over fetch), artifacts, and
 * pending approvals. Every element is fed by real API data.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Loader2, CheckCircle2, XCircle, Clock, X, Download, FileText,
  Bot, Cpu, Wrench, ShieldCheck, AlertTriangle, ChevronDown, ChevronRight,
  RefreshCw, Ban,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { fetchApi, fetchApiRaw, AUTH_TOKEN_KEY } from '@/lib/api'

interface RunTask {
  id: string
  title: string
  status: string
  agentName?: string
  model?: string
  tokens?: number
  output?: string | null
  error?: string | null
  qcScore?: number
  qcPassed?: boolean
}

interface RunArtifact {
  id: string
  name: string
  type: string
  size: number
  version: number
  checksum: string
  mimeType: string
}

interface RunApproval {
  id: string
  title: string
  status: string
  riskLevel: string
  createdAt: string
}

interface RunEvent {
  id?: number | string
  type: string
  source?: string
  taskId?: string
  data?: Record<string, unknown> | string
  createdAt?: string
}

interface PlanStep {
  id: string
  title: string
  description: string
  agentHint?: string
  status?: string
}

interface RunDetail {
  run: {
    id: string
    objective: string
    status: string
    plan: string
    summary: string | null
    error: string | null
    createdAt: string
    startedAt: string | null
    completedAt: string | null
  }
  events: RunEvent[]
  tasks: RunTask[]
  artifacts: RunArtifact[]
  approvals: RunApproval[]
}

const TERMINAL = ['completed', 'failed', 'cancelled']

const STATUS_STYLE: Record<string, string> = {
  queued: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  planning: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  waiting_approval: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  blocked: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  skipped: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  cancelled: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  pending: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

function StatusBadge({ status }: { status: string }) {
  return <Badge className={STATUS_STYLE[status] ?? STATUS_STYLE.pending}>{status.replace(/_/g, ' ')}</Badge>
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return '—'
  const start = new Date(startedAt).getTime()
  const end = completedAt ? new Date(completedAt).getTime() : Date.now()
  const ms = Math.max(0, end - start)
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

function eventLabel(event: RunEvent): string {
  let data: Record<string, unknown> = {}
  try {
    data = typeof event.data === 'string'
      ? JSON.parse(event.data) as Record<string, unknown>
      : event.data ?? {}
  } catch { /* malformed metadata is displayed via event type */ }
  switch (event.type) {
    case 'run.queued': return 'Run queued'
    case 'run.started': return `Execution started (${data.stepCount ?? '?'} steps)`
    case 'plan.created': return `Plan created (${data.strategy ?? 'unknown'} strategy, ${data.stepCount ?? '?'} steps)`
    case 'agent.selected': return `Agent selected: ${data.agentName ?? data.agentId ?? '—'} (score ${(typeof data.score === 'number' ? data.score : 0).toFixed(2)})`
    case 'model.selected': return `Model: ${data.model ?? '—'} (${data.tokens ?? 0} tokens)`
    case 'task.queued': return `Task queued: ${data.title ?? ''}`
    case 'task.started': return `Task started: ${data.title ?? ''}`
    case 'task.completed': return `Task completed: ${data.title ?? ''}${data.repairAttempts ? ` (after ${data.repairAttempts} repair(s))` : ''}`
    case 'task.failed': return `Task failed: ${data.title ?? ''}${data.configurationRequired ? ' — Configuration required' : ''}`
    case 'task.skipped': return `Task skipped: ${data.title ?? ''}`
    case 'qc.passed': return `QC PASS (${Math.round((typeof data.score === 'number' ? data.score : 0) * 100)}%)`
    case 'qc.failed': return `QC FAIL (${Math.round((typeof data.score === 'number' ? data.score : 0) * 100)}%) — repairing`
    case 'repair.started': return `Repair attempt ${data.attempt ?? ''}`
    case 'approval.requested': return 'Human approval requested'
    case 'artifact.created': return `Artifact created: ${data.name ?? ''}`
    case 'run.completed': return 'Run completed'
    case 'run.failed': return 'Run failed'
    case 'run.cancelled': return 'Run cancelled'
    default: return event.type
  }
}

function eventTone(type: string): string {
  if (type === 'run.failed' || type === 'task.failed' || type === 'qc.failed') return 'text-red-600 dark:text-red-400'
  if (type === 'task.completed' || type === 'qc.passed' || type === 'run.completed' || type === 'artifact.created') return 'text-emerald-600 dark:text-emerald-400'
  if (type === 'approval.requested' || type === 'repair.started') return 'text-amber-600 dark:text-amber-400'
  if (type === 'agent.selected' || type === 'model.selected') return 'text-[#003ABC]'
  return 'text-slate-600 dark:text-slate-400'
}

/** Minimal SSE-over-fetch reader (EventSource cannot send auth headers). */
async function streamRunEvents(
  runId: string,
  token: string | null,
  onEvent: (event: RunEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(`/api/runs/${runId}/events`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
  })
  if (!res.ok || !res.body) return
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const dataLine = raw.split('\n').find((l) => l.startsWith('data: '))
      if (!dataLine) continue
      try {
        onEvent(JSON.parse(dataLine.slice(6)) as RunEvent)
      } catch { /* ignore malformed */ }
    }
  }
}

export function RunView({
  runId,
  onClose,
  onFinished,
}: {
  runId: string
  onClose?: () => void
  onFinished?: () => void
}) {
  const [detail, setDetail] = useState<RunDetail | null>(null)
  const [liveEvents, setLiveEvents] = useState<RunEvent[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [expandedTask, setExpandedTask] = useState<string | null>(null)
  const [acting, setActing] = useState(false)
  const finishedNotified = useRef(false)
  const streamRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    try {
      const json = await fetchApi<{ data: RunDetail }>(`/api/runs/${runId}`)
      setDetail(json.data)
      setLoadError(null)
      if (json.data.run.status && TERMINAL.includes(json.data.run.status) && !finishedNotified.current) {
        finishedNotified.current = true
        onFinished?.()
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load run')
    }
  }, [runId, onFinished])

  // Initial load + polling fallback
  useEffect(() => {
    void load()
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [load])

  // Live SSE stream
  useEffect(() => {
    if (!detail || TERMINAL.includes(detail.run.status)) return
    const controller = new AbortController()
    streamRef.current = controller
    const token = typeof window !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null
    void streamRunEvents(runId, token, (event) => {
      // SSE replays persisted history on connect; detail already contains
      // those records, so only append events not already visible.
      if (!detail.events.some((old) => old.type === event.type && old.createdAt === event.createdAt && old.taskId === event.taskId)) {
        setLiveEvents((prev) => prev.some((old) => old.type === event.type && old.createdAt === event.createdAt && old.taskId === event.taskId)
          ? prev : [...prev, event])
      }
      if (event.type === 'stream.closed') {
        void load()
      }
    }, controller.signal).catch(() => { /* stream errors are non-fatal; polling continues */ })
    return () => controller.abort()
  }, [detail?.run.status, runId, load])

  const actOnApproval = useCallback(async (approvalId: string, action: 'approve' | 'reject') => {
    setActing(true)
    try {
      const response = await fetchApi<{ data?: { continuationRequired?: boolean; message?: string } }>(`/api/v1/approvals/${approvalId}`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      })
      await load()
      if (response.data?.continuationRequired) {
        setLoadError(response.data.message ?? 'Approval recorded; manual continuation required.')
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Approval action failed')
    } finally {
      setActing(false)
    }
  }, [load])

  const downloadArtifact = useCallback(async (artifact: RunArtifact) => {
    try {
      // Private artifacts require the same Bearer session as the rest of
      // AgentOS. A plain <a href> cannot send that header.
      const response = await fetchApiRaw(`/api/artifacts/${artifact.id}/download`)
      if (!response.ok) throw new Error(`Download failed (${response.status})`)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = artifact.name
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Download failed')
    }
  }, [])

  const cancel = useCallback(async () => {
    setActing(true)
    try {
      await fetchApi(`/api/runs/${runId}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Cancel failed')
    } finally {
      setActing(false)
    }
  }, [runId, load])

  if (!detail) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading run…
          {loadError && <span className="text-red-500">{loadError}</span>}
        </CardContent>
      </Card>
    )
  }

  const { run, tasks, artifacts, approvals } = detail
  const isTerminal = TERMINAL.includes(run.status)
  const planSteps: PlanStep[] = (() => {
    try {
      const parsed = JSON.parse(run.plan || '{}')
      return Array.isArray(parsed.steps) ? parsed.steps : []
    } catch {
      return []
    }
  })()
  const allEvents = [...(detail.events ?? []), ...liveEvents]

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {!isTerminal && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
              {run.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              {run.status === 'failed' && <XCircle className="h-4 w-4 text-red-500" />}
              <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {run.objective}
              </h2>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>Run {run.id.slice(0, 8)}</span>
              <span>·</span>
              <span>{formatDuration(run.startedAt, run.completedAt)}</span>
              <span>·</span>
              <span>{new Date(run.createdAt).toLocaleString()}</span>
            </p>
            {run.summary && <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{run.summary}</p>}
            {run.error && (
              <p className="mt-2 flex items-start gap-1.5 text-sm text-red-600 dark:text-red-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {run.error}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={run.status} />
            {!isTerminal && (
              <Button variant="outline" size="sm" onClick={() => void cancel()} disabled={acting}>
                <Ban className="h-3.5 w-3.5" /> Cancel
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            {onClose && (
              <Button variant="outline" size="sm" onClick={onClose}>
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {loadError && (
          <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
            {loadError}
          </p>
        )}
        <div className="grid gap-0 lg:grid-cols-2">
          {/* Left: plan + tasks */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {/* Plan */}
            <div className="p-4">
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <SparklesIcon /> Plan
              </h3>
              {planSteps.length === 0 ? (
                <p className="text-sm text-slate-500">No plan recorded yet.</p>
              ) : (
                <ol className="space-y-2">
                  {planSteps.map((step, i) => {
                    const task = tasks.find((t) => t.title === step.title)
                    return (
                      <li key={step.id} className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900 dark:text-slate-100">{step.title}</p>
                          <p className="text-xs text-slate-500">{step.description}</p>
                        </div>
                        {task && <StatusBadge status={task.status} />}
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>

            {/* Tasks */}
            <div className="p-4">
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <Wrench className="h-3.5 w-3.5" /> Tasks
              </h3>
              {tasks.length === 0 ? (
                <p className="text-sm text-slate-500">No tasks yet.</p>
              ) : (
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <div key={task.id} className="rounded-lg border border-slate-200 dark:border-slate-700">
                      <button
                        onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                        className="flex w-full items-center gap-2 p-2.5 text-left"
                      >
                        {expandedTask === task.id ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{task.title}</p>
                          <p className="flex items-center gap-2 text-xs text-slate-500">
                            {task.agentName && <span className="flex items-center gap-1"><Bot className="h-3 w-3" />{task.agentName}</span>}
                            {task.model && <span className="flex items-center gap-1"><Cpu className="h-3 w-3" />{task.model}</span>}
                            {task.tokens !== undefined && <span>{task.tokens} tokens</span>}
                          </p>
                        </div>
                        {task.qcPassed !== undefined && (
                          <Badge className={task.qcPassed ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}>
                            <ShieldCheck className="h-3 w-3" /> QC {task.qcPassed ? 'PASS' : 'FAIL'}
                          </Badge>
                        )}
                        <StatusBadge status={task.status} />
                      </button>
                      {expandedTask === task.id && (
                        <div className="border-t border-slate-200 p-3 text-xs dark:border-slate-700">
                          {task.error ? (
                            <p className="text-red-600 dark:text-red-400">{task.error}</p>
                          ) : task.output ? (
                            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-2 font-mono text-[11px] text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                              {task.output}
                            </pre>
                          ) : (
                            <p className="text-slate-500">No output yet.</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Artifacts */}
            <div className="p-4">
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <FileText className="h-3.5 w-3.5" /> Artifacts
              </h3>
              {artifacts.length === 0 ? (
                <p className="text-sm text-slate-500">No artifacts yet.</p>
              ) : (
                <div className="space-y-2">
                  {artifacts.map((artifact) => (
                    <button
                      key={artifact.id}
                      type="button"
                      onClick={() => void downloadArtifact(artifact)}
                      aria-label={`Download ${artifact.name}`}
                      className="flex w-full items-center gap-2 rounded-lg border border-slate-200 p-2.5 text-left text-sm transition-colors hover:border-[#003ABC]/40 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-[#003ABC]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-900 dark:text-slate-100">{artifact.name}</p>
                        <p className="text-xs text-slate-500">{artifact.type} · v{artifact.version} · {(artifact.size / 1024).toFixed(1)} KB · sha256:{artifact.checksum.slice(0, 8)}</p>
                      </div>
                      <Download className="h-4 w-4 shrink-0 text-slate-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Approvals */}
            {approvals.length > 0 && (
              <div className="p-4">
                <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <AlertTriangle className="h-3.5 w-3.5" /> Approvals required
                </h3>
                <div className="space-y-2">
                  {approvals.map((approval) => (
                    <div key={approval.id} className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-800/50 dark:bg-amber-900/10">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{approval.title}</p>
                      <p className="mt-1 text-xs text-slate-500">Risk: {approval.riskLevel} · {new Date(approval.createdAt).toLocaleString()}</p>
                      {approval.status === 'pending' && (
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" onClick={() => void actOnApproval(approval.id, 'approve')} disabled={acting}>
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => void actOnApproval(approval.id, 'reject')} disabled={acting}>
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: live event stream */}
          <div className="border-t border-slate-100 dark:border-slate-800 lg:border-l lg:border-t-0">
            <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-800">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <Clock className="h-3.5 w-3.5" /> Live events
              </h3>
              {!isTerminal && <span className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" /> streaming</span>}
            </div>
            <ScrollArea className="h-[560px]">
              <div className="space-y-1 p-4">
                {allEvents.length === 0 ? (
                  <p className="text-sm text-slate-500">Waiting for events…</p>
                ) : (
                  allEvents.map((event, i) => (
                    <div key={`${event.type}-${i}`} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <span className="mt-0.5 shrink-0 font-mono text-slate-400">
                        {event.createdAt ? new Date(event.createdAt).toLocaleTimeString() : ''}
                      </span>
                      <span className={`min-w-0 flex-1 ${eventTone(event.type)}`}>{eventLabel(event)}</span>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function SparklesIcon() {
  return <span className="text-[#003ABC]">✦</span>
}
