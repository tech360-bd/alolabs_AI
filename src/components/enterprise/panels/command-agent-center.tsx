'use client'

/**
 * Commanding Center — Super Admin & Admin own AI agent.
 *
 * One screen to (1) command a tool-calling agent that runs on 100% free
 * models, (2) browse the full free-model catalogue, (3) see every free
 * service/tool the agent can use, and (4) follow the $0 setup steps.
 * Backed by /api/command-agent/chat + /api/command-agent/catalog.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Terminal, Send, Loader2, Trash2, Wrench, CheckCircle2, XCircle, Sparkles,
  CloudSun, BookOpen, Search, Image as ImageIcon, Calculator, Database, Newspaper,
  ExternalLink, KeyRound, Cpu, Layers, ListChecks, Zap, ShieldCheck, Clock,
  Activity, History, ChevronDown, Globe,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fetchApi } from '@/lib/api-client'
import ResearchVerification from './research-verification'
import type { EnterpriseView } from '../types'

// ─── Types ───────────────────────────────────────────────────────────────────

interface TraceStep { step: number; tool: string; args: Record<string, unknown>; ok: boolean; durationMs: number; output: string }
interface SkillUsage { slug: string; title: string; source: string; license: string; truncated: boolean }
interface CommandApproval { tool: string; approvalId: string | null; approvers: string[]; reason: string }
interface CommandRouting { attempts: number; fallbackUsed: boolean; switches: number; providers: string[] }
interface RunEvent { seq: number; at: string; type: 'run_started' | 'model' | 'tool' | 'approval' | 'final' | 'error' | string; data: Record<string, unknown> }
interface ChatReply {
  success: boolean; response: string; provider: string; model: string; profile: string;
  steps: number; trace: TraceStep[]; images: string[];
  status?: string; statusDetail?: string; approvals?: CommandApproval[]; persisted?: boolean; routing?: CommandRouting;
  skillsUsed?: SkillUsage[]; skillsRejected?: Array<{ slug: string; reason: string }>; company: { name: string };
  runId?: string | null; eventCount?: number;
}
interface FreeModel { id: string; name: string; strength: string; capabilities: string[]; contextLength?: number }
interface FreeProvider { id: string; label: string; providerKind: string; baseUrl: string; getKeyUrl: string; envVar?: string; apiKeyRequired: boolean; cardRequired: boolean; local: boolean; freeAllowance: string; notes: string; models: FreeModel[] }
interface FreeService { name: string; category: string; description: string; freeAllowance: string; url: string; apiKeyRequired: boolean; agentTool?: string }
interface AuthorisedModel { id: string; provider: string; routeKind: string }
interface ToolInfo { name: string; description: string; kind: string; category: string }
interface SkillInfo { slug: string; title: string; description: string; category: string; status: 'advisory' | 'quarantined'; riskLevel: string; source: string; license: string; url: string; quarantineReason: string | null }
interface Catalog {
  stats: { providers: number; models: number; services: number; noKeyTools: number }
  providers: FreeProvider[]
  services: FreeService[]
  fallbackOrder: string[]
  configuredFromEnvironment: Record<string, boolean>
  enabledProviderConfigs: number
  authorisedModels: AuthorisedModel[]
  openRouterFree: { available: boolean; count: number; models: string[] }
  tools: ToolInfo[]
  skillStats: { total: number; advisory: number; quarantined: number; sources: number; instructionOnly: boolean; grantsTools: boolean }
  skills: SkillInfo[]
  setupSteps: string[]
  disclaimer: string
}
interface Message {
  role: 'user' | 'assistant' | 'error'; content: string; provider?: string; model?: string; profile?: string;
  trace?: TraceStep[]; images?: string[]; skillsUsed?: SkillUsage[]; skillsRejected?: Array<{ slug: string; reason: string }>;
  status?: string; statusDetail?: string; approvals?: CommandApproval[]; persisted?: boolean; routing?: CommandRouting;
  runId?: string | null; events?: RunEvent[]; eventCount?: number;
}

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partially_completed: 'bg-amber-50 text-amber-800 border-amber-200',
  waiting_for_approval: 'bg-[#FC5400]/10 text-[#B23A00] border-[#FC5400]/30',
  failed: 'bg-red-50 text-red-700 border-red-200',
}

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? 'bg-slate-50 text-slate-600 border-slate-200'
  return <Badge variant="outline" className={`px-1.5 py-0 text-[10px] ${style}`}>{status.replace(/_/g, ' ')}</Badge>
}

function ApprovalNotice({ approvals }: { approvals: CommandApproval[] }) {
  if (approvals.length === 0) return null
  return (
    <div className="mt-2 rounded-lg border border-[#FC5400]/30 bg-[#FC5400]/5 p-2 text-[11px] text-[#172033]">
      <p className="font-semibold text-[#B23A00]">Human approval required before this step runs</p>
      <ul className="mt-1 space-y-0.5">
        {approvals.map((approval, index) => (
          <li key={`${approval.tool}-${index}`}>
            <span className="font-mono">{approval.tool}</span>
            {approval.approvalId ? <> · approval <span className="font-mono">{approval.approvalId}</span></> : ' · approval could not be created'}
            {approval.approvers.length > 0 && <> · approvers: {approval.approvers.join(', ')}</>}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[#667085]">Open the Approvals panel, approve the request, then send the command again.</p>
    </div>
  )
}

function eventSummary(event: RunEvent): string {
  const data = event.data ?? {}
  const text = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '')
  switch (event.type) {
    case 'run_started':
      return [text(data.profile), `${text(data.historyTurns)} history turn(s)`].filter(Boolean).join(' · ')
    case 'model':
      return [text(data.provider), text(data.model), text(data.attempts) ? `${text(data.attempts)} attempt(s)` : '', data.fallbackUsed ? 'fallback' : ''].filter(Boolean).join(' · ')
    case 'tool':
      return [`${text(data.tool)}${data.ok === false ? ' · failed' : ''}`, text(data.durationMs) ? `${text(data.durationMs)}ms` : ''].filter(Boolean).join(' · ')
    case 'approval':
      return `${text(data.tool)} · human approval required`
    case 'final':
      return [text(data.status), text(data.contentChars) ? `${text(data.contentChars)} chars` : ''].filter(Boolean).join(' · ')
    case 'error':
      return text(data.message).slice(0, 160)
    default:
      return ''
  }
}

const RUN_EVENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  run_started: Zap, model: Cpu, tool: Wrench, approval: ShieldCheck, final: CheckCircle2, error: XCircle,
}

/** Execution timeline: the same events live, then the same events from storage. */
function RunTimeline({ events, runId, live = false, onLoadStored }: {
  events: RunEvent[]; runId?: string | null; live?: boolean; onLoadStored?: () => void;
}) {
  const [open, setOpen] = useState<number | null>(null)
  // A restored turn has a run id before its events are fetched; show the handle
  // so the persisted timeline is one click away instead of silently missing.
  if (events.length === 0 && !runId) return null
  const first = new Date(events[0]?.at ?? Date.now()).getTime()
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2 dark:border-slate-700 dark:bg-slate-800/40">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide text-slate-500">
        <Activity className={`h-3 w-3 ${live ? 'animate-pulse text-[#FC5400]' : 'text-slate-400'}`} />
        <span>{live ? 'Live execution' : 'Execution timeline'}</span>
        <span className="text-slate-400">{events.length > 0 ? `${events.length} event(s)` : 'stored timeline'}</span>
        {runId && <span className="font-mono normal-case tracking-normal text-slate-400">run {runId.slice(0, 12)}…</span>}
        {!live && runId && onLoadStored && (
          <button onClick={onLoadStored} className="ml-auto inline-flex items-center gap-1 rounded px-1 py-0.5 normal-case tracking-normal text-[#00309C] hover:underline dark:text-blue-300">
            <History className="h-3 w-3" /> Load stored timeline
          </button>
        )}
      </div>
      <ol className="space-y-0.5">
        {events.map((event, index) => {
          const Icon = RUN_EVENT_ICONS[event.type] ?? Activity
          const offset = Math.max(0, new Date(event.at).getTime() - first)
          return (
            <li key={`${event.seq}-${index}`} className="rounded text-[11px] text-slate-600 dark:text-slate-300">
              <button onClick={() => setOpen(open === index ? null : index)} className="flex w-full items-center gap-2 px-1 py-0.5 text-left hover:bg-white/60 dark:hover:bg-slate-700/40">
                <span className="w-8 shrink-0 font-mono text-[10px] text-slate-400">+{Math.round(offset / 100) / 10}s</span>
                <Icon className={`h-3 w-3 shrink-0 ${event.type === 'error' ? 'text-red-500' : event.type === 'approval' ? 'text-[#FC5400]' : event.type === 'final' ? 'text-emerald-500' : 'text-slate-400'}`} />
                <span className="font-mono text-[10px] uppercase tracking-wide text-slate-500">{event.type.replace(/_/g, ' ')}</span>
                <span className="min-w-0 flex-1 truncate">{eventSummary(event)}</span>
                <ChevronDown className={`h-3 w-3 shrink-0 text-slate-300 transition ${open === index ? 'rotate-180' : ''}`} />
              </button>
              {open === index && (
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap border-t border-slate-200 px-2 py-1 font-mono text-[10px] text-slate-500 dark:border-slate-700">{JSON.stringify(event.data, null, 2)}</pre>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

const PROFILES = [
  { id: 'free_general', label: 'Free · General' },
  { id: 'free_reasoning', label: 'Free · Reasoning' },
  { id: 'free_coding', label: 'Free · Coding' },
  { id: 'local_general', label: 'Local · Ollama' },
  { id: 'local_fast', label: 'Local · Fast' },
] as const

const QUICK_COMMANDS: Array<{ icon: React.ComponentType<{ className?: string }>; label: string; prompt: string }> = [
  { icon: CloudSun, label: 'Weather check', prompt: "What's the weather in Dhaka today, and will it rain this week?" },
  { icon: Search, label: 'Web research', prompt: 'Search the web: what are the best free AI models for tool-calling agents right now? Summarise with sources.' },
  { icon: Database, label: 'Company knowledge', prompt: 'Search our company knowledge base and summarise what we have about onboarding new clients.' },
  { icon: Calculator, label: 'CRM + maths', prompt: 'Summarise our CRM pipeline by stage, then calculate the total open value.' },
  { icon: Newspaper, label: 'Tech news', prompt: 'What are the top Hacker News stories right now? Pick the 3 most relevant to AI agents.' },
  { icon: BookOpen, label: 'Explain a topic', prompt: 'Look up "retrieval-augmented generation" on Wikipedia and explain it for a non-technical manager.' },
  { icon: ImageIcon, label: 'Generate image', prompt: 'Generate an image: a modern AI command center dashboard in Dhaka, blue and orange, clean flat illustration.' },
  { icon: Clock, label: 'Time check', prompt: 'What is the current time in Asia/Dhaka, Europe/London and America/New_York?' },
]

function ToolTrace({ trace }: { trace: TraceStep[] }) {
  const [open, setOpen] = useState<number | null>(null)
  if (trace.length === 0) return null
  return (
    <div className="mt-2 space-y-1">
      {trace.map((step, i) => (
        <div key={i} className="rounded-lg border border-slate-200 bg-white/70 text-xs dark:border-slate-700 dark:bg-slate-800/60">
          <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left">
            {step.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> : <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />}
            <Wrench className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="font-mono font-medium text-slate-700 dark:text-slate-200">{step.tool}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-slate-400">{JSON.stringify(step.args)}</span>
            <span className="shrink-0 text-slate-400">{step.durationMs}ms</span>
          </button>
          {open === i && (
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap border-t border-slate-100 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-slate-600 dark:border-slate-700 dark:text-slate-300">{step.output}</pre>
          )}
        </div>
      ))}
    </div>
  )
}

export default function CommandAgentCenter({ onNavigate }: { onNavigate?: (view: EnterpriseView) => void }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [catalogError, setCatalogError] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "I'm your Command Agent. I run on free/local model routes and can use read-only tools plus imported instruction-only skills (engineering, design, Android, science, media, and more). Skills never grant shell access or bypass approvals. Give me a command." },
  ])
  const [input, setInput] = useState('')
  const [profile, setProfile] = useState<string>('free_general')
  const [model, setModel] = useState('')
  const [sending, setSending] = useState(false)
  // Stable per-browser session so a reload resumes the durable transcript
  // instead of silently starting over with a new random id.
  const [sessionId] = useState(() => {
    if (typeof window === 'undefined') return 'cmd-default'
    try {
      const existing = window.localStorage.getItem('alolabs.commandSession')
      if (existing) return existing
      const created = `cmd-${Date.now().toString(36)}`
      window.localStorage.setItem('alolabs.commandSession', created)
      return created
    } catch {
      return `cmd-${Date.now().toString(36)}`
    }
  })
  const [historyState, setHistoryState] = useState<'loading' | 'durable' | 'unavailable'>('loading')
  const [liveEvents, setLiveEvents] = useState<RunEvent[]>([])
  const [liveRunId, setLiveRunId] = useState<string | null>(null)
  const [modelFilter, setModelFilter] = useState('')
  const [skillFilter, setSkillFilter] = useState('')
  const [skillStatusFilter, setSkillStatusFilter] = useState<'all' | 'advisory' | 'quarantined'>('advisory')
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadCatalog = useCallback(async () => {
    try {
      const data = await fetchApi<Catalog>('/api/command-agent/catalog')
      setCatalog(data)
      setCatalogError('')
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : 'Could not load the free catalogue. Log in as Super Admin or a company Admin.')
    }
  }, [])

  useEffect(() => { void loadCatalog() }, [loadCatalog])

  // Restore the durable transcript on mount. `durable: false` means storage could
  // not be read — the UI says so rather than implying the chat was empty.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const history = await fetchApi<{ durable: boolean; messages: Array<{ role: string; content: string; model?: string | null; metadata?: Record<string, unknown> }> }>(
          `/api/command-agent/chat?sessionId=${encodeURIComponent(sessionId)}`,
        )
        if (cancelled) return
        setHistoryState(history.durable ? 'durable' : 'unavailable')
        if (!history.messages?.length) return
        const restored: Message[] = history.messages.map((turn) => {
          const meta = (turn.metadata ?? {}) as Record<string, unknown>
          const routing = meta.routing as CommandRouting | undefined
          return {
            role: turn.role === 'user' ? 'user' : 'assistant',
            content: turn.content,
            ...(turn.model ? { model: turn.model } : {}),
            ...(typeof meta.provider === 'string' ? { provider: meta.provider } : {}),
            ...(typeof meta.status === 'string' ? { status: meta.status } : {}),
            ...(Array.isArray(meta.approvals) ? { approvals: meta.approvals as CommandApproval[] } : {}),
            ...(routing ? { routing } : {}),
            ...(Array.isArray(meta.trace) ? { trace: meta.trace as TraceStep[] } : {}),
            ...(typeof meta.runId === 'string' ? { runId: meta.runId } : {}),
            ...(typeof meta.eventCount === 'number' ? { eventCount: meta.eventCount } : {}),
          }
        })
        setMessages(restored)
      } catch {
        if (!cancelled) setHistoryState('unavailable')
      }
    })()
    return () => { cancelled = true }
  }, [sessionId])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, sending])

  /**
   * Send a command through the streaming endpoint.
   *
   * The response is NDJSON: run/event/final/error frames. Events are rendered as
   * they arrive; the `final` frame is the terminal result. If the deployment does
   * not expose the stream route (404/405), the request falls back to the plain
   * JSON endpoint once — the timeline is then absent, not invented.
   */
  const send = useCallback(async (text?: string) => {
    const message = (text ?? input).trim()
    if (!message || sending) return
    setInput('')
    setSending(true)
    setLiveEvents([])
    setLiveRunId(null)
    setMessages((prev) => [...prev, { role: 'user', content: message }])

    const payload = JSON.stringify({ message, sessionId, profile, ...(model.trim() ? { model: model.trim() } : {}) })

    const readStream = async (response: Response) => {
      if (!response.body) throw new Error('This browser cannot read a streaming response.')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      const events: RunEvent[] = []
      let buffer = ''
      let reply: ChatReply | null = null
      let runId: string | null = null

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let newline = buffer.indexOf('\n')
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim()
          buffer = buffer.slice(newline + 1)
          newline = buffer.indexOf('\n')
          if (!line) continue
          let frame: { type?: string; event?: RunEvent; result?: ChatReply; runId?: string | null; error?: string; hint?: string }
          try { frame = JSON.parse(line) } catch { continue }
          if (frame.type === 'event' && frame.event) {
            events.push(frame.event)
            setLiveEvents([...events])
          } else if (frame.type === 'run') {
            runId = frame.runId ?? null
            setLiveRunId(runId)
          } else if (frame.type === 'final' && frame.result) {
            reply = { ...frame.result, success: true }
          } else if (frame.type === 'error') {
            throw new Error(frame.hint ? `${frame.error ?? 'Command failed'}\n\n${frame.hint}` : (frame.error ?? 'Command failed'))
          }
        }
      }
      if (!reply) throw new Error('The stream ended before a result arrived. Check the stored run timeline before retrying.')
      if (!reply.runId) reply.runId = runId
      return { reply, events }
    }

    try {
      let reply: ChatReply
      let events: RunEvent[] = []
      const response = await fetch('/api/command-agent/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
      })

      if (response.status === 404 || response.status === 405) {
        // Older deployment without the stream route: plain JSON fallback.
        reply = await fetchApi<ChatReply>('/api/command-agent/chat', { method: 'POST', body: payload })
      } else if (!response.ok) {
        const detail = await response.text()
        let parsed: { error?: string } | null = null
        try { parsed = JSON.parse(detail) as { error?: string } } catch { /* keep raw */ }
        throw new Error(parsed?.error ?? detail ?? `Request failed with HTTP ${response.status}`)
      } else {
        const streamed = await readStream(response)
        reply = streamed.reply
        events = streamed.events
      }

      setMessages((prev) => [...prev, {
        role: 'assistant', content: reply.response, provider: reply.provider, model: reply.model,
        profile: reply.profile, trace: reply.trace, images: reply.images, skillsUsed: reply.skillsUsed ?? [], skillsRejected: reply.skillsRejected ?? [],
        status: reply.status, statusDetail: reply.statusDetail, approvals: reply.approvals ?? [], persisted: reply.persisted, routing: reply.routing,
        runId: reply.runId ?? liveRunId, events, eventCount: reply.eventCount ?? events.length,
      }])
    } catch (error) {
      let detail = error instanceof Error ? error.message : 'Request failed'
      try {
        const parsed = JSON.parse(detail) as { error?: string; hint?: string }
        if (parsed.error) detail = parsed.hint ? `${parsed.error}\n\n${parsed.hint}` : parsed.error
      } catch { /* keep raw */ }
      setMessages((prev) => [...prev, { role: 'error', content: detail }])
    } finally {
      setSending(false)
      setLiveEvents([])
      setLiveRunId(null)
    }
  }, [input, sending, sessionId, profile, model, liveRunId])

  /** Re-read a run's stored timeline after reload. */
  const loadStoredRun = useCallback(async (runId: string) => {
    try {
      const stored = await fetchApi<{ run?: { events?: RunEvent[] } }>(`/api/command-agent/runs/${encodeURIComponent(runId)}`)
      const events = Array.isArray(stored.run?.events) ? stored.run.events : []
      if (events.length === 0) return
      setMessages((prev) => prev.map((entry) => (entry.runId === runId ? { ...entry, events } : entry)))
    } catch {
      // The bubble keeps its live events; a failed re-read is not reported as success.
    }
  }, [])

  const clear = useCallback(async () => {
    setMessages([])
    try { await fetchApi(`/api/command-agent/chat?sessionId=${encodeURIComponent(sessionId)}`, { method: 'DELETE' }) } catch { /* non-fatal */ }
  }, [sessionId])

  const filteredProviders = (catalog?.providers ?? []).map((provider) => ({
    ...provider,
    models: provider.models.filter((m) => !modelFilter || `${provider.label} ${m.id} ${m.name} ${m.strength}`.toLowerCase().includes(modelFilter.toLowerCase())),
  })).filter((provider) => provider.models.length > 0)
  const filteredSkills = (catalog?.skills ?? []).filter((skill) => {
    const matchesStatus = skillStatusFilter === 'all' || skill.status === skillStatusFilter
    const haystack = `${skill.title} ${skill.slug} ${skill.description} ${skill.category} ${skill.source}`.toLowerCase()
    return matchesStatus && (!skillFilter || haystack.includes(skillFilter.toLowerCase()))
  })
  const noModelConfigured = catalog !== null && catalog.authorisedModels.length === 0 && catalog.enabledProviderConfigs === 0
  const servicesByCategory = (catalog?.services ?? []).reduce<Record<string, FreeService[]>>((acc, service) => {
    (acc[service.category] ??= []).push(service)
    return acc
  }, {})

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-slate-100">
            <Terminal className="h-6 w-6 text-[#0066CC]" /> Commanding Center
            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">100% FREE AI</Badge>
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
            Your own AI agent for Super Admin &amp; Admin — tool-calling, policy-gated, audited, and $0 by design.
            It never falls back to a paid route; with no free provider configured it fails honestly instead of faking an answer.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onNavigate?.('agentos-command')}><Zap className="mr-1.5 h-3.5 w-3.5" /> ONE COMMAND runs</Button>
          <Button variant="outline" size="sm" onClick={() => onNavigate?.('super-admin-ai')}><KeyRound className="mr-1.5 h-3.5 w-3.5" /> Add free providers</Button>
          <Button variant="outline" size="sm" onClick={() => onNavigate?.('ai-providers')}><Cpu className="mr-1.5 h-3.5 w-3.5" /> AI Providers</Button>
        </div>
      </div>

      {/* Stats strip */}
      {catalog && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            { label: 'Free providers', value: catalog.stats.providers },
            { label: 'Free models listed', value: catalog.stats.models },
            { label: 'Live OpenRouter :free', value: catalog.openRouterFree.available ? catalog.openRouterFree.count : '—' },
            { label: 'Agent tools', value: catalog.tools.length },
            { label: 'Authorised for you', value: catalog.authorisedModels.length },
          ].map((stat) => (
            <Card key={stat.label}><CardContent className="p-3">
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stat.value}</p>
              <p className="text-xs text-slate-500">{stat.label}</p>
            </CardContent></Card>
          ))}
        </div>
      )}
      {catalogError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          {catalogError} The agent chat below still works once you are logged in as Super Admin or a company Admin with a free provider configured.
        </div>
      )}
      {noModelConfigured && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100">
          <strong>Configuration required:</strong> no free provider is authorised yet, so the agent cannot answer. Open the <button className="font-semibold underline" onClick={() => onNavigate?.('super-admin-ai')}>Super Admin AI Control Plane</button> and add Groq or OpenRouter :free (free key, no card) — exact model ids are in the <em>Free Models</em> tab, steps in <em>Setup</em>.
        </div>
      )}

      <Tabs defaultValue="agent" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="w-fit shrink-0">
          <TabsTrigger value="agent"><Sparkles className="mr-1.5 h-3.5 w-3.5" /> Command Agent</TabsTrigger>
          <TabsTrigger value="models"><Layers className="mr-1.5 h-3.5 w-3.5" /> Free Models</TabsTrigger>
          <TabsTrigger value="services"><Wrench className="mr-1.5 h-3.5 w-3.5" /> Free Services &amp; Tools</TabsTrigger>
          <TabsTrigger value="skills"><BookOpen className="mr-1.5 h-3.5 w-3.5" /> Skills ({catalog?.skillStats.advisory ?? 0})</TabsTrigger>
          <TabsTrigger value="research"><Globe className="mr-1.5 h-3.5 w-3.5" /> Research &amp; Verify</TabsTrigger>
          <TabsTrigger value="setup"><ListChecks className="mr-1.5 h-3.5 w-3.5" /> $0 Setup</TabsTrigger>
        </TabsList>

        {/* ─── Agent ─── */}
        <TabsContent value="agent" className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
          <Card className="flex min-h-0 flex-1 flex-col border-[#0066CC]/20">
            <CardHeader className="shrink-0 pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <select value={profile} onChange={(e) => setProfile(e.target.value)} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-900" aria-label="Routing profile">
                  {PROFILES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model (optional — gateway picks a free one)" list="command-agent-models" className="h-9 w-72 max-w-full" />
                <datalist id="command-agent-models">
                  {(catalog?.authorisedModels ?? []).map((m) => <option key={`${m.provider}:${m.id}`} value={m.id}>{m.provider} · {m.routeKind}</option>)}
                </datalist>
                <Button variant="ghost" size="sm" onClick={() => void clear()}><Trash2 className="mr-1.5 h-3.5 w-3.5" /> Clear</Button>
                <span className="ml-auto hidden items-center gap-1.5 text-xs text-slate-500 md:flex"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Read-only tools · {catalog?.skillStats.advisory ?? 0} advisory skills · no skill tool grants</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_COMMANDS.map((cmd) => {
                  const Icon = cmd.icon
                  return (
                    <button key={cmd.label} onClick={() => void send(cmd.prompt)} disabled={sending} className="flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition-colors hover:border-[#0066CC]/40 hover:text-[#0066CC] disabled:opacity-50 dark:border-slate-700 dark:text-slate-400">
                      <Icon className="h-3.5 w-3.5" /> {cmd.label}
                    </button>
                  )
                })}
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-0">
              {historyState === 'unavailable' && (
                <p className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                  Conversation storage is unavailable — this chat will not be restored after a reload. Replies are unaffected.
                </p>
              )}
              <ScrollArea className="min-h-[320px] flex-1 rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                <div className="space-y-3">
                  {messages.map((msg, i) => (
                    <div key={i} className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-[#0066CC] text-white' : msg.role === 'error' ? 'border border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200' : 'border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'}`}>
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                        {msg.images?.map((src) => (
                          <img key={src} src={src} alt="Generated by Command Agent (Pollinations, free)" className="mt-2 max-h-80 rounded-lg border border-slate-200" loading="lazy" />
                        ))}
                        {msg.skillsUsed && msg.skillsUsed.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {msg.skillsUsed.map((skill) => <Badge key={skill.slug} variant="outline" className="px-1.5 py-0 text-[10px]" title={`${skill.source} · ${skill.license}${skill.truncated ? ' · truncated' : ''}`}>Skill: {skill.title}</Badge>)}
                          </div>
                        )}
                        {msg.skillsRejected && msg.skillsRejected.length > 0 && (
                          <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">Skills not used (quarantined/unknown): {msg.skillsRejected.map((skill) => skill.slug).join(', ')}</p>
                        )}
                        {msg.approvals && msg.approvals.length > 0 && <ApprovalNotice approvals={msg.approvals} />}
                        {msg.events && msg.events.length > 0 && (
                          <RunTimeline
                            events={msg.events}
                            runId={msg.runId ?? null}
                            onLoadStored={() => { if (msg.runId) void loadStoredRun(msg.runId) }}
                          />
                        )}
                        {msg.trace && msg.trace.length > 0 && <ToolTrace trace={msg.trace} />}
                        {msg.status && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <StatusBadge status={msg.status} />
                            {msg.statusDetail && <span className="text-[11px] text-[#667085]">{msg.statusDetail}</span>}
                          </div>
                        )}
                        {(msg.provider || msg.model) && (
                          <p className="mt-2 text-[11px] text-[#667085]">
                            {msg.provider} · <span className="font-mono">{msg.model}</span> · {msg.profile} · $0 free-tier route
                            {msg.routing && (
                              <> · {msg.routing.attempts} provider attempt{msg.routing.attempts === 1 ? '' : 's'}
                                {msg.routing.fallbackUsed ? ` · failover used (${msg.routing.providers.join(' → ')})` : ' · no failover needed'}
                              </>
                            )}
                          </p>
                        )}
                        {msg.persisted === false && (
                          <p className="mt-1 text-[11px] text-amber-700">This turn was not saved to history (storage unavailable).</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {sending && (
                    <div className="max-w-[85%]">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" /> Agent is thinking / calling tools…
                      </div>
                      {liveEvents.length > 0 && <RunTimeline events={liveEvents} runId={liveRunId} live />}
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>
              <form onSubmit={(e) => { e.preventDefault(); void send() }} className="flex shrink-0 gap-2">
                <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Command your agent… e.g. Weather in Tokyo + tell me about Mount Fuji + generate a poster image" className="flex-1" disabled={sending} />
                <Button type="submit" disabled={sending || !input.trim()} className="bg-[#0066CC] text-white hover:bg-[#002a8f]">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}<span className="ml-1.5">Command</span>
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Free Models ─── */}
        <TabsContent value="models" className="mt-3 min-h-0 flex-1 overflow-y-auto">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Input value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} placeholder="Filter models… (e.g. qwen, coding, vision)" className="w-80 max-w-full" />
            {catalog?.openRouterFree.available && <Badge variant="secondary">Live from OpenRouter: {catalog.openRouterFree.count} models at explicit $0 right now</Badge>}
          </div>
          <div className="space-y-3">
            {filteredProviders.map((provider) => (
              <Card key={provider.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    {provider.label}
                    {provider.local ? <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">LOCAL · OFFLINE</Badge> : <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">FREE TIER</Badge>}
                    {catalog?.configuredFromEnvironment[provider.id] && <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">KEY IN ENV</Badge>}
                    {!provider.cardRequired && <Badge variant="outline">No card</Badge>}
                  </CardTitle>
                  <CardDescription>
                    {provider.freeAllowance} · Control Plane kind <code className="font-mono">{provider.providerKind}</code>
                    {provider.baseUrl && <> · Base URL <code className="font-mono">{provider.baseUrl}</code></>}
                    {provider.envVar && <> · Env <code className="font-mono">{provider.envVar}</code></>}
                    {' '}· <a className="inline-flex items-center gap-0.5 font-medium text-[#0066CC] hover:underline" href={provider.getKeyUrl} target="_blank" rel="noreferrer">Get free key <ExternalLink className="h-3 w-3" /></a>
                  </CardDescription>
                  <p className="text-xs text-slate-500">{provider.notes}</p>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {provider.models.map((m) => (
                      <div key={m.id} className="rounded-lg border border-slate-100 p-2.5 dark:border-slate-800">
                        <p className="truncate font-mono text-xs font-semibold text-slate-800 dark:text-slate-100" title={m.id}>{m.id}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{m.name} — {m.strength}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {m.capabilities.map((c) => <Badge key={c} variant="outline" className="px-1 py-0 text-[10px]">{c}</Badge>)}
                          {m.contextLength && <Badge variant="outline" className="px-1 py-0 text-[10px]">{Math.round(m.contextLength / 1024)}K ctx</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredProviders.length === 0 && <p className="text-sm text-slate-500">No models match your filter (or the catalogue could not be loaded — check you are logged in as Super Admin / Admin).</p>}
          </div>
        </TabsContent>

        {/* ─── Free Services & Tools ─── */}
        <TabsContent value="services" className="mt-3 min-h-0 flex-1 overflow-y-auto">
          <Card className="mb-3">
            <CardHeader className="pb-2"><CardTitle className="text-base">Agent tools available right now ({catalog?.tools.length ?? 0})</CardTitle>
              <CardDescription>Internal tools are tenant-scoped and recorded in ToolRun. External-free tools call fixed, no-key hosts only (no arbitrary URLs — no SSRF surface).</CardDescription></CardHeader>
            <CardContent className="grid gap-2 pt-0 sm:grid-cols-2 xl:grid-cols-3">
              {(catalog?.tools ?? []).map((tool) => (
                <div key={tool.name} className="rounded-lg border border-slate-100 p-2.5 dark:border-slate-800">
                  <p className="flex items-center gap-1.5 font-mono text-xs font-semibold"><Wrench className="h-3.5 w-3.5 text-slate-400" /> {tool.name}
                    <Badge variant="outline" className="ml-auto px-1 py-0 text-[10px]">{tool.kind === 'internal' ? 'internal' : 'external · free'}</Badge></p>
                  <p className="mt-1 text-xs text-slate-500">{tool.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <div className="space-y-3">
            {Object.entries(servicesByCategory).map(([category, services]) => (
              <Card key={category}>
                <CardHeader className="pb-2"><CardTitle className="text-base capitalize">{category.replace(/-/g, ' ')}</CardTitle></CardHeader>
                <CardContent className="grid gap-2 pt-0 sm:grid-cols-2 xl:grid-cols-3">
                  {services.map((service) => (
                    <div key={service.name} className="rounded-lg border border-slate-100 p-2.5 dark:border-slate-800">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{service.name}
                        {service.agentTool && <Badge className="ml-2 bg-emerald-100 px-1 py-0 text-[10px] text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">AGENT TOOL</Badge>}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{service.description}</p>
                      <p className="mt-1 text-xs"><span className="font-medium text-emerald-600 dark:text-emerald-400">{service.freeAllowance}</span>
                        {' '}· <a className="inline-flex items-center gap-0.5 text-[#0066CC] hover:underline" href={service.url} target="_blank" rel="noreferrer">Official site <ExternalLink className="h-3 w-3" /></a></p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ─── Skills ─── */}
        <TabsContent value="skills" className="mt-3 min-h-0 flex-1 overflow-y-auto">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Input value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)} placeholder="Filter skills… (e.g. code review, diagram, Android)" className="w-80 max-w-full" />
            <select value={skillStatusFilter} onChange={(e) => setSkillStatusFilter(e.target.value as 'all' | 'advisory' | 'quarantined')} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-900" aria-label="Skill status">
              <option value="advisory">Advisory (agent-enabled)</option>
              <option value="quarantined">Quarantined (review only)</option>
              <option value="all">All</option>
            </select>
            <Badge variant="secondary">{catalog?.skillStats.total ?? 0} imported</Badge>
            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">{catalog?.skillStats.advisory ?? 0} advisory</Badge>
            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{catalog?.skillStats.quarantined ?? 0} quarantined</Badge>
            <span className="text-xs text-slate-500">Instruction-only · no scripts, plugins, or tool grants</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {filteredSkills.map((skill) => (
              <Card key={skill.slug} className="border-slate-200 dark:border-slate-800">
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate" title={skill.title}>{skill.title}</span>
                    <Badge className={skill.status === 'advisory' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}>{skill.status}</Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">{skill.source} · {skill.license} · {skill.category}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="line-clamp-3 text-xs text-slate-600 dark:text-slate-400">{skill.description}</p>
                  {skill.quarantineReason && <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">{skill.quarantineReason}</p>}
                  <a className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#0066CC] hover:underline" href={skill.url} target="_blank" rel="noreferrer">Source <ExternalLink className="h-3 w-3" /></a>
                </CardContent>
              </Card>
            ))}
          </div>
          {filteredSkills.length === 0 && <p className="text-sm text-slate-500">No skills match your filter.</p>}
        </TabsContent>

        <TabsContent value="research" className="mt-3 min-h-0 flex-1 overflow-y-auto">
          <ResearchVerification />
        </TabsContent>

        <TabsContent value="setup" className="mt-3 min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">$0 setup — step by step</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700 dark:text-slate-200">
                  {(catalog?.setupSteps ?? []).map((step, i) => <li key={i}>{step}</li>)}
                </ol>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" className="bg-[#0066CC] text-white hover:bg-[#002a8f]" onClick={() => onNavigate?.('super-admin-ai')}>Open Super Admin AI Control Plane</Button>
                  <Button size="sm" variant="outline" onClick={() => onNavigate?.('ai-providers')}>Check provider health</Button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Recommended free fallback order</CardTitle>
                <CardDescription>The gateway tries authorised routes in priority order and defers (never bills) when free lanes are rate-limited.</CardDescription></CardHeader>
              <CardContent className="pt-0">
                <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700 dark:text-slate-200">
                  {(catalog?.fallbackOrder ?? []).map((item) => <li key={item}>{item}</li>)}
                </ol>
                <div className="mt-4 rounded-lg bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                  # Fully local (no key, offline, unlimited)<br />
                  ollama pull qwen3:30b-a3b<br />
                  ollama pull nomic-embed-text<br />
                  # then add kind “ollama” in the Control Plane<br />
                  # base URL: http://localhost:11434/v1
                </div>
                {catalog?.disclaimer && <p className="mt-3 text-xs text-slate-400">{catalog.disclaimer}</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
