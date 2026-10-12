'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Map, ListChecks, Play, Settings2, CheckCircle2, Clock, Zap, Target } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'

interface EngineRecord {
  id: string; action: string; status: 'completed' | 'failed' | 'pending' | 'running'
  duration: number; score: number; timestamp: string
}

interface EngineStats { total: number; completed: number; failed: number; avgDuration: number; avgScore: number }

const ENGINE_TYPE = 'planning'
const ACTIONS = ['create_plan', 'execute_plan', 'adjust_plan', 'evaluate_plan']
const STATUS_OPTIONS = ['all', 'completed', 'failed', 'pending', 'running']

const statusBadge: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400',
  running: 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
}

const actionIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  create_plan: ListChecks, execute_plan: Play, adjust_plan: Settings2, evaluate_plan: CheckCircle2,
}

const actionLabels: Record<string, string> = {
  create_plan: 'Create Plan', execute_plan: 'Execute Plan', adjust_plan: 'Adjust Plan', evaluate_plan: 'Evaluate Plan',
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

export default function PlanningEngine() {
  const [records, setRecords] = useState<EngineRecord[]>([])
  const [stats, setStats] = useState<EngineStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')

  useEffect(() => {
    const controller = new AbortController()
    async function fetchData() {
      setLoading(true); setError('')
      try {
        const params = new URLSearchParams({ engineType: ENGINE_TYPE, limit: '100', status: statusFilter, action: actionFilter })
        const data = await fetchApi(`/api/enterprise/engines?${params}`, { signal: controller.signal })
        setRecords(data.records); setStats(data.stats)
      } catch (e) { if (e instanceof Error && e.name !== 'AbortError') setError(e.message) }
      finally { setLoading(false) }
    }
    fetchData()
    return () => controller.abort()
  }, [statusFilter, actionFilter])

  const chartData = useMemo(() => {
    const buckets: Record<string, { completed: number; failed: number }> = {}
    const now = Date.now()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000)
      const key = d.toLocaleDateString('en-US', { weekday: 'short' })
      buckets[key] = { completed: 0, failed: 0 }
    }
    records.forEach(r => {
      const key = new Date(r.timestamp).toLocaleDateString('en-US', { weekday: 'short' })
      if (key in buckets) {
        if (r.status === 'completed') buckets[key].completed++
        else if (r.status === 'failed') buckets[key].failed++
      }
    })
    return buckets
  }, [records])

  const maxChart = Math.max(...Object.values(chartData).map(v => v.completed + v.failed), 1)
  const executionRate = stats ? ((stats.completed / Math.max(stats.total, 1)) * 100).toFixed(1) : '0'
  const successRate = stats && stats.total > 0 ? (((stats.total - stats.failed) / stats.total) * 100).toFixed(1) : '0'

  if (loading && records.length === 0) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    )
  }

  if (error) {
    return (<div className="space-y-6 p-6"><h2 className="text-xl font-semibold text-slate-900 dark:text-white">Planning Engine</h2><Card className="rounded-xl shadow-sm"><CardContent className="p-6 text-center text-red-500">Failed to load: {error}</CardContent></Card></div>)
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/30">
          <Map className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Planning Engine</h2>
          <p className="text-sm text-slate-500">Strategic plan creation, execution, and adaptive adjustment</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-xl shadow-sm hover:shadow-md transition-shadow"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-slate-500">Total Plans</p><p className="text-2xl font-bold text-slate-900 dark:text-white">{stats?.total.toLocaleString() ?? '—'}</p></div><ListChecks className="h-5 w-5 text-blue-500" /></div></CardContent></Card>
        <Card className="rounded-xl shadow-sm hover:shadow-md transition-shadow"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-slate-500">Execution Rate</p><p className="text-2xl font-bold text-blue-600">{executionRate}%</p></div><Zap className="h-5 w-5 text-blue-500" /></div></CardContent></Card>
        <Card className="rounded-xl shadow-sm hover:shadow-md transition-shadow"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-slate-500">Success Rate</p><p className="text-2xl font-bold text-emerald-600">{successRate}%</p></div><Target className="h-5 w-5 text-emerald-500" /></div></CardContent></Card>
        <Card className="rounded-xl shadow-sm hover:shadow-md transition-shadow"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-slate-500">Avg Duration</p><p className="text-2xl font-bold text-slate-900 dark:text-white">{stats?.avgDuration.toLocaleString() ?? '—'}ms</p></div><Clock className="h-5 w-5 text-slate-400" /></div></CardContent></Card>
      </div>

      <Tabs defaultValue="records" className="space-y-4">
        <TabsList><TabsTrigger value="records">Records</TabsTrigger><TabsTrigger value="performance">Performance</TabsTrigger></TabsList>

        <TabsContent value="records">
          <Card className="rounded-xl shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Recent Operations</CardTitle>
                <div className="flex flex-wrap gap-2">
                  <select className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                  <select className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800" value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
                    <option value="all">All Actions</option>
                    {ACTIONS.map(a => <option key={a} value={a}>{actionLabels[a] || a}</option>)}
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-96">
                <Table>
                  <TableHeader><TableRow><TableHead className="pl-4">ID</TableHead><TableHead>Action</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Duration</TableHead><TableHead className="text-right">Score</TableHead><TableHead className="pr-4 text-right">Time</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {records.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-slate-400">No records found</TableCell></TableRow>}
                    {records.slice(0, 50).map(r => {
                      const Icon = actionIcons[r.action] || ListChecks
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="pl-4 font-mono text-xs text-slate-500">{r.id.slice(0, 16)}</TableCell>
                          <TableCell><div className="flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-slate-400" /><span className="text-sm">{actionLabels[r.action] || r.action}</span></div></TableCell>
                          <TableCell><Badge variant="secondary" className={statusBadge[r.status]}>{r.status}</Badge></TableCell>
                          <TableCell className="text-right text-sm text-slate-600 dark:text-slate-300">{r.duration > 0 ? `${r.duration.toLocaleString()}ms` : '—'}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{r.score}</TableCell>
                          <TableCell className="pr-4 text-right text-xs text-slate-400">{formatTime(r.timestamp)}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance">
          <Card className="rounded-xl shadow-sm">
            <CardHeader><CardTitle className="text-base">Activity (Last 7 Days)</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-end gap-3 h-48">
                {Object.entries(chartData).map(([day, data]) => (
                  <div key={day} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{data.completed + data.failed}</span>
                    <div className="flex w-full flex-col gap-0.5" style={{ height: `${Math.max(((data.completed + data.failed) / maxChart) * 160, 4)}px` }}>
                      <div className="flex-1 rounded-t-md bg-blue-500" />
                      <div className="rounded-b-sm bg-red-400" style={{ height: data.failed > 0 ? `${Math.max((data.failed / Math.max(data.completed + data.failed, 1)) * 100, 8)}%` : '0px' }} />
                    </div>
                    <span className="text-xs text-slate-400">{day}</span>
                  </div>
                ))}
              </div>
              {stats && (
                <div className="mt-6 space-y-3">
                  <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Execution Success</span><span className="font-medium">{executionRate}%</span></div>
                  <Progress value={Number(executionRate)} className="h-2" />
                  <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Failure Rate</span><span className="font-medium text-red-500">{((stats.failed / Math.max(stats.total, 1)) * 100).toFixed(1)}%</span></div>
                  <Progress value={(stats.failed / Math.max(stats.total, 1)) * 100} className="h-2" />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
