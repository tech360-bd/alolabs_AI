'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Bot, Activity, AlertTriangle, CheckCircle2, XCircle, Clock, Zap, Shield, BarChart3, RefreshCw, ArrowRight, Plus, Play, Pause, RotateCcw, Eye, MessageSquare, TrendingUp, Heart } from 'lucide-react'
import { fetchApi } from '@/lib/api'

const CATEGORIES = ['Business', 'CRM', 'Marketing', 'Support', 'Research', 'Productivity', 'Technical']

interface CatalogItem { id: string; name: string; category: string; description: string; icon: string; color: string; installCount: number; avgRating: number; capabilities: string; version: string }
interface Instance { id: string; agentId: string; status: string; healthStatus: string; lastHealthCheck: string | null; agent?: { id: string; agentId: string; name: string; status: string }; catalog?: CatalogItem; _count?: { executions: number; healthChecks: number } }
interface Execution { id: string; step: string; stepNumber: number; status: string; priority: string; requestId: string; riskScore: number | null; tokensUsed: number; costUsd: number; durationMs: number | null; createdAt: string; completedAt: string | null }
interface Alert { id: string; alertType: string; severity: string; message: string; isAcknowledged: boolean; createdAt: string }
interface SecurityStat { total: number; blocked: number; flagged: number; passed: number; blockRate: string }

