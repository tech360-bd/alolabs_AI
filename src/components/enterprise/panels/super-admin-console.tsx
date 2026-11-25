'use client'

/**
 * Super Admin Console — the ChatGPT-style central operations hub.
 *
 * One conversation surface where the Super Admin runs the platform in natural
 * language through the Command Agent:
 *   - READ mode    → strictly read-only tools (the historic behaviour).
 *   - SUPERVISOR   → adds the audited mutation registry (AI provider
 *     switching, website content blocks, site doctor probes, self-healing).
 *     Mutations only execute for role === 'super_admin', require an explicit
 *     confirmation argument, and are written to the AuditEvent ledger.
 *
 * Sidebar cards surface the same subsystems the agent can act on:
 *   - Site Doctor: real probe history (GET) + run-now (POST).
 *   - Website blocks: what the DB-backed content actually serves right now.
 * Everything else (AI Control Plane, providers, quotas) keeps living in its
 * dedicated panel — this console commands, it does not duplicate.
 */

import { apiFetch } from '@/lib/api-client'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Send, Loader2, Trash2, Wrench, CheckCircle2, XCircle, ShieldAlert,
  Activity, Globe, Sparkles, MessageSquare, Stethoscope, RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface TraceStep { step: number; tool: string; args: Record<string, unknown>; ok: boolean; durationMs: number; output: string }

interface ConsoleMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  provider?: string
  model?: string
  mode?: 'read' | 'supervisor'
  steps?: number
  trace?: TraceStep[]
  error?: boolean
}

interface DoctorProbe {
  target: string
  lastStatus: string
  lastAt: string | null
  lastDetail: string | null
}

interface DoctorStatus {
  targets: DoctorProbe[]
  totals: { healthy: number; degraded: number; unreachable: number; escalated: number }
}

interface SiteBlock {
  page: string
  blockKey: string
  content: unknown
  version: number
  updatedAt: string
}

interface ChatReply {
  success: boolean
  response?: string
  provider?: string
  model?: string
  steps?: number
  trace?: TraceStep[]
  error?: string
}

const QUICK_PROMPTS = [
  { label: 'System status', msg: 'Give me a status of the AI providers, the public site and the self-healing engine.' },
  { label: 'Switch provider', msg: 'Switch the primary AI provider to Groq and keep everything else on standby.' },
  { label: 'Check the site', msg: 'Run the site doctor now and tell me if anything is degraded or unreachable.' },
  { label: 'Announcement', msg: 'Publish an announcement banner on the home page: "Scheduled maintenance Sunday 02:00–04:00 UTC".' },
]

const STATUS_STYLE: Record<string, string> = {
  healthy: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  degraded: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  unreachable: 'bg-red-500/15 text-red-600 dark:text-red-400',
  unknown: 'bg-slate-500/15 text-slate-500',
}

