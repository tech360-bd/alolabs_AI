'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { fetchApi } from '@/lib/api'
import {
  Building2, Bot, Scale, ClipboardList, Network, Database, FileCode, Wrench,
  Brain, Map, RotateCcw, Heart, TrendingUp, BarChart3, Users, GitBranch, Zap,
  Globe, Server, HardDrive, Eye, Shield, ShieldCheck, Landmark, FileText, Lock,
  Activity, ArrowRight, RefreshCw, Download, AlertTriangle, CheckCircle,
  Clock, Play
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { EnterpriseView } from '../enterprise-shell'

interface EnterpriseStats {
  departments: number
  agents: number
  activeAgents: number
  provisionedAgents: number
  rules: number
  sops: number
  skills: number
  prompts: number
  knowledgeNodes: number
  collaborations: number
  engineRecords: number
  events: number
  dataLakeEntries: number
  db: {
    memoryRecords: number
    workflowRuns: number
    engineRecordsByType: Record<string, number>
    securityEvents: number
    companyUsers: number
    rag: { collections: number; documents: number; chunks: number; queries: number }
    eventScope: { recentRuns: number; maxRuns: number; truncated: boolean }
  }
  execution: {
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
  topDepartments: Department[]
  generatedAt: string
  scope: { companyId: string; metricsWindow: string }
}

interface EnterpriseActivity {
  id: string
  type: string
  source: string
  severity: 'critical' | 'warning' | 'info' | 'debug'
  timestamp: string
  message: string
  payload: Record<string, unknown>
}

interface Department {
  id: string
  name: string
  slug: string
  agentCount: number
  status: string
  sortOrder: number
}

type SystemCard = {
  id: EnterpriseView
  name: string
  icon: React.ComponentType<{ className?: string }>
  metric: number | null
  label: string
}

function buildSystemCards(stats: EnterpriseStats | null): SystemCard[] {
  const typeCount = (type: string) => stats?.db.engineRecordsByType?.[type] ?? null
  const count = (value: number | undefined) => value ?? null
  return [
    { id: 'department-hub', name: 'Department Hub', icon: Building2, metric: count(stats?.departments), label: 'Departments' },
    { id: 'ai-employees', name: 'AI Employees', icon: Bot, metric: count(stats?.agents), label: 'Accessible agents' },
    { id: 'constitution-engine', name: 'Constitutional Rules', icon: Scale, metric: count(stats?.rules), label: 'Active rules' },
    { id: 'sop-system', name: 'SOP System', icon: ClipboardList, metric: count(stats?.sops), label: 'Active SOPs' },
    { id: 'knowledge-graph', name: 'Knowledge Graph', icon: Network, metric: count(stats?.knowledgeNodes), label: 'Visible nodes' },
    { id: 'rag-engine', name: 'Enterprise RAG', icon: Database, metric: count(stats?.db.rag.documents), label: 'Tenant documents' },
    { id: 'prompt-library', name: 'Prompt Library', icon: FileCode, metric: count(stats?.prompts), label: 'Public templates' },
    { id: 'skills-registry', name: 'Skills Registry', icon: Wrench, metric: count(stats?.skills), label: 'Available skills' },
    { id: 'collaboration', name: 'Multi-Agent Collaboration', icon: Users, metric: count(stats?.collaborations), label: 'Recorded sessions' },
    { id: 'memory-engine', name: 'Memory Engine', icon: Brain, metric: count(stats?.db.memoryRecords), label: 'Tenant memory records' },
    { id: 'planning-engine', name: 'Planning Engine', icon: Map, metric: typeCount('planning'), label: 'Recorded operations' },
    { id: 'reflection-engine', name: 'Reflection Engine', icon: RotateCcw, metric: typeCount('reflection'), label: 'Recorded operations' },
    { id: 'self-healing', name: 'Self-Healing', icon: Heart, metric: typeCount('self_healing'), label: 'Recorded operations' },
    { id: 'self-optimization', name: 'Self-Optimization', icon: TrendingUp, metric: typeCount('self_optimization'), label: 'Recorded operations' },
    { id: 'evaluation-engine', name: 'Evaluation Engine', icon: BarChart3, metric: typeCount('evaluation'), label: 'Recorded operations' },
    { id: 'governance-engine', name: 'Governance Engine', icon: Landmark, metric: count(stats?.rules), label: 'Visible rules' },
    { id: 'security-engine', name: 'Security Engine', icon: Shield, metric: count(stats?.db.securityEvents), label: 'Tenant security events' },
    { id: 'audit-engine', name: 'Audit Engine', icon: FileText, metric: typeCount('audit'), label: 'Recorded operations' },
    { id: 'compliance-engine', name: 'Compliance Engine', icon: ShieldCheck, metric: typeCount('compliance'), label: 'Recorded operations' },
    { id: 'observability', name: 'Observability', icon: Eye, metric: count(stats?.execution.agentRuns24h), label: 'Agent runs (24h)' },
    { id: 'workflow-orchestration', name: 'Workflow Orchestration', icon: GitBranch, metric: count(stats?.db.workflowRuns), label: 'Recorded workflow runs' },
    { id: 'event-bus', name: 'Run Event Activity', icon: Zap, metric: count(stats?.events), label: stats?.db.eventScope.truncated ? `Events in latest ${stats.db.eventScope.maxRuns} runs (sample)` : 'Events in recent runs' },
    { id: 'api-gateway', name: 'API Gateway', icon: Globe, metric: count(stats?.execution.usageLogs24h), label: 'Usage records (24h)' },
    { id: 'mcp-integration', name: 'MCP Integration', icon: Server, metric: null, label: 'Not measured' },
    { id: 'data-lake', name: 'Data Lake', icon: HardDrive, metric: count(stats?.dataLakeEntries), label: 'Department-scoped entries' },
    { id: 'enterprise-rbac', name: 'Enterprise RBAC', icon: Lock, metric: count(stats?.db.companyUsers), label: 'Tenant memberships' },
  ]
}

const eventTone: Record<EnterpriseActivity['severity'], string> = {
  critical: 'text-red-600',
  warning: 'text-amber-600',
  info: 'text-blue-600',
  debug: 'text-slate-500',
}

interface Props {
  onNavigate?: (view: EnterpriseView) => void
}

export default function EnterpriseOverview({ onNavigate }: Props) {
  const [stats, setStats] = useState<EnterpriseStats | null>(null)
  const [events, setEvents] = useState<EnterpriseActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [dataError, setDataError] = useState('')
  const [activityError, setActivityError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    async function fetchData() {
      setLoading(true)
      setDataError('')
      setActivityError('')
      const [statsResult, eventsResult] = await Promise.allSettled([
        fetchApi<EnterpriseStats>('/api/enterprise/stats', { signal: controller.signal }),
        fetchApi<{ events: EnterpriseActivity[] }>('/api/enterprise/activity?limit=10', { signal: controller.signal }),
      ])
      if (controller.signal.aborted) return
      if (statsResult.status === 'fulfilled') setStats(statsResult.value)
      else {
        setStats(null)
        setDataError(statsResult.reason instanceof Error ? statsResult.reason.message : 'Tenant metrics are unavailable')
      }
      if (eventsResult.status === 'fulfilled') setEvents(eventsResult.value.events ?? [])
      else {
        setEvents([])
        setActivityError(eventsResult.reason instanceof Error ? eventsResult.reason.message : 'Tenant activity is unavailable')
      }
      setLoading(false)
    }
    void fetchData()
    return () => controller.abort()
  }, [refreshKey])

  const systems = buildSystemCards(stats)
  const navigate = useCallback((view: EnterpriseView) => onNavigate?.(view), [onNavigate])

  const exportSnapshot = useCallback(() => {
    if (!stats) return
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), stats, events }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `alo-enterprise-snapshot-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }, [stats, events])

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    )
  }

  const heroMetrics = [
    { label: 'Tenant Departments', value: stats?.departments, icon: Building2, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30' },
    { label: 'Accessible Agents', value: stats?.agents, icon: Bot, color: 'text-[#FF6A00]', bg: 'bg-orange-50 dark:bg-orange-950/30' },
    { label: 'Active Governance Rules', value: stats?.rules, icon: Scale, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
    { label: 'Available Skills', value: stats?.skills, icon: Wrench, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950/30' },
  ]
  const runRate = stats?.execution.runSuccessRate
  const runRateLabel = runRate === null || runRate === undefined ? 'No completed run evidence' : `${(runRate * 100).toFixed(1)}% completed`

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Enterprise Overview</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Tenant-scoped database counts and recorded activity. Unmeasured systems are not assigned synthetic health scores.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setRefreshKey((key) => key + 1)} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportSnapshot} disabled={!stats}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export snapshot
          </Button>
        </div>
      </div>

      {dataError && <p role="status" className="text-sm text-amber-700 dark:text-amber-400">Tenant metrics are unavailable: {dataError}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {heroMetrics.map((metric) => {
          const Icon = metric.icon
          return (
            <Card key={metric.label} className="rounded-xl shadow-sm border-0 bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-800 dark:to-slate-900/50">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{metric.label}</p>
                    <p className="text-3xl font-bold mt-1 text-slate-900 dark:text-white">{metric.value == null ? '—' : metric.value.toLocaleString()}</p>
                  </div>
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${metric.bg}`}>
                    <Icon className={`h-6 w-6 ${metric.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">System inventory & measured activity</h2>
        <p className="text-xs text-slate-500 mb-4">A missing value means this tenant has no scoped measurement for that subsystem.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {systems.map((system) => {
            const Icon = system.icon
            return (
              <Card key={system.id} className="rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer border-0 bg-white dark:bg-slate-800 group" onClick={() => navigate(system.id)}>
                <CardContent className="p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#003ABC]/8 group-hover:bg-[#003ABC]/12 transition-colors">
                      <Icon className="h-4 w-4 text-[#003ABC]" />
                    </div>
                    {system.metric === null && <Badge variant="secondary" className="text-[9px]">Unmeasured</Badge>}
                  </div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{system.name}</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{system.metric === null ? '—' : system.metric.toLocaleString()}</p>
                  <p className="text-[10px] text-slate-400">{system.metric === null ? 'No tenant-scoped metric' : system.label}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="rounded-xl shadow-sm border-0 bg-white dark:bg-slate-800 lg:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Recorded Activity</CardTitle>
              <Badge variant="secondary" className="text-[10px]">Database-backed</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-96">
              <div className="px-5 pb-4 space-y-3">
                {activityError ? <p role="status" className="text-sm text-amber-700">Activity unavailable: {activityError}</p> : events.length > 0 ? events.map((event) => (
                  <div key={event.id} className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700">
                      <Activity className={`h-3.5 w-3.5 ${eventTone[event.severity]}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">{event.message}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" /> {new Date(event.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )) : <p className="text-sm text-slate-400">No recorded run activity for this tenant yet.</p>}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="rounded-xl shadow-sm border-0 bg-white dark:bg-slate-800 lg:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Departments by accessible agents</CardTitle>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate('department-hub')}>
                View All <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-96">
              <div className="px-5 pb-4 space-y-2.5">
                {(stats?.topDepartments ?? []).length > 0 ? (stats?.topDepartments ?? []).map((department, index) => {
                  const maxAgents = Math.max(...(stats?.topDepartments ?? []).map((item) => item.agentCount), 1)
                  const width = (department.agentCount / maxAgents) * 100
                  return (
                    <div key={department.id}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-400 w-4">{index + 1}</span>
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate max-w-[140px]">{department.name}</span>
                        </div>
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{department.agentCount}</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                        <div className="h-full rounded-full bg-[#003ABC] transition-all" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  )
                }) : <p className="px-5 pb-4 text-sm text-slate-400">No tenant departments are recorded.</p>}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="rounded-xl shadow-sm border-0 bg-white dark:bg-slate-800 lg:col-span-1">
          <CardHeader className="pb-3"><CardTitle className="text-base font-semibold">Recorded run outcomes · 24h</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {stats ? (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Run success rate</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{runRateLabel}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 p-3"><p className="text-lg font-bold">{stats.execution.runs24h.toLocaleString()}</p><p className="text-[10px] text-slate-500">Runs (24h)</p></div>
                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-3"><p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{stats.execution.completedRuns24h.toLocaleString()}</p><p className="text-[10px] text-slate-500">Completed</p></div>
                  <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-3"><p className="text-lg font-bold text-red-700 dark:text-red-400">{stats.execution.failedRuns24h.toLocaleString()}</p><p className="text-[10px] text-slate-500">Failed / cancelled</p></div>
                </div>
                {stats.execution.averageAgentRunLatencyMs === null
                  ? <p className="text-xs text-slate-500">Agent-run latency has not been recorded for this period.</p>
                  : <p className="text-xs text-slate-500">Mean recorded agent-run latency: {stats.execution.averageAgentRunLatencyMs.toLocaleString()} ms.</p>}
              </>
            ) : <p className="text-sm text-slate-400">No tenant-scoped run metrics available.</p>}
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Open a workspace</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { label: 'Open Security Audits', icon: Shield, onClick: () => navigate('audit-engine') },
            { label: 'View Evaluations', icon: BarChart3, onClick: () => navigate('evaluation-engine') },
            { label: 'Open Compliance', icon: ShieldCheck, onClick: () => navigate('compliance-engine') },
            { label: 'Browse Knowledge', icon: Network, onClick: () => navigate('knowledge-graph') },
            { label: 'Open API Gateway', icon: Globe, onClick: () => navigate('api-gateway') },
            { label: 'Manage Agents', icon: Play, onClick: () => navigate('ai-employees') },
            { label: 'Review SOPs', icon: ClipboardList, onClick: () => navigate('sop-system') },
            { label: 'View Observability', icon: AlertTriangle, onClick: () => navigate('observability') },
            { label: 'Open Department Hub', icon: CheckCircle, onClick: () => navigate('department-hub') },
            { label: 'Open Prompt Library', icon: FileCode, onClick: () => navigate('prompt-library') },
          ].map((action) => {
            const Icon = action.icon
            return (
              <Button key={action.label} variant="outline" className="h-auto py-4 flex-col gap-2 rounded-xl hover:border-[#003ABC]/30 hover:bg-[#003ABC]/4 transition-all" onClick={action.onClick}>
                <Icon className="h-5 w-5 text-[#003ABC]" />
                <span className="text-xs font-medium">{action.label}</span>
              </Button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