export default function AiWorkforcePanel() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [instances, setInstances] = useState<Instance[]>([])
  const [executions, setExecutions] = useState<Execution[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [secStats, setSecStats] = useState<SecurityStat | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [c, i, e, a, s] = await Promise.all([
        fetchApi<{ data: CatalogItem[] }>('/api/ai-workforce/catalog').then((response) => response.data),
        fetchApi<{ data: Instance[] }>('/api/ai-workforce/instances').then((response) => response.data),
        fetchApi<{ data: Execution[] }>('/api/ai-workforce/execute').then((response) => response.data),
        fetchApi<{ data: Alert[] }>('/api/ai-workforce/alerts').then((response) => response.data),
        fetchApi<{ data: SecurityStat }>('/api/ai-security/stats').then((response) => response.data),
      ])
      setCatalog(c); setInstances(i); setExecutions(e); setAlerts(a); setSecStats(s)
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load AI workforce data')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const acknowledgeAlert = useCallback(async (id: string) => {
    try {
      await fetchApi('/api/ai-workforce/alerts', { method: 'PUT', body: JSON.stringify({ id }) })
      await fetchData()
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : 'Unable to acknowledge alert')
    }
  }, [fetchData])

  const statusColor = (s: string) => s === 'active' || s === 'completed' ? 'bg-emerald-100 text-emerald-700' : s === 'error' || s === 'failed' ? 'bg-red-100 text-red-700' : s === 'paused' || s === 'disabled' || s === 'approval_required' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
  const healthColor = (h: string) => h === 'healthy' ? 'text-emerald-600' : h === 'degraded' ? 'text-amber-600' : h === 'down' ? 'text-red-600' : 'text-slate-400'

  const activeInstances = instances.filter(i => i.status === 'active').length
  const finishedExecutions = executions.filter(e => e.status === 'completed' || e.status === 'failed')
  const completedExecutions = finishedExecutions.filter(e => e.status === 'completed').length
  const recentSuccessRate = finishedExecutions.length > 0 ? `${Math.round(completedExecutions / finishedExecutions.length * 100)}%` : '—'
  const pendingAlerts = alerts.filter(a => !a.isAcknowledged).length

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E293B]">AI Workforce</h1>
          <p className="text-sm text-[#64748B]">Manage agents, executions, and marketplace services</p>
        </div>
        <Button onClick={fetchData} variant="outline" size="sm" className="gap-2"><RefreshCw className="w-4 h-4" /> Refresh</Button>
      </div>
      {loadError && <Card className="border-red-200 bg-red-50"><CardContent className="p-3 text-sm text-red-700">{loadError}</CardContent></Card>}

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {[
          { label: 'Catalog Items', value: catalog.length, icon: Bot, color: 'text-[#003ABC]' },
          { label: 'Active Agents', value: activeInstances, icon: Activity, color: 'text-emerald-600' },
          { label: 'Recent Executions', value: executions.length, icon: Zap, color: 'text-amber-600' },
          { label: 'Recent Success Rate', value: recentSuccessRate, icon: TrendingUp, color: 'text-emerald-600' },
          { label: 'Security Events', value: secStats?.total || 0, icon: Shield, color: 'text-red-600' },
          { label: 'Pending Alerts', value: pendingAlerts, icon: AlertTriangle, color: pendingAlerts > 0 ? 'text-red-600' : 'text-slate-400' },
        ].map((s, i) => (
          <Card key={i} className="border-[#E2E8F0]"><CardContent className="p-4 flex items-center gap-3">
            <s.icon className={`w-8 h-8 ${s.color} opacity-80`} />
            <div><p className="text-xs text-[#94A3B8]">{s.label}</p><p className="text-xl font-bold text-[#1E293B]">{s.value}</p></div>
          </CardContent></Card>
        ))}
      </div>

      {/* Main Content */}
      <Tabs defaultValue="catalog">
        <TabsList className="bg-[#F1F5F9]"><TabsTrigger value="catalog">Agent Catalog</TabsTrigger><TabsTrigger value="instances">Instances</TabsTrigger><TabsTrigger value="executions">Executions</TabsTrigger><TabsTrigger value="security">Security</TabsTrigger><TabsTrigger value="alerts">Alerts</TabsTrigger></TabsList>

        {/* Agent Catalog Tab */}
        <TabsContent value="catalog">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {catalog.map((item) => (
              <Card key={item.id} className="border-[#E2E8F0] hover:border-[#003ABC]/30 hover:shadow-md transition-all">
                <CardHeader className="pb-2"><div className="flex items-start justify-between"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: item.color + '15' }}><Bot className="w-5 h-5" style={{ color: item.color }} /></div><div><CardTitle className="text-sm font-semibold text-[#1E293B]">{item.name}</CardTitle><p className="text-xs text-[#94A3B8]">{item.category}</p></div></div><Badge variant="outline" className="text-xs">v{item.version}</Badge></div></CardHeader>
                <CardContent className="pt-0"><p className="text-xs text-[#64748B] line-clamp-2 mb-3">{item.description}</p><div className="flex items-center justify-between text-xs text-[#94A3B8]"><span className="flex items-center gap-1"><Heart className="w-3 h-3" />{item.avgRating > 0 ? item.avgRating.toFixed(1) : 'New'}</span><span>{item.installCount} installs</span></div></CardContent>
              </Card>
            ))}
            {catalog.length === 0 && !loading && <Card className="col-span-full"><CardContent className="py-12 text-center text-[#94A3B8]">No active catalog items are available for this company.</CardContent></Card>}
          </div>
        </TabsContent>

        {/* Instances Tab */}
        <TabsContent value="instances">
          <Card className="border-[#E2E8F0]"><CardContent className="p-0">
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm"><thead className="bg-[#F8FAFC] sticky top-0"><tr><th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Agent</th><th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Status</th><th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Health</th><th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Executions</th><th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Last Check</th></tr></thead>
              <tbody>{instances.map((inst) => (
                <tr key={inst.id} className="border-t border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors">
                  <td className="px-4 py-3"><div className="flex items-center gap-2"><Bot className="w-4 h-4 text-[#003ABC]" /><span className="font-medium text-[#1E293B]">{inst.agent?.name ?? inst.agent?.agentId ?? inst.agentId}</span></div></td>
                  <td className="px-4 py-3"><Badge className={statusColor(inst.status)}>{inst.status}</Badge></td>
                  <td className="px-4 py-3"><span className={`font-medium ${healthColor(inst.healthStatus)}`}>{inst.healthStatus}</span></td>
                  <td className="px-4 py-3 text-[#64748B]">{inst._count?.executions ?? 0}</td>
                  <td className="px-4 py-3 text-xs text-[#64748B]">{inst.lastHealthCheck ? new Date(inst.lastHealthCheck).toLocaleString() : 'Never'}</td>
                </tr>
              ))}</tbody></table>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* Executions Tab */}
        <TabsContent value="executions">
          <Card className="border-[#E2E8F0]"><CardContent className="p-0">
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm"><thead className="bg-[#F8FAFC] sticky top-0"><tr><th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Request ID</th><th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Step</th><th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Status</th><th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Risk</th><th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Duration</th><th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">When</th></tr></thead>
              <tbody>{executions.slice(0, 50).map((exec) => (
                <tr key={exec.id} className="border-t border-[#F1F5F9] hover:bg-[#F8FAFC]">
                  <td className="px-4 py-3 font-mono text-xs text-[#64748B]">{exec.requestId.slice(0, 20)}</td>
                  <td className="px-4 py-3"><span className="text-xs text-[#1E293B]">{exec.step.replaceAll('_', ' ')}</span><span className="ml-2 text-xs text-[#94A3B8]">Step {exec.stepNumber}</span></td>
                  <td className="px-4 py-3"><Badge className={statusColor(exec.status)}>{exec.status.replaceAll('_', ' ')}</Badge></td>
                  <td className="px-4 py-3"><span className={exec.riskScore !== null && exec.riskScore > 0.5 ? 'text-red-600 font-medium' : 'text-emerald-600'}>{exec.riskScore === null ? '—' : exec.riskScore.toFixed(2)}</span></td>
                  <td className="px-4 py-3 text-xs text-[#64748B]">{exec.durationMs ? `${(exec.durationMs / 1000).toFixed(1)}s` : '—'}</td>
                  <td className="px-4 py-3 text-xs text-[#94A3B8]">{new Date(exec.createdAt).toLocaleTimeString()}</td>
                </tr>
              ))}</tbody></table>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {secStats && [
              { label: 'Total Events', value: secStats.total, icon: Shield },
              { label: 'Blocked', value: secStats.blocked, icon: XCircle, color: 'text-red-600' },
              { label: 'Flagged', value: secStats.flagged, icon: AlertTriangle, color: 'text-amber-600' },
              { label: 'Passed', value: secStats.passed, icon: CheckCircle2, color: 'text-emerald-600' },
            ].map((s, i) => (
              <Card key={i} className="border-[#E2E8F0]"><CardContent className="p-4 flex items-center gap-3"><s.icon className={`w-8 h-8 ${s.color || 'text-[#003ABC]'} opacity-80`} /><div><p className="text-xs text-[#94A3B8]">{s.label}</p><p className="text-2xl font-bold text-[#1E293B]">{s.value}</p></div></CardContent></Card>
            ))}
          </div>
          <Card className="border-[#E2E8F0]"><CardHeader><CardTitle className="text-base">Security Rules</CardTitle></CardHeader><CardContent><p className="text-sm text-[#64748B]">Security rules protect against prompt injection, jailbreak, data leakage, tool abuse, and output validation. Block rate: <span className="font-semibold text-[#1E293B]">{secStats?.blockRate || 0}%</span></p></CardContent></Card>
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts">
          <Card className="border-[#E2E8F0]"><CardContent className="p-0">
            <div className="max-h-[400px] overflow-y-auto">
              {alerts.length === 0 ? <div className="py-12 text-center text-[#94A3B8]">No alerts are recorded for this company.</div> : alerts.map((a) => (
                <div key={a.id} className="flex items-center justify-between px-4 py-3 border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                  <div className="flex items-center gap-3"><AlertTriangle className={`w-4 h-4 ${a.severity === 'critical' ? 'text-red-600' : a.severity === 'warning' ? 'text-amber-600' : 'text-blue-600'}`} /><div><p className="text-sm text-[#1E293B]">{a.message}</p><p className="text-xs text-[#94A3B8]">{a.alertType} · {new Date(a.createdAt).toLocaleString()}</p></div></div>
                  {a.isAcknowledged ? <Badge className="bg-slate-100 text-slate-600">Acknowledged</Badge> : <div className="flex items-center gap-2"><Badge className="bg-red-100 text-red-700">Pending</Badge><Button variant="outline" size="sm" onClick={() => acknowledgeAlert(a.id)}>Acknowledge</Button></div>}
                </div>
              ))}
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}