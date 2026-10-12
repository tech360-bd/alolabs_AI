'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Users, MessageSquare, Bot, Clock, CheckCircle2, XCircle, PauseCircle, PlayCircle, Loader2 } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'

interface CollabMessage { role: 'agent' | 'system' | 'user'; content: string; timestamp: string }
interface CollabSession {
  id: string; title: string; type: 'task' | 'brainstorm' | 'review' | 'planning' | 'problem_solving' | 'creative'
  status: 'active' | 'completed' | 'failed' | 'paused'
  agentCount: number; agents: string[]; createdAt: string; updatedAt: string
  taskInput: string; taskOutput: string
  metrics: { messages: number; duration: number; quality: number }
  messages: CollabMessage[]
}
interface CollabStats { total: number; active: number; completed: number; avgAgentsPerSession: number }

const typeLabels: Record<string, string> = {
  task: 'Task', brainstorm: 'Brainstorm', review: 'Review',
  planning: 'Planning', problem_solving: 'Problem Solving', creative: 'Creative',
}
const typeColors: Record<string, string> = {
  task: 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
  brainstorm: 'bg-violet-100 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400',
  review: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  planning: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  problem_solving: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400',
  creative: 'bg-pink-100 text-pink-700 dark:bg-pink-950/30 dark:text-pink-400',
}
const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  completed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400',
  paused: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400',
}
const statusIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  active: PlayCircle, completed: CheckCircle2, failed: XCircle, paused: PauseCircle,
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtDur(sec: number) {
  if (sec < 60) return `${sec}s`
  return `${Math.floor(sec / 60)}m ${sec % 60}s`
}

export default function CollaborationPanel() {
  const [sessions, setSessions] = useState<CollabSession[]>([])
  const [stats, setStats] = useState<CollabStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [selected, setSelected] = useState<CollabSession | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ status: statusFilter, type: typeFilter })
      const data = await fetchApi(`/api/enterprise/collaborations?${params}`)
      setSessions(data.sessions); setStats(data.stats)
    } catch (e) { if (e instanceof Error) setError(e.message) }
    finally { setLoading(false) }
  }, [statusFilter, typeFilter])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (selected && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [selected])

  if (loading && sessions.length === 0) return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
      </div>
    </div>
  )

  if (error) return (
    <div className="space-y-6 p-6">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Multi-Agent Collaboration</h2>
      <Card className="rounded-xl shadow-sm"><CardContent className="p-6 text-center text-red-500">Failed to load: {error}</CardContent></Card>
    </div>
  )

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FF6A00]/10">
          <Users className="h-5 w-5 text-[#FF6A00]" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Multi-Agent Collaboration</h2>
          <p className="text-sm text-slate-500">Agent collaboration sessions, brainstorming, and joint problem solving</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Sessions', value: stats?.total.toLocaleString() ?? '—', icon: Users, color: 'text-[#003ABC]' },
          { label: 'Active', value: stats?.active.toLocaleString() ?? '—', icon: PlayCircle, color: 'text-emerald-600' },
          { label: 'Completed', value: stats?.completed.toLocaleString() ?? '—', icon: CheckCircle2, color: 'text-slate-600' },
          { label: 'Avg Agents/Session', value: stats?.avgAgentsPerSession.toFixed(1) ?? '—', icon: Bot, color: 'text-[#FF6A00]' },
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

      <div className="flex flex-wrap gap-2">
        <select className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          {['active', 'completed', 'failed', 'paused'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        <select className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="all">All Types</option>
          {Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sessions.length === 0 && <p className="col-span-full py-8 text-center text-slate-400">No sessions found</p>}
        {sessions.map(session => {
          const StatusIcon = statusIcons[session.status] || CheckCircle2
          return (
            <Card key={session.id} className="rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelected(session)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">{session.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{session.id}</p>
                  </div>
                  <StatusIcon className={`h-4 w-4 shrink-0 ml-2 ${session.status === 'active' ? 'text-emerald-500' : session.status === 'failed' ? 'text-red-500' : 'text-slate-400'}`} />
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <Badge variant="secondary" className={typeColors[session.type]}>{typeLabels[session.type]}</Badge>
                  <Badge variant="secondary" className={statusColors[session.status]}>{session.status}</Badge>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-1"><Bot className="h-3 w-3" />{session.agentCount} agents</div>
                  <div className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmt(session.createdAt)}</div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">{selected.title}</DialogTitle>
                <DialogDescription>Session {selected.id} — {typeLabels[selected.type]}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap gap-2 mb-2">
                <Badge variant="secondary" className={statusColors[selected.status]}>{selected.status}</Badge>
                <Badge variant="secondary">{selected.agentCount} agents</Badge>
                <Badge variant="secondary">{selected.metrics.messages} messages</Badge>
                <Badge variant="secondary">Quality: {selected.metrics.quality}/100</Badge>
                <Badge variant="secondary">Duration: {fmtDur(selected.metrics.duration)}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3"><p className="text-xs text-slate-500 mb-1">Task Input</p><p className="text-slate-700 dark:text-slate-300">{selected.taskInput}</p></div>
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3"><p className="text-xs text-slate-500 mb-1">Task Output</p><p className="text-slate-700 dark:text-slate-300">{selected.taskOutput}</p></div>
              </div>
              <div className="flex flex-wrap gap-1 mb-3">
                {selected.agents.map(a => (
                  <Badge key={a} variant="outline" className="text-xs gap-1"><Bot className="h-3 w-3" />{a}</Badge>
                ))}
              </div>
              <div className="text-xs font-medium text-slate-500 mb-2">Messages</div>
              <ScrollArea className="flex-1 min-h-0 max-h-48" ref={scrollRef}>
                <div className="space-y-2">
                  {selected.messages.map((m, i) => (
                    <div key={i} className={`flex gap-2 text-sm p-2 rounded-lg ${m.role === 'system' ? 'bg-slate-100 dark:bg-slate-800' : m.role === 'user' ? 'bg-blue-50 dark:bg-blue-950/20' : 'bg-slate-50 dark:bg-slate-800/50'}`}>
                      <span className={`font-semibold shrink-0 ${m.role === 'agent' ? 'text-[#FF6A00]' : m.role === 'system' ? 'text-slate-500' : 'text-[#003ABC]'}`}>{m.role}</span>
                      <span className="text-slate-700 dark:text-slate-300">{m.content}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
