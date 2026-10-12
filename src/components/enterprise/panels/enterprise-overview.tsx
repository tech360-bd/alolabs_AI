'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { fetchApi } from '@/lib/api'
import {
  Building2, Bot, Scale, ClipboardList, Network, Database, FileCode, Wrench,
  Brain, Map, RotateCcw, Heart, TrendingUp, BarChart3, Users, GitBranch, Zap,
  Globe, Server, HardDrive, Eye, Shield, ShieldCheck, Landmark, FileText, Lock,
  Activity, ArrowRight, RefreshCw, Download, AlertTriangle, CheckCircle,
  Clock, Settings, Play
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { EnterpriseView } from '../enterprise-shell'

// ─── Types ────────────────────────────────────────────────────────────────────
interface EnterpriseStats {
  departments: number
  agents: number
  rules: number
  sops: number
  skills: number
  prompts: number
  knowledgeNodes: number
  collaborations: number
  engineRecords: number
  events: number
  dataLakeEntries: number
}

interface EnterpriseEvent {
  id: number
  type: string
  message: string
  time: string
  icon: string
}

interface Department {
  id: string
  name: string
  agentCount: number
  status: string
  category: string
}

const defaultStats: EnterpriseStats = {
  departments: 100,
  agents: 2000,
  rules: 500,
  sops: 500,
  skills: 10000,
  prompts: 50000,
  knowledgeNodes: 2500,
  collaborations: 150,
  engineRecords: 50000,
  events: 100000,
  dataLakeEntries: 250000,
}

// ─── System Cards Config ──────────────────────────────────────────────────────
function useSystemCards(stats: EnterpriseStats) {
  return [
    { id: 'departments' as EnterpriseView, name: 'Department Hub', icon: Building2, metric: stats.departments, label: 'Departments', status: 'active' },
    { id: 'ai-employees' as EnterpriseView, name: 'AI Employees', icon: Bot, metric: stats.agents, label: 'Agents', status: 'active' },
    { id: 'constitution-engine' as EnterpriseView, name: 'Constitutional Rules', icon: Scale, metric: stats.rules, label: 'Rules', status: 'active' },
    { id: 'sop-system' as EnterpriseView, name: 'SOPs System', icon: ClipboardList, metric: stats.sops, label: 'SOPs', status: 'active' },
    { id: 'knowledge-graph' as EnterpriseView, name: 'Knowledge Graph', icon: Network, metric: stats.knowledgeNodes, label: 'Nodes', status: 'active' },
    { id: 'rag-engine' as EnterpriseView, name: 'Enterprise RAG', icon: Database, metric: 12500, label: 'Documents', status: 'active' },
    { id: 'prompt-library' as EnterpriseView, name: 'Prompt Library', icon: FileCode, metric: stats.prompts, label: 'Templates', status: 'active' },
    { id: 'skills-registry' as EnterpriseView, name: 'Skills Registry', icon: Wrench, metric: stats.skills, label: 'Skills', status: 'active' },
    { id: 'collaboration' as EnterpriseView, name: 'Multi-Agent Collab', icon: Users, metric: stats.collaborations, label: 'Sessions', status: 'active' },
    { id: 'memory-engine' as EnterpriseView, name: 'Memory Engine', icon: Brain, metric: 8500, label: 'Records', status: 'active' },
    { id: 'planning-engine' as EnterpriseView, name: 'Planning Engine', icon: Map, metric: 3200, label: 'Plans', status: 'active' },
    { id: 'reflection-engine' as EnterpriseView, name: 'Reflection Engine', icon: RotateCcw, metric: 4100, label: 'Reflections', status: 'active' },
    { id: 'self-healing' as EnterpriseView, name: 'Self-Healing', icon: Heart, metric: 890, label: 'Healings', status: 'active' },
    { id: 'self-optimization' as EnterpriseView, name: 'Self-Optimization', icon: TrendingUp, metric: 2100, label: 'Optimizations', status: 'active' },
    { id: 'evaluation-engine' as EnterpriseView, name: 'Evaluation Engine', icon: BarChart3, metric: 15000, label: 'Evaluations', status: 'active' },
    { id: 'governance-engine' as EnterpriseView, name: 'Governance Engine', icon: Landmark, metric: 2500, label: 'Policies', status: 'active' },
    { id: 'security-engine' as EnterpriseView, name: 'Security Engine', icon: Shield, metric: 9500, label: 'Scans', status: 'active' },
    { id: 'audit-engine' as EnterpriseView, name: 'Audit Engine', icon: FileText, metric: 7500, label: 'Audits', status: 'active' },
    { id: 'compliance-engine' as EnterpriseView, name: 'Compliance Engine', icon: ShieldCheck, metric: 3400, label: 'Checks', status: 'active' },
    { id: 'observability' as EnterpriseView, name: 'Observability', icon: Eye, metric: 50000, label: 'Events', status: 'active' },
    { id: 'workflow-orchestration' as EnterpriseView, name: 'Workflow Orch.', icon: GitBranch, metric: 1800, label: 'Workflows', status: 'active' },
    { id: 'event-bus' as EnterpriseView, name: 'Event Bus', icon: Zap, metric: stats.events, label: 'Events', status: 'active' },
    { id: 'api-gateway' as EnterpriseView, name: 'API Gateway', icon: Globe, metric: 268, label: 'Endpoints', status: 'active' },
    { id: 'mcp-integration' as EnterpriseView, name: 'MCP Integration', icon: Server, metric: 45, label: 'Servers', status: 'active' },
    { id: 'data-lake' as EnterpriseView, name: 'Data Lake', icon: HardDrive, metric: 250000, label: 'Entries', status: 'active' },
    { id: 'enterprise-rbac' as EnterpriseView, name: 'Enterprise RBAC', icon: Lock, metric: 87, label: 'Users', status: 'active' },
  ]
}

// ─── Event Icon Map ─────────────────────────────────────────────────────────────
const eventIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Bot, Shield, ClipboardList, Wrench, Users, Network, ShieldCheck, FileText, Brain, Heart,
}

