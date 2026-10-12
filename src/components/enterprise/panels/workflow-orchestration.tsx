'use client'

import React, { useState, useEffect } from 'react'
import { GitBranch, Activity, CheckCircle2, XCircle, PauseCircle, PlayCircle, Clock, TrendingUp } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'

interface WorkflowStep { id: string; name: string; status: 'completed' | 'running' | 'pending' | 'failed' }
interface Workflow {
  id: string; name: string; type: string; status: 'active' | 'completed' | 'failed' | 'paused' | 'draft'
  steps: WorkflowStep[]; successRate: number; avgDuration: number; runsCount: number; createdAt: string
}
interface WorkflowStats { total: number; active: number; completed: number; successRate: number; avgDuration: number }

const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  completed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400',
  paused: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400',
  draft: 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
}
const stepStatusColors: Record<string, string> = {
  completed: 'bg-emerald-500', running: 'bg-blue-500 animate-pulse', pending: 'bg-slate-300 dark:bg-slate-600', failed: 'bg-red-500',
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function WorkflowOrchestration() {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [stats, setStats] = useState<WorkflowStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    async function load() {
      setLoading(true); setError('')
      try {
        const params = new URLSearchParams({ status: statusFilter })
        const data = await fetchApi(`/api/enterprise/workflows?${params}`, { signal: ctrl.signal })
        setWorkflows(data.workflows); setStats(data.stats)
      } catch (e) { if (e instanceof Error && e.name !== 'AbortError') setError(e.message) }
      finally { setLoading(false) }
    }
    load(); return () => ctrl.abort()
  }, [statusFilter])

  if (loading && workflows.length === 0) return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
      </div>
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  )

  if (error) return (
    <div className="space-y-6 p-6">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Workflow Orchestration</h2>
      <Card className="rounded-xl shadow-sm"><CardContent className="p-6 text-center text-red-500">Failed to load: {error}</CardContent></Card>
    </div>
  )

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#003ABC]/10">
          <GitBranch className="h-5 w-5 text-[#003ABC]" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Workflow Orchestration</h2>
          <p className="text-sm text-slate-500">Automated workflow execution, monitoring, and management</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Workflows', value: stats?.total.toLocaleString() ?? '—', icon: GitBranch, color: 'text-[#003ABC]' },
          { label: 'Active', value: stats?.active.toLocaleString() ?? '—', icon: PlayCircle, color: 'text-emerald-600' },
          { label: 'Success Rate', value: stats ? `${stats.successRate}%` : '—', icon: TrendingUp, color: 'text-[#FF6A00]' },
          { label: 'Avg Duration', value: stats ? `${stats.avgDuration}s` : '—', icon: Clock, color: 'text-slate-600' },
        ].map((s, i) => (
          <Card key={i} className="rounded-xl shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-slate-500">{s.label}</p><p className={`text-2xl font-bold ${s.color}`}>{s.value}</p></div>
                <s.icon className="h-5 w-5 text-slate-400" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">All Workflows</CardTitle>
            <select className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              {['active', 'completed', 'failed', 'paused', 'draft'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Steps</TableHead>
                  <TableHead className="text-right">Success Rate</TableHead>
                  <TableHead className="pr-4 text-right">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workflows.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-slate-400">No workflows found</TableCell></TableRow>}
                {workflows.map(wf => (
                  <React.Fragment key={wf.id}>
                    <TableRow className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => setExpanded(expanded === wf.id ? null : wf.id)}>
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-2">
                          <GitBranch className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-sm font-medium">{wf.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-500 capitalize">{wf.type.replace(/_/g, ' ')}</TableCell>
                      <TableCell><Badge variant="secondary" className={statusColors[wf.status]}>{wf.status}</Badge></TableCell>
                      <TableCell className="text-right text-sm">{wf.steps.length}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{wf.successRate}%</TableCell>
                      <TableCell className="pr-4 text-right text-xs text-slate-400">{fmt(wf.createdAt)}</TableCell>
                    </TableRow>
                    {expanded === wf.id && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-slate-50 dark:bg-slate-800/30 px-6 py-3">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-medium text-slate-500">Pipeline ({wf.steps.length} steps)</span>
                            <span className="text-xs text-slate-400">Runs: {wf.runsCount} • Avg: {wf.avgDuration}s</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {wf.steps.map((step, idx) => (
                              <React.Fragment key={step.id}>
                                <div className="flex flex-col items-center gap-1">
                                  <div className={`h-3 w-3 rounded-full ${stepStatusColors[step.status]}`} title={`${step.name}: ${step.status}`} />
                                  <span className="text-[10px] text-slate-400 max-w-[60px] truncate">{step.name.split(': ')[1] || step.name}</span>
                                </div>
                                {idx < wf.steps.length - 1 && <div className="h-0.5 w-6 bg-slate-200 dark:bg-slate-700" />}
                              </React.Fragment>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
