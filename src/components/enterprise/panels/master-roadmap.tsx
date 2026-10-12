'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { fetchApi } from '@/lib/api'
import {
  Calendar, MapPin, CheckCircle, Clock, AlertTriangle, ArrowRight,
  ChevronDown, ChevronUp, Target, DollarSign, Zap, Users, Flag,
  TrendingUp, ShieldAlert, Layers, BarChart3, Activity, GanttChart,
  Milestone, CircleDot, Rocket, Smartphone, Bot, Server, Globe
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import type { EnterpriseView } from '../enterprise-shell'
import type {
  RoadmapPhase, RoadmapStream, RoadmapTask, RoadmapMilestone, RoadmapRisk
} from '@/lib/enterprise-roadmap'

// ─── Types ────────────────────────────────────────────────────────────────
interface RoadmapSummary {
  totalPhases: number
  totalWeeks: number
  totalMilestones: number
  totalTasks: number
  totalBudget: number
  completionPercent: number
  criticalPath: { length: number; leafTask: string }
}

interface StreamDef {
  id: string
  name: string
  description: string
}

interface RoadmapData {
  phases: RoadmapPhase[]
  streams: StreamDef[]
  summary: RoadmapSummary
}

interface PanelProps {
  onNavigate?: (view: EnterpriseView) => void
}

// ─── Constants ────────────────────────────────────────────────────────────
const STREAM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  platform: Server,
  'ai-engine': Bot,
  mobile: Smartphone,
  enterprise: Globe,
}

const STREAM_COLORS: Record<string, string> = {
  platform: 'bg-blue-500',
  'ai-engine': 'bg-orange-500',
  mobile: 'bg-emerald-500',
  enterprise: 'bg-purple-500',
}

const STREAM_TEXT_COLORS: Record<string, string> = {
  platform: 'text-blue-600 dark:text-blue-400',
  'ai-engine': 'text-orange-600 dark:text-orange-400',
  mobile: 'text-emerald-600 dark:text-emerald-400',
  enterprise: 'text-purple-600 dark:text-purple-400',
}

const STREAM_BG_COLORS: Record<string, string> = {
  platform: 'bg-blue-50 dark:bg-blue-950/30',
  'ai-engine': 'bg-orange-50 dark:bg-orange-950/30',
  mobile: 'bg-emerald-50 dark:bg-emerald-950/30',
  enterprise: 'bg-purple-50 dark:bg-purple-950/30',
}

const PHASE_GRADIENTS: Record<string, string> = {
  'phase-1': 'from-slate-600 to-slate-700',
  'phase-2': 'from-blue-600 to-blue-700',
  'phase-3': 'from-orange-500 to-orange-600',
  'phase-4': 'from-emerald-600 to-emerald-700',
  'phase-5': 'from-purple-600 to-purple-700',
  'phase-6': 'from-rose-500 to-rose-600',
}