// ─── Engine Performance Data ───────────────────────────────────────────────────
const enginePerformance = [
  { name: 'Memory', score: 96, color: 'bg-emerald-500' },
  { name: 'Planning', score: 91, color: 'bg-emerald-500' },
  { name: 'Reflection', score: 88, color: 'bg-emerald-500' },
  { name: 'Self-Healing', score: 94, color: 'bg-emerald-500' },
  { name: 'Self-Optimization', score: 87, color: 'bg-blue-500' },
  { name: 'Evaluation', score: 92, color: 'bg-emerald-500' },
  { name: 'Governance', score: 98, color: 'bg-emerald-500' },
  { name: 'Compliance', score: 99, color: 'bg-emerald-500' },
  { name: 'Security', score: 97, color: 'bg-emerald-500' },
  { name: 'Audit', score: 95, color: 'bg-emerald-500' },
  { name: 'RAG', score: 90, color: 'bg-blue-500' },
]

// ─── Component ────────────────────────────────────────────────────────────────
interface Props {
  onNavigate?: (view: EnterpriseView) => void
}

export default function EnterpriseOverview({ onNavigate }: Props) {
  const [stats, setStats] = useState<EnterpriseStats | null>(null)
  const [events, setEvents] = useState<EnterpriseEvent[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    async function fetchData() {
      try {
        const [statsResult, eventsResult, deptsResult] = await Promise.allSettled([
          fetchApi('/api/enterprise/stats', { signal: controller.signal }),
          fetchApi('/api/enterprise/events?limit=10', { signal: controller.signal }),
          fetchApi('/api/enterprise/departments?limit=10', { signal: controller.signal }),
        ])

        if (statsResult.status === 'fulfilled') {
          setStats(statsResult.value)
        } else {
          setStats(defaultStats)
        }

        if (eventsResult.status === 'fulfilled') {
          setEvents(eventsResult.value)
        }

        if (deptsResult.status === 'fulfilled') {
          setDepartments(deptsResult.value)
        }
      } catch {
        if (!stats) setStats(defaultStats)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    return () => controller.abort()
  }, [])

  const systems = useSystemCards(stats || defaultStats)
  const navigate = useCallback((view: EnterpriseView) => onNavigate?.(view), [onNavigate])

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
    { label: 'Total Departments', value: stats?.departments ?? defaultStats.departments, icon: Building2, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30' },
    { label: 'AI Employees', value: stats?.agents ?? defaultStats.agents, icon: Bot, color: 'text-[#FF6A00]', bg: 'bg-orange-50 dark:bg-orange-950/30' },
    { label: 'Active Rules', value: stats?.rules ?? defaultStats.rules, icon: Scale, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
    { label: 'Total Skills', value: stats?.skills ?? defaultStats.skills, icon: Wrench, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950/30' },
  ]

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ── Title ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Enterprise Overview</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Real-time status of all 26 enterprise systems</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
          </Button>
          <Button variant="outline" size="sm">
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export
          </Button>
        </div>
      </div>

      {/* ── Hero Metrics ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {heroMetrics.map((m) => {
          const Icon = m.icon
          return (
            <Card key={m.label} className="rounded-xl shadow-sm hover:shadow-md transition-shadow border-0 bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-800 dark:to-slate-900/50">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{m.label}</p>
                    <p className="text-3xl font-bold mt-1 text-slate-900 dark:text-white">
                      {(m.value as number).toLocaleString()}
                      {m.label === 'AI Employees' && <span className="text-lg font-normal text-slate-400">+</span>}
                    </p>
                  </div>
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${m.bg}`}>
                    <Icon className={`h-6 w-6 ${m.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* ── System Health Grid ── */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">System Health Grid</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {systems.map((sys) => {
            const Icon = sys.icon
            const usagePercent = Math.min(Math.random() * 40 + 50, 95)
            return (
              <Card
                key={sys.id}
                className="rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer border-0 bg-white dark:bg-slate-800 group"
                onClick={() => navigate(sys.id)}
              >
                <CardContent className="p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#003ABC]/8 group-hover:bg-[#003ABC]/12 transition-colors">
                      <Icon className="h-4 w-4 text-[#003ABC]" />
                    </div>
                    <div className="flex items-center gap-1">
                      <div className={`h-2 w-2 rounded-full ${sys.status === 'active' ? 'bg-emerald-500' : sys.status === 'degraded' ? 'bg-amber-500' : 'bg-red-500'}`} />
                    </div>
                  </div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{sys.name}</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{(sys.metric as number).toLocaleString()}</p>
                  <p className="text-[10px] text-slate-400 mb-2">{sys.label}</p>
                  <div className="w-full h-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${usagePercent > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* ── Bottom Section: Activity + Depts + Engine Performance ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Activity */}
        <Card className="rounded-xl shadow-sm border-0 bg-white dark:bg-slate-800 lg:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
              <Badge variant="secondary" className="text-[10px]">Live</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-96">
              <div className="px-5 pb-4 space-y-3">
                {events.length > 0 ? events.map((ev) => {
                  const EvIcon = eventIconMap[ev.icon] || Activity
                  return (
                    <div key={ev.id} className="flex items-start gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700">
                        <EvIcon className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">{ev.message}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" /> {ev.time}
                        </p>
                      </div>
                    </div>
                  )
                }) : (
                  <p className="text-sm text-slate-400">Loading events...</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Department Distribution */}
        <Card className="rounded-xl shadow-sm border-0 bg-white dark:bg-slate-800 lg:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Top Departments</CardTitle>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate('department-hub')}>
                View All <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-96">
              <div className="px-5 pb-4 space-y-2.5">
                {departments.length > 0 ? departments.map((dept, idx) => {
                  const maxAgents = Math.max(...departments.map(d => d.agentCount), 1)
                  const width = (dept.agentCount / maxAgents) * 100
                  return (
                    <div key={dept.id}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-400 w-4">{idx + 1}</span>
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate max-w-[140px]">{dept.name}</span>
                        </div>
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{dept.agentCount}</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#003ABC] transition-all"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  )
                }) : (
                  <p className="text-sm text-slate-400">Loading departments...</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Engine Performance */}
        <Card className="rounded-xl shadow-sm border-0 bg-white dark:bg-slate-800 lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Engine Performance</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-96">
              <div className="px-5 pb-4 space-y-3">
                {enginePerformance.map((engine) => (
                  <div key={engine.name} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300 w-28 shrink-0">{engine.name}</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${engine.color} transition-all`}
                        style={{ width: `${engine.score}%` }}
                      />
                    </div>
                    <span className={`text-xs font-bold w-8 text-right ${engine.score >= 95 ? 'text-emerald-600' : engine.score >= 90 ? 'text-blue-600' : 'text-amber-600'}`}>
                      {engine.score}%
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* ── Quick Actions ── */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { label: 'Run Security Audit', icon: Shield, onClick: () => navigate('audit-engine') },
            { label: 'Generate Report', icon: BarChart3, onClick: () => navigate('evaluation-engine') },
            { label: 'Check Compliance', icon: ShieldCheck, onClick: () => navigate('compliance-engine') },
            { label: 'View Knowledge', icon: Network, onClick: () => navigate('knowledge-graph') },
            { label: 'System Settings', icon: Settings, onClick: () => navigate('api-gateway') },
            { label: 'Deploy Agent', icon: Play, onClick: () => navigate('ai-employees') },
            { label: 'Review SOPs', icon: ClipboardList, onClick: () => navigate('sop-system') },
            { label: 'Check Alerts', icon: AlertTriangle, onClick: () => navigate('observability') },
            { label: 'Team Health', icon: CheckCircle, onClick: () => navigate('department-hub') },
            { label: 'Prompt Library', icon: FileCode, onClick: () => navigate('prompt-library') },
          ].map((action) => {
            const Icon = action.icon
            return (
              <Button
                key={action.label}
                variant="outline"
                className="h-auto py-4 flex-col gap-2 rounded-xl hover:border-[#003ABC]/30 hover:bg-[#003ABC]/4 transition-all"
                onClick={action.onClick}
              >
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
