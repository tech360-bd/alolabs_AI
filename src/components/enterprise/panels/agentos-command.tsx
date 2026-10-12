'use client'

/**
 * ALO Labs AgentOS — Command Center ("ONE COMMAND")
 *
 * The flagship product experience: give ALO Labs a high-level objective.
 * The Master Orchestrator plans, decomposes, routes, executes, QC-gates,
 * repairs, and delivers — shown live via the run event stream (SSE).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Zap, Loader2, CheckCircle2, XCircle, Clock, FileText, ArrowRight,
  Sparkles, Search, GraduationCap, Megaphone, BarChart3, Globe,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
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

const EXAMPLES: Array<{ icon: React.ComponentType<{ className?: string }>; text: string }> = [
  { icon: GraduationCap, text: 'Research the best UK universities for an HSC student, compare courses and scholarships, and prepare a counselor report.' },
  { icon: Megaphone, text: 'Create a complete marketing campaign for ALO Education\'s UK intake.' },
  { icon: BarChart3, text: 'Analyze this dataset and create an executive report with charts.' },
  { icon: Globe, text: 'Build a landing page for an ALO Education UK campaign.' },
  { icon: Search, text: 'Research the market for AI-powered education CRM software in the UK.' },
]

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
  return (
    <Badge className={STATUS_STYLE[status] ?? STATUS_STYLE.queued}>
      {status.replace(/_/g, ' ')}
    </Badge>
  )
}

export default function AgentOSCommandPanel() {
  const [objective, setObjective] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const loadRuns = useCallback(async () => {
    try {
      const json = await fetchApi<{ data: RunSummary[] }>('/api/runs?limit=20')
      setRuns(json.data ?? [])
    } catch {
      // non-fatal
    }
  }, [])

  useEffect(() => {
    void loadRuns()
    const timer = setInterval(loadRuns, 15000)
    return () => clearInterval(timer)
  }, [loadRuns])

  const submit = useCallback(async () => {
    const text = objective.trim()
    if (!text || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const json = await fetchApi<{ data: { runId: string; status: string; eventsUrl: string } }>(
        '/api/runs',
        { method: 'POST', body: JSON.stringify({ objective: text }) },
      )
      setActiveRunId(json.data.runId)
      setObjective('')
      void loadRuns()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start run')
    } finally {
      setSubmitting(false)
      textareaRef.current?.focus()
    }
  }, [objective, submitting, loadRuns])

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      {/* ─── Command bar ─── */}
      <Card className="border-[#003ABC]/20 shadow-sm">
        <CardContent className="p-4 md:p-6">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#003ABC]" />
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              What do you want ALO Labs to accomplish?
            </h1>
          </div>
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit()
              }}
              placeholder="Research the best UK universities for this student, compare courses, verify entry requirements, find scholarships, and prepare a counselor report…"
              rows={3}
              className="w-full resize-none rounded-xl border border-slate-200 bg-white p-4 pr-32 text-sm text-slate-900 shadow-sm outline-none focus:border-[#003ABC] focus:ring-2 focus:ring-[#003ABC]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <Button
              onClick={() => void submit()}
              disabled={submitting || !objective.trim()}
              className="absolute bottom-3 right-3 bg-[#003ABC] text-white hover:bg-[#002a8f]"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              <span className="ml-1">Run with ALO</span>
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((example, i) => {
              const Icon = example.icon
              return (
                <button
                  key={i}
                  onClick={() => setObjective(example.text)}
                  className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-[#003ABC]/40 hover:text-[#003ABC] dark:border-slate-700 dark:text-slate-400"
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="max-w-[260px] truncate">{example.text}</span>
                </button>
              )
            })}
          </div>
          {error && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </CardContent>
      </Card>

      {/* ─── Live run view ─── */}
      {activeRunId && (
        <RunView
          runId={activeRunId}
          onClose={() => setActiveRunId(null)}
          onFinished={() => void loadRuns()}
        />
      )}

      {/* ─── Recent runs ─── */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recent runs</h2>
            <Badge variant="secondary">{runs.length}</Badge>
          </div>
          <ScrollArea className="max-h-[340px]">
            {runs.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No runs yet. Give ALO Labs an objective above.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {runs.map((run) => (
                  <button
                    key={run.id}
                    onClick={() => setActiveRunId(run.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <StatusIcon status={run.status} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {run.objective}
                      </p>
                      <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                        <Clock className="h-3 w-3" />
                        {new Date(run.createdAt).toLocaleString()}
                        {run.summary && <span className="truncate">· {run.summary}</span>}
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

function StatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
  if (status === 'failed') return <XCircle className="h-4 w-4 shrink-0 text-red-500" />
  if (status === 'running' || status === 'planning') return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
  if (status === 'waiting_approval') return <FileText className="h-4 w-4 shrink-0 text-amber-500" />
  return <Clock className="h-4 w-4 shrink-0 text-slate-400" />
}
