'use client'

import React, { useState, useEffect } from 'react'
import { Eye, Activity, Cpu, MemoryStick, HardDrive, Wifi, Server, Database, Zap, Clock, AlertTriangle, CheckCircle2, XCircle, BarChart3 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchApi } from '@/lib/api'

interface SystemStats { totalAgents?: number; totalDepartments?: number; activeSessions?: number }

const services = [
  { name: 'API Server', status: 'healthy', latency: 12 },
  { name: 'WebSocket', status: 'healthy', latency: 8 },
  { name: 'Queue Service', status: 'healthy', latency: 3 },
  { name: 'Realtime Service', status: 'healthy', latency: 15 },
  { name: 'Database', status: 'healthy', latency: 5 },
  { name: 'Cache', status: 'healthy', latency: 1 },
]

const logLevels = [
  { level: 'Info', pct: 65, color: 'bg-blue-500' },
  { level: 'Debug', pct: 20, color: 'bg-slate-400' },
  { level: 'Warning', pct: 12, color: 'bg-amber-500' },
  { level: 'Error', pct: 3, color: 'bg-red-500' },
]

export default function Observability() {
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const ctrl = new AbortController()
    async function load() {
      setLoading(true); setError('')
      try {
        const data = await fetchApi('/api/enterprise/stats', { signal: ctrl.signal })
        setStats(data)
      } catch (e) {
        if (e instanceof Error && e.name !== 'AbortError') setError(e.message)
      }
      finally { setLoading(false) }
    }
    load(); return () => ctrl.abort()
  }, [])

  const cpuPct = 23
  const memPct = Math.round((4.2 / 16) * 100)
  const diskPct = Math.round((120 / 500) * 100)

  if (loading) return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/30">
          <Eye className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Observability</h2>
          <p className="text-sm text-slate-500">System health, metrics, service status, and log monitoring</p>
        </div>
      </div>

      {/* System Health Overview */}
      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-3"><CardTitle className="text-base">System Health</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-medium text-emerald-600">Uptime: 99.97%</span>
            <span className="text-xs text-slate-400 ml-2">Last 30 days</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <div className="flex items-center justify-between text-sm mb-1"><span className="text-slate-500 flex items-center gap-1.5"><Cpu className="h-3.5 w-3.5" />CPU</span><span className="font-medium">{cpuPct}%</span></div>
              <Progress value={cpuPct} className="h-2" />
            </div>
            <div>
              <div className="flex items-center justify-between text-sm mb-1"><span className="text-slate-500 flex items-center gap-1.5"><MemoryStick className="h-3.5 w-3.5" />Memory</span><span className="font-medium">4.2GB / 16GB</span></div>
              <Progress value={memPct} className="h-2" />
            </div>
            <div>
              <div className="flex items-center justify-between text-sm mb-1"><span className="text-slate-500 flex items-center gap-1.5"><HardDrive className="h-3.5 w-3.5" />Disk</span><span className="font-medium">120GB / 500GB</span></div>
              <Progress value={diskPct} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Service Status Grid */}
      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-3"><CardTitle className="text-base">Service Status</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {services.map(svc => (
              <div key={svc.name} className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <div className={`h-2 w-2 rounded-full ${svc.status === 'healthy' ? 'bg-emerald-500' : svc.status === 'degraded' ? 'bg-amber-500' : 'bg-red-500'}`} />
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{svc.name}</span>
                </div>
                <span className="text-lg font-bold text-slate-900 dark:text-white">{svc.latency}ms</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Request Rate', value: '1.2K/min', icon: Zap, color: 'text-[#003ABC]' },
          { label: 'Error Rate', value: '0.03%', icon: XCircle, color: 'text-red-600' },
          { label: 'P99 Latency', value: '120ms', icon: Clock, color: 'text-[#FF6A00]' },
          { label: 'Active Connections', value: '847', icon: Wifi, color: 'text-emerald-600' },
        ].map((m, i) => (
          <Card key={i} className="rounded-xl shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-slate-500">{m.label}</p><p className={`text-2xl font-bold ${m.color}`}>{m.value}</p></div>
                <m.icon className="h-5 w-5 text-slate-400" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Log Levels Distribution */}
      <Card className="rounded-xl shadow-sm">
        <CardHeader className="pb-3"><CardTitle className="text-base">Log Levels Distribution</CardTitle></CardHeader>
        <CardContent>
          <div className="flex h-6 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
            {logLevels.map(l => (
              <div key={l.level} className={`${l.color} transition-all`} style={{ width: `${l.pct}%` }} title={`${l.level}: ${l.pct}%`} />
            ))}
          </div>
          <div className="flex flex-wrap gap-4 mt-3">
            {logLevels.map(l => (
              <div key={l.level} className="flex items-center gap-1.5 text-sm">
                <div className={`h-2.5 w-2.5 rounded-sm ${l.color}`} />
                <span className="text-slate-600 dark:text-slate-300">{l.level}</span>
                <span className="font-medium">{l.pct}%</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-xs text-slate-400">Note: Stats API unavailable ({error}), showing static system metrics.</p>}
    </div>
  )
}