export default function SuperAdminConsole() {
  const [messages, setMessages] = useState<ConsoleMessage[]>([
    {
      id: 'welcome',
      role: 'system',
      content: 'Super Admin Console online. Read-only tools are always available; flip the mode to SUPERVISOR to command provider switches, website updates, site doctor probes and self-healing. Every mutation is confirmed and audited.',
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'read' | 'supervisor'>('read')
  const [sessionId] = useState(() => `console-${Date.now().toString(36)}`)
  const [doctor, setDoctor] = useState<DoctorStatus | null>(null)
  const [blocks, setBlocks] = useState<SiteBlock[]>([])
  const [doctorBusy, setDoctorBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const refreshSidePanels = useCallback(async () => {
    try {
      const doctorRes = await apiFetch('/api/super-admin/site-doctor')
      if (doctorRes?.ok) setDoctor(await doctorRes.json() as DoctorStatus)
    } catch { /* panel stays empty — never a fake status */ }
    try {
      const blocksRes = await apiFetch('/api/public/site-content?page=home')
      if (blocksRes?.ok) {
        const data = await blocksRes.json() as { blocks?: SiteBlock[] }
        setBlocks(data.blocks ?? [])
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { void refreshSidePanels() }, [refreshSidePanels])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function send(text: string) {
    const message = text.trim()
    if (!message || busy) return
    setInput('')
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', content: message }])
    setBusy(true)
    try {
      const reply = await apiFetch('/api/command-agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sessionId, mode }),
      })
      const data = reply?.ok ? await reply.json() as ChatReply : { success: false, error: reply?.status === 401 ? 'Session expired — log in again.' : `Request failed (HTTP ${reply?.status ?? '?'})` }
      if (!data.success) {
        setMessages((prev) => [...prev, {
          id: `a-${Date.now()}`, role: 'assistant', mode,
          content: data.error ?? 'The agent could not answer this turn. No model call succeeded — nothing was changed.',
          error: true,
        }])
      } else {
        setMessages((prev) => [...prev, {
          id: `a-${Date.now()}`, role: 'assistant', mode,
          content: data.response ?? '',
          provider: data.provider, model: data.model, steps: data.steps, trace: data.trace,
        }])
        void refreshSidePanels()
      }
    } catch (error) {
      setMessages((prev) => [...prev, {
        id: `a-${Date.now()}`, role: 'assistant', mode,
        content: `Network failure: ${error instanceof Error ? error.message : 'unknown'}. Nothing was changed.`,
        error: true,
      }])
    } finally {
      setBusy(false)
    }
  }

  async function runDoctorNow() {
    setDoctorBusy(true)
    try {
      const res = await apiFetch('/api/super-admin/site-doctor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      if (res?.ok) {
        const report = await res.json() as { results?: Array<{ target: string; status: string; httpStatus?: number | null; escalated?: boolean }> }
        const summary = (report.results ?? []).map((r) => `${r.target}: ${r.status}${r.httpStatus ? ` (HTTP ${r.httpStatus})` : ''}${r.escalated ? ' — escalated' : ''}`).join(' · ')
        setMessages((prev) => [...prev, {
          id: `d-${Date.now()}`, role: 'assistant',
          content: summary ? `Site doctor cycle complete. ${summary}` : 'Site doctor cycle complete — no targets configured (set SITE_DOCTOR_TARGETS).',
        }])
        void refreshSidePanels()
      } else {
        setMessages((prev) => [...prev, { id: `d-${Date.now()}`, role: 'assistant', content: 'Site doctor run failed — see server logs.', error: true }])
      }
    } finally {
      setDoctorBusy(false)
    }
  }

  function clearChat() {
    setMessages((prev) => [prev[0]])
    void apiFetch(`/api/command-agent/chat?sessionId=${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-160px)] min-h-[540px]">
      {/* Sidebar */}
      <aside className="w-full lg:w-72 shrink-0 flex lg:flex-col gap-3 overflow-x-auto lg:overflow-y-auto">
        <div className="rounded-xl border bg-card p-4 min-w-[260px] lg:min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Stethoscope className="h-4 w-4 text-[#0066CC]" /> Site Doctor
          </div>
          {doctor ? (
            <div className="mt-3 space-y-2 text-xs">
              {doctor.targets.map((t) => (
                <div key={t.target} className="flex items-center justify-between gap-2">
                  <span className="truncate" title={t.target}>{t.target.replace(/^https?:\/\//, '')}</span>
                  <Badge className={cn('text-[10px]', STATUS_STYLE[t.lastStatus] ?? STATUS_STYLE.unknown)}>{t.lastStatus}</Badge>
                </div>
              ))}
              <div className="pt-2 text-muted-foreground">
                healthy {doctor.totals.healthy} · degraded {doctor.totals.degraded} · unreachable {doctor.totals.unreachable} · escalated {doctor.totals.escalated}
              </div>
            </div>
          ) : (
            <div className="mt-3 text-xs text-muted-foreground">No probe data yet.</div>
          )}
          <Button size="sm" variant="outline" className="mt-3 w-full" onClick={runDoctorNow} disabled={doctorBusy}>
            {doctorBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Run probes now
          </Button>
        </div>

        <div className="rounded-xl border bg-card p-4 min-w-[260px] lg:min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Globe className="h-4 w-4 text-[#0066CC]" /> Website blocks <span className="text-muted-foreground font-normal">(live)</span>
          </div>
          {blocks.length ? (
            <div className="mt-3 space-y-2 text-xs">
              {blocks.map((b) => (
                <div key={`${b.page}:${b.blockKey}`} className="rounded-md border px-2 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono">{b.page}:{b.blockKey}</span>
                    <Badge variant="secondary" className="text-[10px]">v{b.version}</Badge>
                  </div>
                  <div className="mt-1 truncate text-muted-foreground" title={JSON.stringify(b.content)}>
                    {JSON.stringify(b.content)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 text-xs text-muted-foreground">
              No overrides — pages serve their code defaults. Ask the agent in SUPERVISOR mode to publish one.
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4 min-w-[260px] lg:min-w-0 text-xs text-muted-foreground space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-1">
            <ShieldAlert className="h-4 w-4 text-[#E8501A]" /> Safety rails
          </div>
          <div>· Supervisor mutations: super_admin only</div>
          <div>· Explicit {"{confirm}"} argument required</div>
          <div>· AuditEvent before/after on every write</div>
          <div>· Failed recoveries are reported as failed</div>
        </div>
      </aside>

      {/* Chat */}
      <section className="flex-1 min-w-0 flex flex-col rounded-xl border bg-card">
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-4 w-4 text-[#E8501A]" />
            <span className="font-medium truncate">Command the platform in natural language</span>
            <Badge variant={mode === 'supervisor' ? 'destructive' : 'secondary'} className="shrink-0">
              {mode === 'supervisor' ? 'SUPERVISOR' : 'READ-ONLY'}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm" variant={mode === 'supervisor' ? 'destructive' : 'outline'}
              onClick={() => setMode((m) => (m === 'supervisor' ? 'read' : 'supervisor'))}
              title="Supervisor mode exposes the audited mutation tools"
            >
              {mode === 'supervisor' ? 'Leave supervisor' : 'Enable supervisor'}
            </Button>
            <Button size="sm" variant="ghost" onClick={clearChat} title="Clear conversation">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <ScrollArea className="flex-1 px-4 py-3">
          <div className="space-y-3">
            {messages.map((m) => (
              <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words',
                    m.role === 'user' && 'bg-[#0066CC] text-white rounded-br-sm',
                    m.role === 'assistant' && !m.error && 'bg-muted rounded-bl-sm',
                    m.role === 'assistant' && m.error && 'bg-red-500/10 text-red-600 dark:text-red-400 rounded-bl-sm border border-red-500/30',
                    m.role === 'system' && 'bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs rounded-xl',
                  )}
                >
                  {m.content}
                  {m.role === 'assistant' && m.provider && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] opacity-70">
                      <Badge variant="outline" className="text-[10px]">{m.provider} / {m.model}</Badge>
                      <Badge variant="outline" className="text-[10px]">{m.mode} · {m.steps ?? 0} steps</Badge>
                    </div>
                  )}
                  {m.trace?.length ? (
                    <div className="mt-2 space-y-1">
                      {m.trace.map((t, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-[10px] opacity-80">
                          {t.ok ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <XCircle className="h-3 w-3 text-red-500" />}
                          <Wrench className="h-3 w-3" />
                          <span className="font-mono">{t.tool}</span>
                          <span>· {t.durationMs}ms</span>
                          <span className="truncate opacity-70" title={t.output}>{t.output}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Routing through the free-tier gateway…
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        <div className="border-t px-4 py-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q.label}
                onClick={() => void send(q.msg)}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50"
              >
                <MessageSquare className="h-3 w-3" /> {q.label}
              </button>
            ))}
          </div>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => { e.preventDefault(); void send(input) }}
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input) }
              }}
              placeholder={mode === 'supervisor'
                ? 'Supervisor: describe the change — provider switch, website update, probe, recovery…'
                : 'Ask anything — lookups, reports, research (read-only)…'}
              rows={1}
              className="min-h-[44px] max-h-40 resize-none"
            />
            <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Activity className="h-3 w-3" /> Enter to send · Shift+Enter for a new line · every mutation is audited
          </div>
        </div>
      </section>
    </div>
  )
}