const MILESTONE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  release: Rocket,
  certification: ShieldAlert,
  revenue: DollarSign,
  technical: Activity,
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dotColor: string }> = {
  planned: { label: 'Planned', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', dotColor: 'bg-slate-400' },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300', dotColor: 'bg-blue-500' },
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', dotColor: 'bg-emerald-500' },
  blocked: { label: 'Blocked', color: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300', dotColor: 'bg-red-500' },
}

// ─── Component ────────────────────────────────────────────────────────────
export default function MasterRoadmapPanel({ onNavigate }: PanelProps) {
  const [data, setData] = useState<RoadmapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPhase, setSelectedPhase] = useState<string | null>(null)
  const [selectedStream, setSelectedStream] = useState<string | null>(null)
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set())
  const [expandedStreams, setExpandedStreams] = useState<Set<string>>(new Set())
  const [detailTask, setDetailTask] = useState<RoadmapTask | null>(null)
  const [detailMilestone, setDetailMilestone] = useState<RoadmapMilestone | null>(null)
  const [viewMode, setViewMode] = useState<'phases' | 'timeline' | 'streams'>('phases')

  useEffect(() => {
    fetchApi('/api/enterprise/roadmap')
      .then((res: any) => {
        if (res.success) setData(res.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const togglePhase = (id: string) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleStream = (id: string) => {
    setExpandedStreams((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filteredPhases = useMemo(() => {
    if (!data) return []
    return data.phases.filter((p) => {
      if (selectedPhase && p.id !== selectedPhase) return false
      if (selectedStream) return p.streams.some((s) => s.id === selectedStream)
      return true
    })
  }, [data, selectedPhase, selectedStream])

  const totalProgress = useMemo(() => {
    if (!data) return 0
    const allTasks = data.phases.flatMap((p) => p.streams.flatMap((s) => s.tasks))
    if (allTasks.length === 0) return 0
    return Math.round(allTasks.reduce((sum, t) => sum + t.percentComplete, 0) / allTasks.length)
  }, [data])

  const tasksByStatus = useMemo(() => {
    if (!data) return { planned: 0, in_progress: 0, completed: 0, blocked: 0 }
    const allTasks = data.phases.flatMap((p) => p.streams.flatMap((s) => s.tasks))
    return {
      planned: allTasks.filter((t) => t.status === 'planned').length,
      in_progress: allTasks.filter((t) => t.status === 'in_progress').length,
      completed: allTasks.filter((t) => t.status === 'completed').length,
      blocked: allTasks.filter((t) => t.status === 'blocked').length,
    }
  }, [data])

  // ─── Loading Skeleton ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-64 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-40 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Failed to load roadmap data.
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* ─── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#003ABC] text-white">
              <Calendar className="h-5 w-5" />
            </div>
            Master Roadmap
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            52-week enterprise execution plan · 6 phases · 4 parallel streams
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(['phases', 'timeline', 'streams'] as const).map((mode) => (
            <Button
              key={mode}
              variant={viewMode === mode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode(mode)}
            >
              {mode === 'phases' && <Layers className="h-3.5 w-3.5 mr-1" />}
              {mode === 'timeline' && <BarChart3 className="h-3.5 w-3.5 mr-1" />}
              {mode === 'streams' && <Zap className="h-3.5 w-3.5 mr-1" />}
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* ─── KPI Summary Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KPICard icon={Calendar} label="Total Weeks" value="52" sub="6 Phases" color="text-[#003ABC]" />
        <KPICard icon={Target} label="Tasks" value={String(data.summary.totalTasks)} sub={`${tasksByStatus.completed} done`} color="text-orange-600" />
        <KPICard icon={Flag} label="Milestones" value={String(data.summary.totalMilestones)} sub="4 types" color="text-emerald-600" />
        <KPICard icon={DollarSign} label="Budget" value={`$${(data.summary.totalBudget / 1000).toFixed(0)}K`} sub="Total investment" color="text-purple-600" />
        <KPICard icon={TrendingUp} label="Progress" value={`${totalProgress}%`} sub="Overall" color="text-[#FF6A00]" />
        <KPICard icon={AlertTriangle} label="Risks" value={String(data.phases.reduce((a, p) => a + p.risks.length, 0))} sub="Tracked" color="text-red-500" />
      </div>

      {/* ─── Status Breakdown ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(tasksByStatus).map(([status, count]) => {
          const cfg = STATUS_CONFIG[status]
          return (
            <div key={status} className={`flex items-center gap-3 p-3 rounded-lg border ${cfg.color} border-opacity-50`}>
              <div className={`h-2.5 w-2.5 rounded-full ${cfg.dotColor}`} />
              <div className="flex-1">
                <div className="text-xs font-medium opacity-70">{cfg.label}</div>
                <div className="text-lg font-bold">{count}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ─── Overall Progress Bar ────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Overall Roadmap Progress</span>
            <span className="text-sm font-bold text-[#003ABC]">{totalProgress}%</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden flex">
            {data.phases.map((phase) => {
              const phaseTasks = phase.streams.flatMap((s) => s.tasks)
              if (phaseTasks.length === 0) return null
              const phasePercent = phaseTasks.reduce((s, t) => s + t.percentComplete, 0) / phaseTasks.length
              const width = (phasePercent * phaseTasks.length) / data.summary.totalTasks
              return (
                <div
                  key={phase.id}
                  className={`h-full bg-gradient-to-r ${PHASE_GRADIENTS[phase.id] || 'bg-slate-500'} transition-all duration-500`}
                  style={{ width: `${width}%` }}
                  title={`${phase.name}: ${Math.round(phasePercent)}%`}
                />
              )
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-3">
            {data.phases.map((phase) => {
              const phaseTasks = phase.streams.flatMap((s) => s.tasks)
              const pct = phaseTasks.length > 0
                ? Math.round(phaseTasks.reduce((s, t) => s + t.percentComplete, 0) / phaseTasks.length)
                : 0
              return (
                <button
                  key={phase.id}
                  onClick={() => setSelectedPhase(selectedPhase === phase.id ? null : phase.id)}
                  className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors ${
                    selectedPhase === phase.id
                      ? `text-white bg-gradient-to-r ${PHASE_GRADIENTS[phase.id]}`
                      : 'bg-muted hover:bg-muted/80'
                  }`}
                >
                  <div className={`h-2 w-2 rounded-full bg-gradient-to-r ${PHASE_GRADIENTS[phase.id]}`} />
                  {phase.name} ({pct}%)
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* ─── Stream Filter ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Streams:</span>
        <Button
          variant={selectedStream === null ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedStream(null)}
          className="h-7 text-xs"
        >
          All Streams
        </Button>
        {data.streams.map((stream) => {
          const Icon = STREAM_ICONS[stream.id] || Zap
          return (
            <Button
              key={stream.id}
              variant={selectedStream === stream.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedStream(selectedStream === stream.id ? null : stream.id)}
              className={`h-7 text-xs gap-1 ${
                selectedStream === stream.id ? `bg-gradient-to-r ${STREAM_COLORS[stream.id]} hover:${STREAM_COLORS[stream.id]}` : ''
              }`}
            >
              <Icon className="h-3 w-3" />
              {stream.name}
            </Button>
          )
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════════════ */}
      {/* PHASES VIEW ───────────────────────────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════════════════ */}
      {viewMode === 'phases' && (
        <div className="space-y-4">
          {filteredPhases.map((phase) => {
            const isExpanded = expandedPhases.has(phase.id)
            const phaseTasks = phase.streams.flatMap((s) => s.tasks)
            const phaseProgress = phaseTasks.length > 0
              ? Math.round(phaseTasks.reduce((s, t) => s + t.percentComplete, 0) / phaseTasks.length)
              : 0

            return (
              <Card key={phase.id} className="overflow-hidden">
                {/* Phase Header */}
                <button
                  className="w-full text-left"
                  onClick={() => togglePhase(phase.id)}
                >
                  <div className={`bg-gradient-to-r ${PHASE_GRADIENTS[phase.id] || 'bg-slate-600'} p-4 text-white`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
                          <span className="text-sm font-bold">P{phase.id.split('-')[1]}</span>
                        </div>
                        <div>
                          <h3 className="text-lg font-bold">{phase.name}</h3>
                          <p className="text-sm text-white/80">
                            Weeks {phase.weekStart}–{phase.weekEnd} · ${phase.budget.toLocaleString()} budget
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                          <div className="text-sm font-semibold">{phaseProgress}%</div>
                          <div className="text-xs text-white/70">{phaseTasks.length} tasks</div>
                        </div>
                        {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                      </div>
                    </div>
                    <Progress value={phaseProgress} className="mt-3 h-1.5 bg-white/20" />
                  </div>
                </button>

                {/* Phase Description */}
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground mb-4">{phase.description}</p>

                  {/* Stream Summary Badges */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {phase.streams.map((stream) => {
                      const StreamIcon = STREAM_ICONS[stream.id] || Zap
                      const streamTasks = stream.tasks
                      const streamDone = streamTasks.filter((t) => t.status === 'completed').length
                      return (
                        <Badge key={stream.id} variant="outline" className="gap-1 text-xs">
                          <StreamIcon className="h-3 w-3" />
                          {stream.name}: {streamDone}/{streamTasks.length}
                        </Badge>
                      )
                    })}
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="space-y-4 mt-2">
                      {/* Milestones */}
                      {phase.milestones.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                            <Flag className="h-3.5 w-3.5" /> Milestones
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {phase.milestones.map((ms) => {
                              const MsIcon = MILESTONE_ICONS[ms.type] || Flag
                              return (
                                <button
                                  key={ms.id}
                                  onClick={() => setDetailMilestone(ms)}
                                  className="flex items-start gap-2.5 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
                                >
                                  <div className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-md ${
                                    ms.type === 'release' ? 'bg-blue-100 text-blue-600' :
                                    ms.type === 'certification' ? 'bg-emerald-100 text-emerald-600' :
                                    ms.type === 'revenue' ? 'bg-amber-100 text-amber-600' :
                                    'bg-slate-100 text-slate-600'
                                  }`}>
                                    <MsIcon className="h-3.5 w-3.5" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium truncate">{ms.name}</div>
                                    <div className="text-xs text-muted-foreground">Week {ms.week} · {ms.type}</div>
                                  </div>
                                  <Badge variant="outline" className="text-[10px] shrink-0">
                                    W{ms.week}
                                  </Badge>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Streams */}
                      {phase.streams.map((stream) => {
                        const isStreamExpanded = expandedStreams.has(`${phase.id}-${stream.id}`)
                        const StreamIcon = STREAM_ICONS[stream.id] || Zap
                        return (
                          <div key={`${phase.id}-${stream.id}`} className={`rounded-lg border p-3 ${STREAM_BG_COLORS[stream.id] || ''}`}>
                            <button
                              className="w-full flex items-center justify-between text-left"
                              onClick={() => toggleStream(`${phase.id}-${stream.id}`)}
                            >
                              <div className="flex items-center gap-2">
                                <StreamIcon className={`h-4 w-4 ${STREAM_TEXT_COLORS[stream.id]}`} />
                                <span className="text-sm font-semibold">{stream.name}</span>
                                <Badge variant="outline" className="text-[10px]">
                                  {stream.tasks.length} tasks
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-medium ${STREAM_TEXT_COLORS[stream.id]}`}>
                                  {stream.tasks.filter((t) => t.status === 'completed').length}/{stream.tasks.length} done
                                </span>
                                {isStreamExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </div>
                            </button>

                            {isStreamExpanded && (
                              <div className="mt-3 space-y-2">
                                {stream.tasks.map((task) => {
                                  const statusCfg = STATUS_CONFIG[task.status]
                                  const weekSpan = task.weeks[1] - task.weeks[0] + 1
                                  return (
                                    <button
                                      key={task.id}
                                      onClick={() => setDetailTask(task)}
                                      className="w-full flex items-center gap-3 p-2.5 rounded-md border bg-background hover:bg-muted/50 transition-colors text-left"
                                    >
                                      <div className={`h-2 w-2 rounded-full shrink-0 ${statusCfg.dotColor}`} />
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs font-medium truncate">{task.name}</div>
                                        <div className="text-[10px] text-muted-foreground">
                                          W{task.weeks[0]}–W{task.weeks[1]} · {task.assignee} · {weekSpan}w
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <div className="w-16">
                                          <Progress value={task.percentComplete} className="h-1.5" />
                                        </div>
                                        <span className="text-[10px] font-medium w-8 text-right">{task.percentComplete}%</span>
                                      </div>
                                    </button>
                                  )
                                })}

                                {/* Deliverables */}
                                {stream.deliverables.length > 0 && (
                                  <div className="mt-2 pt-2 border-t">
                                    <div className="text-[10px] font-medium text-muted-foreground uppercase mb-1">Deliverables</div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {stream.deliverables.map((d, i) => (
                                        <Badge key={i} variant="secondary" className="text-[10px]">
                                          {d.name}{d.count ? ` (${d.count}${d.unit || ''})` : ''}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}

                      {/* Risks */}
                      {phase.risks.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 text-red-500" /> Risks
                          </h4>
                          <div className="space-y-2">
                            {phase.risks.map((risk) => (
                              <div key={risk.id} className="flex items-start gap-2.5 p-3 rounded-lg border border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900">
                                <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
                                  risk.probability === 'high' ? 'bg-red-500' :
                                  risk.probability === 'medium' ? 'bg-amber-500' : 'bg-green-500'
                                }`} />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-medium">{risk.description}</div>
                                  <div className="text-[10px] text-muted-foreground mt-0.5">
                                    <Badge variant="outline" className="text-[9px] mr-1">{risk.probability}</Badge>
                                    <Badge variant="outline" className="text-[9px] mr-1">impact: {risk.impact}</Badge>
                                  </div>
                                  <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-1">
                                    Mitigation: {risk.mitigation}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════════ */}
      {/* TIMELINE VIEW ─────────────────────────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════════════════ */}
      {viewMode === 'timeline' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">52-Week Gantt Timeline</CardTitle>
            <CardDescription>Task distribution across the full execution timeline</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <ScrollArea className="w-full" style={{ maxHeight: '600px' }}>
              <div className="min-w-[900px]">
                {/* Week Headers */}
                <div className="flex items-center mb-2">
                  <div className="w-48 shrink-0" />
                  <div className="flex-1 flex">
                    {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => {
                      const phase = data.phases.find((p) => w >= p.weekStart && w <= p.weekEnd)
                      return (
                        <div
                          key={w}
                          className="flex-1 min-w-[14px] text-center text-[8px] text-muted-foreground border-l border-border/50"
                          title={`Week ${w}`}
                        >
                          {w % 4 === 1 ? `W${w}` : ''}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Phase separator rows */}
                {data.phases.map((phase) => {
                  const phaseTasks = phase.streams.flatMap((s) => s.tasks)
                  if (selectedStream) {
                    const filtered = phase.streams.find((s) => s.id === selectedStream)?.tasks || []
                    if (filtered.length === 0) return null
                  }
                  return (
                    <React.Fragment key={phase.id}>
                      {/* Phase Label Row */}
                      <div className="flex items-center mb-1 mt-3">
                        <div className="w-48 shrink-0">
                          <div className={`text-[10px] font-bold px-2 py-0.5 rounded text-white inline-block bg-gradient-to-r ${PHASE_GRADIENTS[phase.id]}`}>
                            {phase.name}
                          </div>
                        </div>
                        <div className="flex-1 flex h-5">
                          {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => (
                            <div
                              key={w}
                              className={`flex-1 min-w-[14px] border-l border-border/30 ${
                                w >= phase.weekStart && w <= phase.weekEnd
                                  ? `bg-gradient-to-b ${PHASE_GRADIENTS[phase.id]} opacity-10`
                                  : ''
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Task Rows */}
                      {phase.streams
                        .filter((s) => !selectedStream || s.id === selectedStream)
                        .flatMap((stream) =>
                          stream.tasks.map((task) => (
                            <div key={task.id} className="flex items-center mb-0.5 group">
                              <div className="w-48 shrink-0 pr-2">
                                <div className="text-[9px] font-medium truncate group-hover:text-foreground transition-colors" title={task.name}>
                                  {task.name}
                                </div>
                              </div>
                              <div className="flex-1 flex h-4 relative">
                                {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => {
                                  const isInRange = w >= task.weeks[0] && w <= task.weeks[1]
                                  const statusColor =
                                    task.status === 'completed' ? STREAM_COLORS[stream.id] || 'bg-blue-500' :
                                    task.status === 'in_progress' ? `${STREAM_COLORS[stream.id] || 'bg-blue-500'} opacity-70` :
                                    task.status === 'blocked' ? 'bg-red-400' :
                                    `${STREAM_COLORS[stream.id] || 'bg-blue-500'} opacity-30`
                                  return (
                                    <div
                                      key={w}
                                      className={`flex-1 min-w-[14px] ${isInRange ? statusColor : 'border-l border-border/20'}`}
                                      title={`${task.name}: W${task.weeks[0]}–W${task.weeks[1]} (${task.percentComplete}%)`}
                                    />
                                  )
                                })}
                              </div>
                            </div>
                          ))
                      )}
                    </React.Fragment>
                  )
                })}

                {/* Milestone markers */}
                <div className="flex items-center mt-4">
                  <div className="w-48 shrink-0">
                    <span className="text-[10px] font-bold text-muted-foreground">MILESTONES</span>
                  </div>
                  <div className="flex-1 flex h-6 relative">
                    {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => {
                      const ms = data.phases.flatMap((p) => p.milestones).find((m) => m.week === w)
                      return (
                        <div key={w} className="flex-1 min-w-[14px] relative">
                          {ms && (
                            <div
                              className="absolute -top-1 left-1/2 -translate-x-1/2 cursor-pointer"
                              onClick={() => setDetailMilestone(ms)}
                            >
                              <div className={`h-3 w-3 rotate-45 rounded-sm ${
                                ms.type === 'release' ? 'bg-blue-500' :
                                ms.type === 'certification' ? 'bg-emerald-500' :
                                ms.type === 'revenue' ? 'bg-amber-500' :
                                'bg-slate-500'
                              }`} title={ms.name} />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════════ */}
      {/* STREAMS VIEW ──────────────────────────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════════════════ */}
      {viewMode === 'streams' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.streams.map((streamDef) => {
            const Icon = STREAM_ICONS[streamDef.id] || Zap
            const streamPhases = data.phases.map((phase) => ({
              ...phase,
              stream: phase.streams.find((s) => s.id === streamDef.id)!,
            })).filter((p) => p.stream)

            const allStreamTasks = streamPhases.flatMap((p) => p.stream.tasks)
            const streamProgress = allStreamTasks.length > 0
              ? Math.round(allStreamTasks.reduce((s, t) => s + t.percentComplete, 0) / allStreamTasks.length)
              : 0
            const streamBudget = streamPhases.reduce((sum, p) => sum + Math.round(p.budget / 4), 0)

            return (
              <Card key={streamDef.id} className="overflow-hidden">
                <div className={`bg-gradient-to-r ${STREAM_COLORS[streamDef.id]} p-4 text-white`}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-bold">{streamDef.name}</h3>
                      <p className="text-xs text-white/80 mt-0.5">{streamDef.description.slice(0, 80)}...</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <div className="text-center">
                      <div className="text-lg font-bold">{allStreamTasks.length}</div>
                      <div className="text-[10px] text-white/70">Total Tasks</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold">{streamProgress}%</div>
                      <div className="text-[10px] text-white/70">Progress</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold">${streamBudget}K</div>
                      <div className="text-[10px] text-white/70">Est. Budget</div>
                    </div>
                  </div>
                </div>
                <CardContent className="p-4 space-y-3">
                  {streamPhases.map((sp) => {
                    const phaseDone = sp.stream.tasks.filter((t) => t.status === 'completed').length
                    return (
                      <div key={sp.id} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">{sp.name}</span>
                          <span className="text-[10px] text-muted-foreground">{phaseDone}/{sp.stream.tasks.length}</span>
                        </div>
                        <Progress value={sp.stream.tasks.length > 0
                          ? (sp.stream.tasks.reduce((s, t) => s + t.percentComplete, 0) / sp.stream.tasks.length)
                          : 0
                        } className="h-1.5" />
                        <div className="flex flex-wrap gap-1">
                          {sp.stream.tasks.slice(0, 4).map((t) => {
                            const cfg = STATUS_CONFIG[t.status]
                            return (
                              <Badge key={t.id} variant="outline" className="text-[9px] gap-1">
                                <div className={`h-1.5 w-1.5 rounded-full ${cfg.dotColor}`} />
                                <span className="truncate max-w-[120px]">{t.name}</span>
                              </Badge>
                            )
                          })}
                          {sp.stream.tasks.length > 4 && (
                            <Badge variant="secondary" className="text-[9px]">
                              +{sp.stream.tasks.length - 4} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ─── Budget Distribution ────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-600" />
            Budget Distribution
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {data.phases.map((phase) => {
              const pct = Math.round((phase.budget / data.summary.totalBudget) * 100)
              return (
                <div key={phase.id} className="text-center">
                  <div className={`h-20 rounded-lg bg-gradient-to-b ${PHASE_GRADIENTS[phase.id]} flex flex-col items-center justify-center text-white`}
                  >
                    <span className="text-lg font-bold">${(phase.budget / 1000).toFixed(0)}K</span>
                    <span className="text-[10px] text-white/80">{pct}%</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1.5 font-medium">
                    W{phase.weekStart}–{phase.weekEnd}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {phase.name}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total Investment</span>
            <span className="font-bold text-emerald-600">${data.summary.totalBudget.toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>

      {/* ─── Task Detail Dialog ──────────────────────────────────────────────── */}
      <Dialog open={!!detailTask} onOpenChange={() => setDetailTask(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">{detailTask?.name}</DialogTitle>
            <DialogDescription>Task Details</DialogDescription>
          </DialogHeader>
          {detailTask && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge className={STATUS_CONFIG[detailTask.status].color}>
                  {STATUS_CONFIG[detailTask.status].label}
                </Badge>
                <span className="text-xs text-muted-foreground">{detailTask.id}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Timeline</div>
                  <div className="font-medium">Week {detailTask.weeks[0]} – {detailTask.weeks[1]}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Duration</div>
                  <div className="font-medium">{detailTask.weeks[1] - detailTask.weeks[0] + 1} weeks</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Assignee</div>
                  <div className="font-medium">{detailTask.assignee}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Progress</div>
                  <div className="font-medium">{detailTask.percentComplete}%</div>
                </div>
              </div>
              <Progress value={detailTask.percentComplete} className="h-2" />
              {detailTask.deps.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Dependencies</div>
                  <div className="flex flex-wrap gap-1">
                    {detailTask.deps.map((dep) => (
                      <Badge key={dep} variant="outline" className="text-[10px] font-mono">
                        {dep}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Milestone Detail Dialog ──────────────────────────────────────────── */}
      <Dialog open={!!detailMilestone} onOpenChange={() => setDetailMilestone(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              {detailMilestone && (() => {
                const Icon = MILESTONE_ICONS[detailMilestone.type] || Flag
                return <Icon className="h-4 w-4" />
              })()}
              {detailMilestone?.name}
            </DialogTitle>
            <DialogDescription>Milestone Details</DialogDescription>
          </DialogHeader>
          {detailMilestone && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline">Week {detailMilestone.week}</Badge>
                <Badge variant="outline">{detailMilestone.type}</Badge>
                <Badge variant="outline">{detailMilestone.stream}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{detailMilestone.description}</p>
              {detailMilestone.kpis.length > 0 && (
                <div>
                  <div className="text-xs font-medium mb-1.5">Key Performance Indicators</div>
                  <div className="space-y-1">
                    {detailMilestone.kpis.map((kpi, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <CheckCircle className="h-3 w-3 text-emerald-500 shrink-0" />
                        {kpi}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Sub-Components ──────────────────────────────────────────────────────

function KPICard({ icon: Icon, label, value, sub, color }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub: string
  color: string
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </Card>
  )
}