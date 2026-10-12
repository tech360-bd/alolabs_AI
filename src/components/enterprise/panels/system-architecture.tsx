'use client'

import React, { useState, useEffect } from 'react'
import {
  Network, Smartphone, Globe, Bot, Server, Database, HardDrive,
  Shield, Zap, ArrowDown, ArrowRight, ChevronDown, ChevronRight,
  CheckCircle, Clock, AlertCircle, Lock, Key, FileCheck, Monitor,
  Wifi, Layers, Cpu, Activity
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import type { EnterpriseView } from '../enterprise-shell'
import { fetchApi } from '@/lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Integration {
  id: string
  name: string
  category: string
  status: string
  protocol: string
  purpose: string
  dataFlow: string
  securityLevel: string
}

interface IntegrationsData {
  integrations: Integration[]
  total: number
  byCategory: Record<string, number>
  byStatus: Record<string, number>
}

interface ArchitecturePanelProps {
  onNavigate?: (view: EnterpriseView) => void
}

// ─── Layer Colors ─────────────────────────────────────────────────────────────
const layerColors: Record<number, { bg: string; border: string; text: string; badge: string }> = {
  6: { bg: 'bg-orange-50 dark:bg-orange-950/20', border: 'border-orange-200 dark:border-orange-800/50', text: 'text-orange-800 dark:text-orange-300', badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  5: { bg: 'bg-blue-50 dark:bg-blue-950/20', border: 'border-blue-200 dark:border-blue-800/50', text: 'text-blue-800 dark:text-blue-300', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  4: { bg: 'bg-purple-50 dark:bg-purple-950/20', border: 'border-purple-200 dark:border-purple-800/50', text: 'text-purple-800 dark:text-purple-300', badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  3: { bg: 'bg-emerald-50 dark:bg-emerald-950/20', border: 'border-emerald-200 dark:border-emerald-800/50', text: 'text-emerald-800 dark:text-emerald-300', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  2: { bg: 'bg-amber-50 dark:bg-amber-950/20', border: 'border-amber-200 dark:border-amber-800/50', text: 'text-amber-800 dark:text-amber-300', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  1: { bg: 'bg-slate-100 dark:bg-slate-800/50', border: 'border-slate-300 dark:border-slate-700', text: 'text-slate-800 dark:text-slate-300', badge: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300' },
}

// ─── Layer Data ───────────────────────────────────────────────────────────────
const layers = [
  {
    id: 6,
    name: 'Mobile Apps (Flutter)',
    icon: Smartphone,
    components: [
      { name: 'ALO Customer App', detail: '45+ screens, Riverpod, GoRouter' },
      { name: 'ALO Admin App', detail: '60+ screens, MFA TOTP, role guards' },
      { name: 'ALO Agent Management App', detail: '35+ screens, live telemetry' },
      { name: 'ALO Reseller App', detail: '40+ screens, offline orders' },
    ],
    protocol: 'REST + WebSocket + FCM',
  },
  {
    id: 5,
    name: 'Web Platform (Next.js 16)',
    icon: Globe,
    components: [
      { name: 'Enterprise Shell', detail: '29 lazy-loaded panels' },
      { name: 'Public Website', detail: 'Marketing & landing pages' },
      { name: 'Admin Dashboard', detail: 'System management' },
      { name: 'API Gateway (Caddy)', detail: 'XTransformPort routing' },
    ],
    protocol: 'REST + WebSocket',
  },
  {
    id: 4,
    name: 'AI Agent Layer',
    icon: Bot,
    components: [
      { name: '2,000 AI Agents', detail: '100 departments, 20/dept' },
      { name: '8 Cognitive Engines', detail: 'Memory, Planning, Reflection, etc.' },
      { name: 'Collaboration System', detail: 'Delegation, consensus, pipeline' },
      { name: 'Constitution Engine', detail: '500 rules, runtime enforcement' },
      { name: 'Self-Improvement Pipeline', detail: 'Reflect → Test → Deploy' },
    ],
    protocol: 'z-ai-web-dev-sdk',
  },
  {
    id: 3,
    name: 'Service Layer',
    icon: Zap,
    components: [
      { name: 'AI Router', detail: 'Multi-model: Claude, GPT-4, Gemini, Llama' },
      { name: 'Auth Service', detail: 'NextAuth v4 + MFA + OAuth + RBAC' },
      { name: 'Event Bus (Socket.io)', detail: 'Port 3003, P0-P4 priorities' },
      { name: 'Job Queue', detail: 'In-memory + Redis backing' },
      { name: 'RAG Engine', detail: 'Qdrant + chunking + retrieval' },
      { name: 'Integration Hub', detail: '20+ external adapters' },
    ],
    protocol: 'Protocol adapters',
  },
  {
    id: 2,
    name: 'Data Layer',
    icon: Database,
    components: [
      { name: 'PostgreSQL', detail: '134 Prisma models, 103K+ records' },
      { name: 'Redis 6.0.16', detail: 'Cache, sessions, rate limiting' },
      { name: 'Qdrant', detail: 'Vector embeddings, 10K+ chunks' },
      { name: 'Data Lake', detail: '15K+ entries, 5 source types' },
      { name: 'Knowledge Graph', detail: '2,500+ nodes, 5,000+ edges' },
    ],
    protocol: 'SQL / Redis / gRPC',
  },
  {
    id: 1,
    name: 'Infrastructure',
    icon: Server,
    components: [
      { name: 'Ubuntu 24.04 LTS', detail: 'Production server OS' },
      { name: 'Nginx', detail: 'Reverse proxy, SSL, gzip' },
      { name: 'PM2', detail: 'Process manager, cluster mode' },
      { name: 'Docker', detail: 'Containerization, Compose' },
      { name: 'Caddy', detail: 'Dev gateway, auto-TLS' },
      { name: 'Monitoring + Backup', detail: 'Health checks, daily backups' },
    ],
    protocol: 'TCP/IP, TLS 1.3',
  },
]

// ─── Tech Stack Data ──────────────────────────────────────────────────────────
const techStack = [
  { layer: 'L6 Mobile', name: 'Flutter', purpose: 'Cross-platform UI framework', decision: 'Build', status: 'planned' },
  { layer: 'L6 Mobile', name: 'Riverpod', purpose: 'State management', decision: 'Buy', status: 'planned' },
  { layer: 'L6 Mobile', name: 'GoRouter', purpose: 'Declarative navigation', decision: 'Buy', status: 'planned' },
  { layer: 'L6 Mobile', name: 'Dio', purpose: 'HTTP client with interceptors', decision: 'Buy', status: 'planned' },
  { layer: 'L6 Mobile', name: 'Firebase (FCM)', purpose: 'Push notifications', decision: 'Integrate', status: 'planned' },
  { layer: 'L5 Web', name: 'Next.js 16', purpose: 'React framework with App Router', decision: 'Build', status: 'active' },
  { layer: 'L5 Web', name: 'TypeScript 5', purpose: 'Type-safe JavaScript', decision: 'Buy', status: 'active' },
  { layer: 'L5 Web', name: 'Tailwind CSS 4', purpose: 'Utility-first CSS', decision: 'Buy', status: 'active' },
  { layer: 'L5 Web', name: 'shadcn/ui', purpose: 'Component library (New York)', decision: 'Buy', status: 'active' },
  { layer: 'L5 Web', name: 'Caddy', purpose: 'Development gateway / reverse proxy', decision: 'Buy', status: 'active' },
  { layer: 'L4 AI', name: 'z-ai-web-dev-sdk', purpose: 'AI capabilities (LLM, VLM, TTS, ASR)', decision: 'Buy', status: 'active' },
  { layer: 'L4 AI', name: 'Claude/GPT-4/Gemini', purpose: 'Foundation AI models', decision: 'Integrate', status: 'active' },
  { layer: 'L3 Services', name: 'NextAuth.js v4', purpose: 'Authentication framework', decision: 'Build', status: 'active' },
  { layer: 'L3 Services', name: 'Socket.io', purpose: 'Real-time event bus (port 3003)', decision: 'Buy', status: 'active' },
  { layer: 'L3 Services', name: 'Zustand', purpose: 'Client state management', decision: 'Buy', status: 'active' },
  { layer: 'L3 Services', name: 'Zod', purpose: 'Schema validation', decision: 'Buy', status: 'active' },
  { layer: 'L2 Data', name: 'PostgreSQL', purpose: 'Primary relational database', decision: 'Buy', status: 'active' },
  { layer: 'L2 Data', name: 'Prisma ORM', purpose: 'Type-safe database access (134 models)', decision: 'Buy', status: 'active' },
  { layer: 'L2 Data', name: 'Redis 6.0.16', purpose: 'Cache, sessions, pub/sub', decision: 'Buy', status: 'active' },
  { layer: 'L2 Data', name: 'Qdrant', purpose: 'Vector database for RAG', decision: 'Buy', status: 'active' },
  { layer: 'L1 Infra', name: 'Ubuntu 24.04 LTS', purpose: 'Server operating system', decision: 'Buy', status: 'active' },
  { layer: 'L1 Infra', name: 'Nginx', purpose: 'Reverse proxy, SSL termination', decision: 'Buy', status: 'active' },
  { layer: 'L1 Infra', name: 'PM2', purpose: 'Node.js process manager', decision: 'Buy', status: 'active' },
  { layer: 'L1 Infra', name: 'Docker', purpose: 'Containerization', decision: 'Buy', status: 'active' },
]

// ─── Data Flows ───────────────────────────────────────────────────────────────
const dataFlows = [
  {
    id: 1,
    name: 'Customer Request Flow',
    icon: Smartphone,
    steps: ['Mobile App → API Gateway', 'Auth + Classify', 'AI Agent Execution', 'RAG Retrieval + Generation', 'Response + Logging'],
    layers: [6, 5, 4, 3, 2],
  },
  {
    id: 2,
    name: 'AI Agent Collaboration',
    icon: Bot,
    steps: ['Task Arrival', 'Classification & Selection', 'Agent Execution (Cognitive Engines)', 'Peer Review', 'Completion & Metrics'],
    layers: [4, 4, 4, 4, 3],
  },
  {
    id: 3,
    name: 'Payment Processing',
    icon: Activity,
    steps: ['Initiate Payment', 'Validate Order & Amount', 'Route to Gateway (bKash/Nagad/Stripe)', 'Process & Confirm', 'Record Transaction'],
    layers: [5, 3, 3, 3, 2],
  },
  {
    id: 4,
    name: 'Knowledge Learning',
    icon: Cpu,
    steps: ['Observe (logs, feedback, metrics)', 'Extract Patterns', 'Validate & Quality Score', 'Integrate (KG + Vectors + RAG)', 'Disseminate to Agents'],
    layers: [4, 4, 3, 2, 4],
  },
  {
    id: 5,
    name: 'Security Event',
    icon: Shield,
    steps: ['Detect Anomaly', 'Classify Severity (P0-P3)', 'Auto-Respond (block/lock/flag)', 'Notify Admins', 'Immutable Audit Trail'],
    layers: [3, 3, 3, 5, 2],
  },
]

// ─── Security Controls ────────────────────────────────────────────────────────
const securityControls = [
  { name: 'Zero Trust Architecture', icon: Shield, desc: 'Never trust, always verify — every request authenticated and authorized' },
  { name: 'Multi-Factor Auth', icon: Key, desc: 'Bearer token + MFA TOTP + OAuth (Google/GitHub) + biometric' },
  { name: 'RBAC + ABAC', icon: Lock, desc: '5 roles (super_admin → viewer) + context-aware attribute policies' },
  { name: 'Encryption', icon: FileCheck, desc: 'AES-256 at rest, TLS 1.3 in transit, E2E for sensitive data' },
  { name: 'Input Validation', icon: CheckCircle, desc: 'Zod schemas on all 274 API inputs — no raw SQL, no injection' },
  { name: 'Rate Limiting', icon: Monitor, desc: 'Per-route, per-user, per-IP sliding window limits' },
  { name: 'Audit Logging', icon: FileCheck, desc: '100% action logging — immutable trail with actor, action, resource, outcome' },
  { name: 'Session Security', icon: Clock, desc: 'HTTP-only cookies, 30-min inactivity timeout, token rotation' },
]

// ─── Component ────────────────────────────────────────────────────────────────
export default function SystemArchitecturePanel(_props: ArchitecturePanelProps) {
  const [integrationsData, setIntegrationsData] = useState<IntegrationsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedLayers, setExpandedLayers] = useState<Set<number>>(new Set([4, 5]))

  useEffect(() => {
    fetchApi('/api/enterprise/integrations')
      .then((data) => setIntegrationsData(data))
      .catch(() => { /* silent */ })
      .finally(() => setLoading(false))
  }, [])

  const toggleLayer = (id: number) => {
    setExpandedLayers((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#003ABC]">
            <Network className="h-5 w-5 text-white" />
          </div>
          System Architecture
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          6-layer enterprise architecture — 517+ files, 275+ API routes, 134 Prisma models, 2,000 AI agents
        </p>
      </div>

      {/* ── Section 1: 6-Layer Architecture Diagram ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Layers className="h-5 w-5 text-[#003ABC]" />
            6-Layer Architecture
          </CardTitle>
          <CardDescription>
            Click any layer to expand its components and technology details
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {layers.map((layer, idx) => {
              const colors = layerColors[layer.id]
              const isExpanded = expandedLayers.has(layer.id)
              const LayerIcon = layer.icon
              return (
                <div key={layer.id}>
                  <button
                    onClick={() => toggleLayer(layer.id)}
                    className={`w-full flex items-center gap-3 rounded-lg border p-3 transition-all hover:shadow-sm ${colors.bg} ${colors.border}`}
                  >
                    <Badge variant="outline" className={`shrink-0 font-mono text-xs ${colors.badge}`}>
                      L{layer.id}
                    </Badge>
                    <LayerIcon className={`h-4 w-4 shrink-0 ${colors.text}`} />
                    <span className={`text-sm font-semibold flex-1 text-left ${colors.text}`}>{layer.name}</span>
                    <Badge variant="outline" className="text-[10px] hidden sm:inline-flex">{layer.components.length} components</Badge>
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                  </button>
                  {isExpanded && (
                    <div className="ml-6 mt-1 mb-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {layer.components.map((comp) => (
                        <div
                          key={comp.name}
                          className={`rounded-md border p-2.5 text-left ${colors.bg} ${colors.border}`}
                        >
                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{comp.name}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{comp.detail}</p>
                        </div>
                      ))}
                      <div className={`rounded-md border p-2.5 flex items-center gap-2 ${colors.bg} ${colors.border}`}>
                        <Wifi className={`h-3.5 w-3.5 ${colors.text}`} />
                        <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">Protocol: {layer.protocol}</span>
                      </div>
                    </div>
                  )}
                  {idx < layers.length - 1 && (
                    <div className="flex justify-center py-0.5">
                      <div className="flex flex-col items-center text-slate-300 dark:text-slate-600">
                        <ArrowDown className="h-3.5 w-3.5" />
                        <span className="text-[9px] font-mono">↕</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: Technology Stack Table ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-[#FF6A00]" />
            Technology Stack
          </CardTitle>
          <CardDescription>24 core technologies organized by architecture layer</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-96">
            <div className="space-y-3">
              {Array.from(new Set(techStack.map((t) => t.layer))).map((layerName) => {
                const items = techStack.filter((t) => t.layer === layerName)
                return (
                  <div key={layerName}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{layerName}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      {items.map((tech) => (
                        <div
                          key={tech.name}
                          className="rounded-lg border border-slate-200 dark:border-slate-700 p-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{tech.name}</span>
                            <Badge
                              variant={tech.status === 'active' ? 'default' : 'secondary'}
                              className={`text-[10px] ${tech.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}
                            >
                              {tech.status}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{tech.purpose}</p>
                          <Badge variant="outline" className="mt-1.5 text-[10px]">
                            {tech.decision}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* ── Section 3: Integration Status ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5 text-[#003ABC]" />
            Integration Registry
          </CardTitle>
          <CardDescription>20 external integrations across 5 categories</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : integrationsData ? (
            <div className="space-y-4">
              {/* Summary Badges */}
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900">{integrationsData.total} Total</Badge>
                {Object.entries(integrationsData.byStatus).map(([status, count]) => (
                  <Badge
                    key={status}
                    variant={status === 'active' ? 'default' : 'secondary'}
                    className={status === 'active'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                    }
                  >
                    {count} {status}
                  </Badge>
                ))}
              </div>

              {/* Category Groups */}
              <ScrollArea className="max-h-80">
                <div className="space-y-4">
                  {Object.entries(
                    integrationsData.integrations.reduce<Record<string, Integration[]>>((acc, int) => {
                      if (!acc[int.category]) acc[int.category] = []
                      acc[int.category].push(int)
                      return acc
                    }, {})
                  ).map(([category, ints]) => (
                    <div key={category}>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{category} ({ints.length})</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {ints.map((int) => (
                          <div
                            key={int.id}
                            className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 flex items-start gap-3"
                          >
                            <div className={`mt-0.5 shrink-0 ${
                              int.status === 'active'
                                ? 'text-emerald-500'
                                : 'text-amber-500'
                            }`}>
                              {int.status === 'active' ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{int.name}</p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{int.purpose}</p>
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                <Badge variant="outline" className="text-[10px]">{int.protocol}</Badge>
                                <Badge variant="outline" className="text-[10px]">{int.dataFlow}</Badge>
                                <Badge variant="outline" className="text-[10px]">{int.securityLevel}</Badge>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">Failed to load integration data</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Section 4: Data Flow Quick View ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="h-5 w-5 text-[#FF6A00]" />
            Key Data Flows
          </CardTitle>
          <CardDescription>5 critical data flow patterns across the architecture</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {dataFlows.map((flow) => {
              const FlowIcon = flow.icon
              return (
                <div
                  key={flow.id}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <FlowIcon className="h-4 w-4 text-[#003ABC]" />
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{flow.name}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {flow.steps.map((step, idx) => (
                      <React.Fragment key={idx}>
                        <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                          <Badge variant="outline" className="mr-1.5 text-[9px] font-mono py-0">L{flow.layers[idx]}</Badge>
                          {step}
                        </span>
                        {idx < flow.steps.length - 1 && (
                          <ArrowRight className="h-3 w-3 text-slate-300 dark:text-slate-600 shrink-0" />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Section 5: Security Posture ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5 text-[#003ABC]" />
            Security Posture
          </CardTitle>
          <CardDescription>Zero Trust architecture — defense in depth across all layers</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {securityControls.map((control) => {
              const ControlIcon = control.icon
              return (
                <div
                  key={control.name}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 p-4"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-900/30">
                      <ControlIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight">{control.name}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{control.desc}</p>
                </div>
              )
            })}
          </div>

          <Separator className="my-4" />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <p className="text-2xl font-bold text-[#003ABC]">100%</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">API Auth Coverage</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <p className="text-2xl font-bold text-[#FF6A00]">TLS 1.3</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Transit Encryption</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <p className="text-2xl font-bold text-[#003ABC]">AES-256</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">At-Rest Encryption</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <p className="text-2xl font-bold text-emerald-600">5</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">RBAC Roles</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
