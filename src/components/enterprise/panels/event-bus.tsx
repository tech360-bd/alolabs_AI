'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Zap, AlertTriangle, AlertCircle, Info, Bug, RefreshCw, Radio } from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'

interface EnterpriseEvent {
  id: string; type: string; source: string
  severity: 'critical' | 'warning' | 'info' | 'debug'
  timestamp: string; payload: Record<string, unknown>
}

const severityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
  debug: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
}
const severityIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  critical: AlertTriangle, warning: AlertCircle, info: Info, debug: Bug,
}
const severityRowBg: Record<string, string> = {
  critical: 'bg-red-50/50 dark:bg-red-950/10',
  warning: 'bg-amber-50/50 dark:bg-amber-950/10',
  info: '',
  debug: '',
}

function fmt(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function EventBus() {
  const [events, setEvents] = useState<EnterpriseEvent[]>([])
  const [stats, setStats] = useState<{ total: number; bySeverity: Record<string, number>; byType: Record<string, number> } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [live, setLive] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
 try {
      const params = new URLSearchParams({ severity: severityFilter, type: typeFilter, limit: '60' })
      const data = await fetchApi(`/api/enterprise/events?${params}`)
      setEvents(data.events); setStats(data.stats)
    } catch (e) { if (e instanceof Error) setError(e.message) }
    finally { setLoading(false) }
  }, [severityFilter, typeFilter])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (live) {
      intervalRef.current = setInterval(load, 5000)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [live, load])

  const eventTypes = stats ? Object.keys(stats.byType).sort() : []

  if (loading && events.length === 0) return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
      </div>
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  )

  if (error) return (
    <div className="space-y-6 p-6">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Event Bus</h2>
      <Card className="rounded-xl shadow-sm"><CardContent className="p-6 text-center text-red-500">Failed to load: {error}</CardContent></Card>
    </div>
  )

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950/30">
          <Zap className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Event Bus</h2>
          <p className="text-sm text-slate-500">Real-time enterprise event stream and monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          <Radio className={`h-3.5 w-3.5 ${live ? 'text-emerald-500 animate-pulse' : 'text-slate-400'}`} />
          <span className="text-xs text-slate-500">{live ? 'Live' : 'Paused'}</span>
          <Button variant="outline" size="sm" onClick={() => setLive(!live)} className="h-8">
            {live ? 'Pause' : 'Resume'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Events', value: stats?.total.toLocaleString() ?? '—', icon: Zap, color: 'text-[#003ABC]' },
          { label: 'Critical', value: stats?.bySeverity.critical?.toLocaleString() ?? '0', icon: AlertTriangle, color: 'text-red-600' },
          { label: 'Warning', value: stats?.bySeverity.warning?.toLocaleString() ?? '0', icon: AlertCircle, color: 'text-amber-600' },
          { label: 'Info', value: stats?.bySeverity.info?.toLocaleString() ?? '0', icon: Info, color: 'text-blue-600' },
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
            <CardTitle className="text-base">Event Stream</CardTitle>
            <div className="flex flex-wrap gap-2">
              <select className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800" value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}>
                <option value="all">All Severities</option>
                {['critical', 'warning', 'info', 'debug'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
              <select className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                <option value="all">All Types</option>
                {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <Button variant="ghost" size="sm" onClick={load} className="h-9"><RefreshCw className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-96" ref={scrollRef}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Type</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Payload</TableHead>
                  <TableHead className="pr-4 text-right">Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-slate-400">No events found</TableCell></TableRow>}
                {events.map(ev => {
                  const SIcon = severityIcons[ev.severity] || Info
                  return (
                    <TableRow key={ev.id} className={severityRowBg[ev.severity]}>
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-2">
                          <SIcon className={`h-3.5 w-3.5 ${ev.severity === 'critical' ? 'text-red-500' : ev.severity === 'warning' ? 'text-amber-500' : ev.severity === 'info' ? 'text-blue-500' : 'text-slate-400'}`} />
                          <span className="text-sm font-mono">{ev.type}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600 dark:text-slate-400">{ev.source}</TableCell>
                      <TableCell><Badge variant="secondary" className={severityColors[ev.severity]}>{ev.severity}</Badge></TableCell>
                      <TableCell className="text-xs text-slate-500 max-w-[200px] truncate">{(ev.payload.message as string) || JSON.stringify(ev.payload).slice(0, 50)}</TableCell>
                      <TableCell className="pr-4 text-right text-xs text-slate-400 whitespace-nowrap">{fmt(ev.timestamp)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}