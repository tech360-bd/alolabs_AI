'use client'

import React, { useState, useEffect } from 'react'
import { fetchApi } from '@/lib/api'
import {
  Rocket, Smartphone, ShieldCheck, TrendingUp, AlertTriangle, Building2,
  Bot, CheckCircle, Clock, Target, DollarSign, Users, Zap, ArrowRight,
  Globe, Calendar, BarChart3, Activity, ChevronRight, ClipboardList
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { EnterpriseView } from '../enterprise-shell'

// ─── Types ────────────────────────────────────────────────────────────────────
interface DCCCriterion {
  id: string
  name: string
  target: number
  current: number
  unit: string
  status: string
  description: string
}

interface DCCData {
  criteria: DCCCriterion[]
  overallScore: number
  certified: boolean
  totalCriteria: number
  passingCriteria: number
}

interface MobileApp {
  id: string
  name: string
  platform: string
  status: string
  priority: number
  progress: number
  purpose: string
  features: string[]
 techStack: string[]
  screens: number
  apiEndpoints: number
  sprintWeeks: number
  targetLaunch: string
  revenueImpact: string
}

interface MobileAppsData {
  apps: MobileApp[]
  total: number
}

interface StrategicPanelProps {
  onNavigate?: (view: EnterpriseView) => void
}

// ─── Vision Card ──────────────────────────────────────────────────────────────
function VisionCard() {
  return (
    <Card className="border-none shadow-lg overflow-hidden">
      <div className="bg-gradient-to-r from-[#003ABC] to-[#0055D4] p-6 text-white">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <Rocket className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold">ALO Labs Strategic Command</h2>
                <p className="text-sm text-blue-100">AI Enterprise Operating System</p>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-blue-50 max-w-2xl mt-2">
              "ALO Labs powers 1 million businesses globally with AI-native infrastructure, making enterprise-grade AI
              accessible to everyone, everywhere, in every language."
            </p>
            <div className="flex items-center gap-2 mt-3">
              <Badge variant="secondary" className="bg-[#FF6A00] text-white border-0 text-xs font-semibold">
                Founder: Al Aminn
              </Badge>
              <Badge variant="secondary" className="bg-white/20 text-white border-0 text-xs">
                alolabs.net
              </Badge>
            </div>
          </div>
        </div>
      </div>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Departments', value: '100', icon: Building2, color: 'text-[#003ABC]' },
            { label: 'AI Employees', value: '2,000', icon: Bot, color: 'text-[#FF6A00]' },
            { label: 'Skills', value: '10,000', icon: Zap, color: 'text-emerald-600' },
            { label: 'Divisions', value: '12', icon: Globe, color: 'text-purple-600' },
          ].map((item) => (
            <div key={item.label} className="text-center">
              <item.icon className={`h-5 w-5 mx-auto mb-1 ${item.color}`} />
              <p className="text-lg font-bold text-slate-900 dark:text-white">{item.value}</p>
              <p className="text-xs text-slate-500">{item.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Mobile Apps Status ───────────────────────────────────────────────────────
function MobileAppsSection({ data, loading }: { data: MobileAppsData | null; loading: boolean }) {
  const appIcons = [
    { icon: Users, color: 'bg-[#003ABC]', label: 'Customer' },
    { icon: BarChart3, color: 'bg-[#FF6A00]', label: 'Admin' },
    { icon: Bot, color: 'bg-emerald-600', label: 'Agent Mgmt' },
    { icon: DollarSign, color: 'bg-purple-600', label: 'Reseller' },
  ]

  if (loading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full rounded-xl" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const apps = data?.apps ?? []

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-[#FF6A00]" />
            <CardTitle className="text-base">4 Mobile Applications</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs">Flutter • iOS + Android</Badge>
        </div>
        <CardDescription className="text-xs">Complete mobile ecosystem for customers, admins, agents, and resellers</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {apps.map((app, i) => {
            const meta = appIcons[i] ?? appIcons[0]
            const statusColor = app.status === 'planned' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
              : app.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
            const revenueColor = app.revenueImpact === 'HIGH' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'

            return (
              <Card key={app.id} className="border shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${meta.color} text-white`}>
                      <meta.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{app.name.replace('ALO ', '')}</p>
                      <p className="text-[10px] text-slate-500">{meta.label}</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-3 line-clamp-2">{app.purpose}</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Progress</span>
                      <span className="font-medium">{app.progress}%</span>
                    </div>
                    <Progress value={app.progress} className="h-1.5" />
                    <div className="flex gap-1.5 flex-wrap">
                      <Badge className={`text-[10px] px-1.5 py-0 ${statusColor}`}>{app.status}</Badge>
                      <Badge className={`text-[10px] px-1.5 py-0 ${revenueColor}`}>{app.revenueImpact}</Badge>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-1">
                      <Calendar className="h-3 w-3" />
                      <span>{app.targetLaunch}</span>
                    </div>
                    <div className="flex gap-3 text-[10px] text-slate-400">
                      <span>{app.screens} screens</span>
                      <span>{app.apiEndpoints} APIs</span>
                      <span>{app.sprintWeeks}w sprint</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── DCC Certification Dashboard ──────────────────────────────────────────────
function DCCSection({ data, loading }: { data: DCCData | null; loading: boolean }) {
  if (loading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-80 w-full rounded-xl" /></CardContent>
      </Card>
    )
  }

  const criteria = data?.criteria ?? []
  const overallScore = data?.overallScore ?? 0

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'improving': return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[10px]">Improving</Badge>
      case 'building': return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]">Building</Badge>
      case 'passed': return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">Passed</Badge>
      default: return <Badge variant="outline" className="text-[10px]">{status}</Badge>
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#003ABC]" />
            <CardTitle className="text-base">DCC Certification Dashboard</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {data?.passingCriteria ?? 0}/{data?.totalCriteria ?? 9} passing
            </Badge>
            <Badge className={`text-xs ${overallScore >= 90 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
              Overall: {overallScore}%
            </Badge>
          </div>
        </div>
        <CardDescription className="text-xs">Department Certification Criteria — 9 enterprise quality gates</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <Card className="border-dashed bg-gradient-to-br from-blue-50 to-transparent dark:from-blue-950/20 dark:to-transparent">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-[#003ABC]">{overallScore}%</p>
              <p className="text-xs text-slate-500 mt-1">Overall DCC Score</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Target: 100% for certification</p>
            </CardContent>
          </Card>
          <Card className="border-dashed bg-gradient-to-br from-orange-50 to-transparent dark:from-orange-950/20 dark:to-transparent">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-[#FF6A00]">{data?.passingCriteria ?? 0}</p>
              <p className="text-xs text-slate-500 mt-1">Criteria Near Passing (≥90%)</p>
              <p className="text-[10px] text-slate-400 mt-0.5">of {data?.totalCriteria ?? 9} total criteria</p>
            </CardContent>
          </Card>
          <Card className="border-dashed bg-gradient-to-br from-emerald-50 to-transparent dark:from-emerald-950/20 dark:to-transparent">
            <CardContent className="p-4 text-center">
              <div className="flex items-center justify-center gap-1.5">
                {data?.certified ? (
                  <CheckCircle className="h-6 w-6 text-emerald-600" />
                ) : (
                  <Clock className="h-6 w-6 text-amber-500" />
                )}
              </div>
              <p className="text-sm font-semibold mt-1">
                {data?.certified ? 'DCC Certified' : 'In Progress'}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {data?.certified ? 'All criteria met' : 'Building toward certification'}
              </p>
            </CardContent>
          </Card>
        </div>
        <ScrollArea className="max-h-96">
          <div className="space-y-3">
            {criteria.map((c) => {
              const pct = Math.min(Math.round((c.current / c.target) * 100), 100)
              const isEscalation = c.id === 'DCC-009'
              const isPassing = isEscalation ? c.current <= c.target : c.current >= c.target * 0.9
              return (
                <div key={c.id} className="flex items-center gap-4 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-slate-400">{c.id}</span>
                      <span className="text-sm font-medium truncate">{c.name}</span>
                      {getStatusBadge(c.status)}
                    </div>
                    <p className="text-[10px] text-slate-500 mb-2 truncate">{c.description}</p>
                    <div className="flex items-center gap-3">
                      <Progress value={pct} className={`h-2 flex-1 ${isPassing ? '[&>div]:bg-emerald-500' : '[&>div]:bg-amber-500'}`} />
                      <span className="text-xs font-semibold w-16 text-right">
                        {c.current}{c.unit} <span className="text-slate-400 font-normal">/ {isEscalation ? '≤' : '≥'}{c.target}{c.unit}</span>
                      </span>
                    </div>
                  </div>
                  {isPassing ? (
                    <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : (
                    <ArrowRight className="h-4 w-4 text-amber-500 shrink-0" />
                  )}
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

// ─── Revenue Streams ──────────────────────────────────────────────────────────
function RevenueSection() {
  const currentStreams = [
    { name: 'Web Hosting', model: 'Subscriptions', status: 'active' },
    { name: 'Domain Registration', model: 'Per-domain fees', status: 'active' },
    { name: 'Ecommerce Platform', model: 'Platform fees + %', status: 'active' },
    { name: 'AI Services', model: 'Project + subscription', status: 'active' },
  ]

  const newStreams = [
    { name: 'AI-as-a-Service', potential: '$10K-50K/mo', impact: 'HIGH' },
    { name: 'WhatsApp AI', potential: '$5K-20K/mo', impact: 'HIGH' },
    { name: 'Multi-language Chatbot', potential: '$3K-15K/mo', impact: 'MEDIUM' },
    { name: 'AI Content Creation', potential: '$5K-25K/mo', impact: 'HIGH' },
    { name: 'AI Customer Support', potential: '$10K-30K/mo', impact: 'HIGH' },
    { name: 'AI Training', potential: '$5K-15K/mo', impact: 'MEDIUM' },
    { name: 'White-label AI', potential: '$20K-100K/mo', impact: 'CRITICAL' },
    { name: 'AI Marketplace', potential: '$5K-50K/mo', impact: 'HIGH' },
  ]

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'CRITICAL': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
      case 'HIGH': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
      default: return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-emerald-600" />
          <CardTitle className="text-base">Revenue Streams</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Current */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Current (Active)</p>
            <div className="space-y-2">
              {currentStreams.map((s) => (
                <div key={s.name} className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-sm font-medium">{s.name}</span>
                  </div>
                  <span className="text-[10px] text-slate-500">{s.model}</span>
                </div>
              ))}
            </div>
          </div>
          {/* New AI-Powered */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">New AI-Powered (Post AI-EOS)</p>
            <div className="space-y-2">
              {newStreams.map((s) => (
                <div key={s.name} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <div className="flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5 text-[#FF6A00]" />
                    <span className="text-sm font-medium">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500">{s.potential}</span>
                    <Badge className={`text-[9px] px-1.5 py-0 ${getImpactColor(s.impact)}`}>{s.impact}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <Separator className="my-4" />
        <div className="flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#003ABC]/5 dark:bg-[#003ABC]/10">
            <Target className="h-3.5 w-3.5 text-[#003ABC]" />
            <span className="text-slate-600 dark:text-slate-300">Year 1 ROI: <strong className="text-[#003ABC]">5-10x</strong></span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-slate-600 dark:text-slate-300">Y1 Revenue: <strong className="text-emerald-600">$500K-$2M</strong></span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Timeline / Roadmap ───────────────────────────────────────────────────────
function TimelineSection() {
  const phases = [
    {
      month: 'Month 1',
      title: 'Foundation',
      items: ['100 departments deployed', 'Customer App MVP', 'Admin App MVP', '500+ core AI agents', 'DCC framework established'],
      color: 'border-[#003ABC]',
      bg: 'bg-[#003ABC]/5 dark:bg-[#003ABC]/10',
      dot: 'bg-[#003ABC]',
    },
    {
      month: 'Month 3',
      title: 'Growth',
      items: ['2,000 agents operational', 'All 4 apps in beta', 'AI service revenue active', 'First reseller partners', 'DCC: 50+ departments'],
      color: 'border-[#FF6A00]',
      bg: 'bg-[#FF6A00]/5 dark:bg-[#FF6A00]/10',
      dot: 'bg-[#FF6A00]',
    },
    {
      month: 'Month 6',
      title: 'Expansion',
      items: ['200+ departments, 5K+ agents', 'SE Asia expansion', 'AI marketplace live', 'White-label solutions', 'DCC: 150+ departments'],
      color: 'border-purple-500',
      bg: 'bg-purple-50 dark:bg-purple-950/20',
      dot: 'bg-purple-500',
    },
    {
      month: 'Month 12',
      title: 'Market Leadership',
      items: ['300+ depts, 8K+ agents', 'Market leader status', '10x customer growth', '3+ countries', 'Full DCC certification'],
      color: 'border-emerald-500',
      bg: 'bg-emerald-50 dark:bg-emerald-950/20',
      dot: 'bg-emerald-500',
    },
  ]

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-purple-600" />
          <CardTitle className="text-base">Roadmap Timeline</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {phases.map((phase) => (
            <Card key={phase.month} className={`${phase.bg} border-l-4 ${phase.color}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${phase.dot}`} />
                  <span className="text-xs font-bold text-slate-900 dark:text-white">{phase.month}</span>
                </div>
                <p className="text-sm font-semibold mb-3">{phase.title}</p>
                <ul className="space-y-1.5">
                  {phase.items.map((item) => (
                    <li key={item} className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                      <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-slate-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Risk Register ────────────────────────────────────────────────────────────
function RiskSection() {
  const risks = [
    {
      name: 'AI API Costs Spiral',
      probability: 'Medium',
      impact: 'High',
      mitigation: 'Multi-model strategy, caching, fine-tuning local models',
      level: 'warning' as const,
    },
    {
      name: 'Security Breach',
      probability: 'Low',
      impact: 'Critical',
      mitigation: 'Security-first, regular audits, cyber insurance',
      level: 'critical' as const,
    },
    {
      name: 'Competitor Copies Fast',
      probability: 'High',
      impact: 'Medium',
      mitigation: 'Speed of execution, data moat, domain expertise',
      level: 'warning' as const,
    },
    {
      name: 'Team Scaling Issues',
      probability: 'Medium',
      impact: 'High',
      mitigation: 'Strong culture, competitive comp, remote-first',
      level: 'warning' as const,
    },
    {
      name: 'Founder Burnout',
      probability: 'Medium',
      impact: 'High',
      mitigation: 'Delegate to AI, hire leadership, build systems',
      level: 'warning' as const,
    },
  ]

  const getLevelStyle = (level: string) => {
    switch (level) {
      case 'critical': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
      default: return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <CardTitle className="text-base">Risk Register</CardTitle>
        </div>
        <CardDescription className="text-xs">Top 5 strategic risks with mitigation strategies</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {risks.map((risk, i) => (
            <div key={risk.name} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                <span className="text-xs font-bold text-amber-700 dark:text-amber-400">{i + 1}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-sm font-semibold">{risk.name}</span>
                  <Badge className={`text-[10px] px-1.5 py-0 ${getLevelStyle(risk.level)}`}>{risk.impact}</Badge>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-1.5">
                  <span className="font-medium">Prob:</span> {risk.probability}
                  <span className="mx-2">•</span>
                  <span className="font-medium">Impact:</span> {risk.impact}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-slate-600 dark:text-slate-300">Mitigation:</span> {risk.mitigation}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Quick Actions + KPIs ─────────────────────────────────────────────────────
function QuickActionsSection({ onNavigate }: { onNavigate?: (view: EnterpriseView) => void }) {
  const actions = [
    { label: 'View Departments', icon: Building2, view: 'department-hub' as EnterpriseView, color: 'text-[#003ABC] bg-[#003ABC]/10' },
    { label: 'View AI Agents', icon: Bot, view: 'ai-employees' as EnterpriseView, color: 'text-[#FF6A00] bg-[#FF6A00]/10' },
    { label: 'Run Audit', icon: ShieldCheck, view: 'audit-engine' as EnterpriseView, color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30' },
    { label: 'View SOPs', icon: ClipboardList, view: 'sop-system' as EnterpriseView, color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30' },
  ]

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-[#FF6A00]" />
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {actions.map((action) => (
            <Button
              key={action.label}
              variant="outline"
              className="h-auto py-4 flex flex-col items-center gap-2 hover:shadow-md transition-all"
              onClick={() => onNavigate?.(action.view)}
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${action.color}`}>
                <action.icon className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium">{action.label}</span>
              <ChevronRight className="h-3 w-3 text-slate-400" />
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function ExecutiveKPIs() {
  const kpis = [
    { label: 'Revenue Growth', value: '5-10x', sub: '12-month target', icon: TrendingUp, color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30' },
    { label: 'Customer Base', value: '10x', sub: '12-month target', icon: Users, color: 'text-[#003ABC] bg-[#003ABC]/10' },
    { label: 'Uptime SLA', value: '99.9%', sub: 'Target', icon: Activity, color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30' },
    { label: 'NPS Score', value: '≥70', sub: 'Target', icon: Target, color: 'text-[#FF6A00] bg-[#FF6A00]/10' },
    { label: 'AI Response', value: '<2s', sub: 'Target latency', icon: Zap, color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30' },
    { label: 'DCC Criteria', value: '9/9', sub: 'All ≥90% by M6', icon: ShieldCheck, color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30' },
  ]

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-[#003ABC]" />
          <CardTitle className="text-base">Executive KPIs</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="flex flex-col items-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-center">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${kpi.color} mb-2`}>
                <kpi.icon className="h-4 w-4" />
              </div>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{kpi.value}</p>
              <p className="text-[10px] text-slate-500 leading-tight mt-0.5">{kpi.label}</p>
              <p className="text-[9px] text-slate-400">{kpi.sub}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main Panel ───────────────────────────────────────────────────────────────
export default function StrategicCommandPanel({ onNavigate }: StrategicPanelProps) {
  const [dccData, setDccData] = useState<DCCData | null>(null)
  const [appsData, setAppsData] = useState<MobileAppsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const [dccData, appsData] = await Promise.all([
          fetchApi('/api/enterprise/dcc'),
          fetchApi('/api/enterprise/mobile-apps'),
        ])
        setDccData(dccData)
        setAppsData(appsData)
      } catch {
        // Data fetch failed — use empty state
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  return (
    <div className="space-y-6 p-6">
      {/* Vision */}
      <VisionCard />

      {/* KPIs */}
      <ExecutiveKPIs />

      {/* Mobile Apps */}
      <MobileAppsSection data={appsData} loading={loading} />

      {/* DCC Certification */}
      <DCCSection data={dccData} loading={loading} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Streams */}
        <RevenueSection />

        {/* Risk Register */}
        <RiskSection />
      </div>

      {/* Timeline */}
      <TimelineSection />

      {/* Quick Actions */}
      <QuickActionsSection onNavigate={onNavigate} />
    </div>
  )
}
