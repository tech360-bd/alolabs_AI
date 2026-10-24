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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fetchApi } from '@/lib/api'
import type { EnterpriseView } from '../enterprise-shell'

// ─── Types ───────────────────────────────────────────────────────────────────

interface TraceStep { step: number; tool: string; args: Record<string, unknown>; ok: boolean; durationMs: number; output: string }
interface ChatReply { success: boolean; response: string; provider: string; model: string; profile: string; steps: number; trace: TraceStep[]; images: string[]; company: { name: string } }
interface FreeModel { id: string; name: string; strength: string; capabilities: string[]; contextLength?: number }
interface FreeProvider { id: string; label: string; providerKind: string; baseUrl: string; getKeyUrl: string; envVar?: string; apiKeyRequired: boolean; cardRequired: boolean; local: boolean; freeAllowance: string; notes: string; models: FreeModel[] }
interface FreeService { name: string; category: string; description: string; freeAllowance: string; url: string; apiKeyRequired: boolean; agentTool?: string }
interface AuthorisedModel { id: string; provider: string; routeKind: string }
interface ToolInfo { name: string; description: string; kind: string; category: string }
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
  setupSteps: string[]
  disclaimer: string
}
interface Message { role: 'user' | 'assistant' | 'error'; content: string; provider?: string; model?: string; profile?: string; trace?: TraceStep[]; images?: string[] }

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
    { role: 'assistant', content: "I'm your Command Agent. I run on 100% free models (Groq → OpenRouter :free → Gemini/Cerebras → local Ollama) and can use tools: company knowledge, CRM, weather, Wikipedia, web search, Hacker News, image generation, calculator and more. Give me a command." },
  ])
  const [input, setInput] = useState('')
  const [profile, setProfile] = useState<string>('free_general')
  const [model, setModel] = useState('')
  const [sending, setSending] = useState(false)
  const [sessionId] = useState(() => `cmd-${Date.now().toString(36)}`)
  const [modelFilter, setModelFilter] = useState('')
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
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, sending])

  const send = useCallback(async (text?: string) => {
    const message = (text ?? input).trim()
    if (!message || sending) return
    setInput('')
    setSending(true)
    setMessages((prev) => [...prev, { role: 'user', content: message }])
    try {
      const reply = await fetchApi<ChatReply>('/api/command-agent/chat', {
        method: 'POST',
        body: JSON.stringify({ message, sessionId, profile, ...(model.trim() ? { model: model.trim() } : {}) }),
      })
      setMessages((prev) => [...prev, {
        role: 'assistant', content: reply.response, provider: reply.provider, model: reply.model,
        profile: reply.profile, trace: reply.trace, images: reply.images,
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
    }
  }, [input, sending, sessionId, profile, model])

  const clear = useCallback(async () => {
    setMessages([])
    try { await fetchApi(`/api/command-agent/chat?sessionId=${encodeURIComponent(sessionId)}`, { method: 'DELETE' }) } catch { /* non-fatal */ }
  }, [sessionId])

  const filteredProviders = (catalog?.providers ?? []).map((provider) => ({
    ...provider,
    models: provider.models.filter((m) => !modelFilter || `${provider.label} ${m.id} ${m.name} ${m.strength}`.toLowerCase().includes(modelFilter.toLowerCase())),
  })).filter((provider) => provider.models.length > 0)
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
            <Terminal className="h-6 w-6 text-[#003ABC]" /> Commanding Center
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
          <TabsTrigger value="setup"><ListChecks className="mr-1.5 h-3.5 w-3.5" /> $0 Setup</TabsTrigger>
        </TabsList>

        {/* ─── Agent ─── */}
        <TabsContent value="agent" className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
          <Card className="flex min-h-0 flex-1 flex-col border-[#003ABC]/20">
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
                <span className="ml-auto hidden items-center gap-1.5 text-xs text-slate-500 md:flex"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Read-only tools · every call audited · $0 routes only</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_COMMANDS.map((cmd) => {
                  const Icon = cmd.icon
                  return (
                    <button key={cmd.label} onClick={() => void send(cmd.prompt)} disabled={sending} className="flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition-colors hover:border-[#003ABC]/40 hover:text-[#003ABC] disabled:opacity-50 dark:border-slate-700 dark:text-slate-400">
                      <Icon className="h-3.5 w-3.5" /> {cmd.label}
                    </button>
                  )
                })}
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-0">
              <ScrollArea className="min-h-[320px] flex-1 rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                <div className="space-y-3">
                  {messages.map((msg, i) => (
                    <div key={i} className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-[#003ABC] text-white' : msg.role === 'error' ? 'border border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200' : 'border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'}`}>
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                        {msg.images?.map((src) => (
                          <img key={src} src={src} alt="Generated by Command Agent (Pollinations, free)" className="mt-2 max-h-80 rounded-lg border border-slate-200" loading="lazy" />
                        ))}
                        {msg.trace && msg.trace.length > 0 && <ToolTrace trace={msg.trace} />}
                        {(msg.provider || msg.model) && (
                          <p className="mt-2 text-[11px] text-slate-400">{msg.provider} · <span className="font-mono">{msg.model}</span> · {msg.profile} · $0 route</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {sending && (
                    <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Agent is thinking / calling tools…</div>
                  )}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>
              <form onSubmit={(e) => { e.preventDefault(); void send() }} className="flex shrink-0 gap-2">
                <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Command your agent… e.g. Weather in Tokyo + tell me about Mount Fuji + generate a poster image" className="flex-1" disabled={sending} />
                <Button type="submit" disabled={sending || !input.trim()} className="bg-[#003ABC] text-white hover:bg-[#002a8f]">
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
                    {' '}· <a className="inline-flex items-center gap-0.5 font-medium text-[#003ABC] hover:underline" href={provider.getKeyUrl} target="_blank" rel="noreferrer">Get free key <ExternalLink className="h-3 w-3" /></a>
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
                        {' '}· <a className="inline-flex items-center gap-0.5 text-[#003ABC] hover:underline" href={service.url} target="_blank" rel="noreferrer">Official site <ExternalLink className="h-3 w-3" /></a></p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ─── Setup ─── */}
        <TabsContent value="setup" className="mt-3 min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">$0 setup — step by step</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700 dark:text-slate-200">
                  {(catalog?.setupSteps ?? []).map((step, i) => <li key={i}>{step}</li>)}
                </ol>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" className="bg-[#003ABC] text-white hover:bg-[#002a8f]" onClick={() => onNavigate?.('super-admin-ai')}>Open Super Admin AI Control Plane</Button>
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
