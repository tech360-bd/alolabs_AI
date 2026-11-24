'use client'

/**
 * Unified chat surface — the single conversational entry point.
 *
 * Registered in the dashboard as view id `chat` (and set as the default view).
 * It talks to `/api/chat`, which persists to `Conversation` /
 * `ConversationMessage` and infers through `executeCompanyAIChat`.
 *
 * Deliberate honesty rules in the UI, mirroring the backend:
 *  - A failed turn is rendered as a failure with a Retry action. It is never
 *    dressed up as an answer.
 *  - The UI does not claim the assistant can run commands, edit files or
 *    deploy; the backend refuses those and the empty state says so.
 *  - Code is rendered in a copyable block rather than executed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import { useAppStore } from '@/store/app'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  Check,
  Copy,
  Loader2,
  MessageSquarePlus,
  RotateCcw,
  Search,
  Send,
  Trash2,
} from 'lucide-react'

interface ConversationRow {
  id: string
  title: string
  status: string
  updatedAt: string
}

interface MessageRow {
  id: string
  role: string
  content: string
  model?: string | null
  latencyMs?: number | null
  createdAt: string
  status?: 'ok' | 'failed'
}

interface ChatMessage extends MessageRow {
  pending?: boolean
}

/** Split a reply into markdown-ish text and fenced code blocks for rendering. */
function renderParts(content: string): Array<{ type: 'text' | 'code'; value: string; lang?: string }> {
  const parts: Array<{ type: 'text' | 'code'; value: string; lang?: string }> = []
  const fence = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = fence.exec(content)) !== null) {
    if (match.index > last) parts.push({ type: 'text', value: content.slice(last, match.index) })
    parts.push({ type: 'code', value: match[2], lang: match[1] || undefined })
    last = match.index + match[0].length
  }
  if (last < content.length) parts.push({ type: 'text', value: content.slice(last) })
  return parts.length > 0 ? parts : [{ type: 'text', value: content }]
}

function CodeBlock({ value, lang }: { value: string; lang?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard may be blocked; the text is still selectable */
    }
  }, [value])

  return (
    <div className="my-2 overflow-hidden rounded-md border border-slate-700 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-700 px-3 py-1.5">
        <span className="text-[11px] uppercase tracking-wide text-slate-400">{lang ?? 'code'}</span>
        <button type="button" onClick={copy} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2 text-xs leading-relaxed text-slate-100">
        <code>{value}</code>
      </pre>
    </div>
  )
}

export default function UnifiedChat() {
  const token = useAppStore((state) => state.token)
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const headers = useMemo(
    () => ({ 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }),
    [token],
  )

  const loadConversations = useCallback(async () => {
    try {
      const res = await apiFetch('/api/chat', { headers })
      if (!res.ok) throw new Error(`Failed to load conversations (${res.status})`)
      const json = (await res.json()) as { conversations?: ConversationRow[] }
      setConversations(json.conversations ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations')
    } finally {
      setLoading(false)
    }
  }, [headers])

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  const openConversation = useCallback(
    async (id: string) => {
      setActiveId(id)
      setError(null)
      try {
        const res = await apiFetch(`/api/chat?id=${encodeURIComponent(id)}`, { headers })
        if (!res.ok) throw new Error(`Failed to load conversation (${res.status})`)
        const json = (await res.json()) as { messages?: MessageRow[] }
        setMessages(
          (json.messages ?? []).map((m) => ({
            ...m,
            // System rows written on failure are surfaced as failures.
            status: m.role === 'system' ? 'failed' : 'ok',
          })),
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load conversation')
      }
    },
    [headers],
  )

  const send = useCallback(
    async (text: string, conversationId?: string | null) => {
      const content = text.trim()
      if (!content || sending) return
      setError(null)
      setSending(true)
      setInput('')

      const optimistic: ChatMessage = {
        id: `local-${Date.now()}`,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
        pending: true,
      }
      setMessages((prev) => [...prev, optimistic])

      try {
        const res = await apiFetch('/api/chat', {
          method: 'POST',
          headers,
          body: JSON.stringify({ message: content, ...(conversationId ? { conversationId } : {}) }),
        })
        const json = (await res.json()) as {
          conversationId?: string
          message?: MessageRow
          error?: string
          failed?: boolean
        }

        setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? { ...m, pending: false } : m)))

        if (!res.ok || json.failed) {
          // A failed turn stays failed. It is not shown as an answer.
          setMessages((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              role: 'system',
              content: json.error ?? 'The AI request failed.',
              createdAt: new Date().toISOString(),
              status: 'failed',
            },
          ])
          setError(json.error ?? 'The AI request failed.')
          return
        }

        if (json.conversationId) setActiveId(json.conversationId)
        if (json.message) setMessages((prev) => [...prev, { ...json.message!, status: 'ok' }])
        void loadConversations()
      } catch (err) {
        setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? { ...m, pending: false } : m)))
        setError(err instanceof Error ? err.message : 'Network error')
      } finally {
        setSending(false)
      }
    },
    [headers, loadConversations, sending],
  )

  const startNew = useCallback(() => {
    setActiveId(null)
    setMessages([])
    setError(null)
    setInput('')
  }, [])

  const archive = useCallback(
    async (id: string) => {
      await apiFetch(`/api/chat?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers }).catch(() => undefined)
      if (activeId === id) startNew()
      void loadConversations()
    },
    [activeId, headers, loadConversations, startNew],
  )

  const retryLast = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (lastUser) void send(lastUser.content, activeId)
  }, [messages, send, activeId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((c) => c.title.toLowerCase().includes(q))
  }, [conversations, search])

  const lastFailed = messages.length > 0 && messages[messages.length - 1]?.status === 'failed'

  return (
    <div className="flex h-[calc(100vh-var(--header-height,3.5rem)-2rem)] min-h-[560px] overflow-hidden rounded-lg border border-slate-200 bg-white">
      {/* Conversation list */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 md:flex">
        <div className="space-y-2 border-b border-slate-200 p-3">
          <Button onClick={startNew} className="w-full justify-start gap-2" size="sm">
            <MessageSquarePlus className="h-4 w-4" />
            New chat
          </Button>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations"
              className="h-8 pl-7 text-xs"
              aria-label="Search conversations"
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <ul className="p-2">
            {loading && <li className="px-2 py-3 text-xs text-slate-500">Loading…</li>}
            {!loading && filtered.length === 0 && (
              <li className="px-2 py-3 text-xs text-slate-500">No conversations yet.</li>
            )}
            {filtered.map((c) => (
              <li key={c.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void openConversation(c.id)}
                  className={`flex-1 truncate rounded px-2 py-1.5 text-left text-xs ${
                    activeId === c.id ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                  title={c.title}
                >
                  {c.title || 'Untitled'}
                </button>
                <button
                  type="button"
                  onClick={() => void archive(c.id)}
                  className="opacity-0 transition group-hover:opacity-100"
                  aria-label={`Archive ${c.title}`}
                >
                  <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-red-500" />
                </button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </aside>

      {/* Conversation */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
          {messages.length === 0 && (
            <div className="mx-auto max-w-xl py-10 text-center">
              <h2 className="text-lg font-semibold text-slate-900">Ask ALO Labs AI</h2>
              <p className="mt-2 text-sm text-slate-500">
                Chat here for answers, explanations, code, and planning. Running commands, editing project files and
                deploying require a separate approved workflow — this chat will say so rather than pretend otherwise.
              </p>
            </div>
          )}
          <div className="mx-auto max-w-3xl space-y-4">
            {messages.map((m) => (
              <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={
                    m.role === 'user'
                      ? 'max-w-[85%] rounded-lg bg-slate-900 px-3 py-2 text-sm text-white'
                      : m.status === 'failed'
                        ? 'max-w-[85%] rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800'
                        : 'max-w-[85%] rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-900'
                  }
                >
                  {m.role === 'user' ? (
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  ) : (
                    <>
                      {renderParts(m.content).map((part, i) =>
                        part.type === 'code' ? (
                          <CodeBlock key={i} value={part.value} lang={part.lang} />
                        ) : (
                          <p key={i} className="whitespace-pre-wrap">
                            {part.value}
                          </p>
                        ),
                      )}
                      {(m.model || typeof m.latencyMs === 'number') && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {m.model && <Badge variant="secondary" className="text-[10px]">{m.model}</Badge>}
                          {typeof m.latencyMs === 'number' && (
                            <span className="text-[10px] text-slate-500">{m.latencyMs} ms</span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  {m.pending && <span className="ml-2 text-[10px] opacity-60">sending…</span>}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Waiting for the model…
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mx-4 mb-2 flex items-start justify-between gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            <span>{error}</span>
            {lastFailed && (
              <Button size="sm" variant="outline" onClick={retryLast} className="h-6 gap-1 text-[11px]">
                <RotateCcw className="h-3 w-3" /> Retry
              </Button>
            )}
          </div>
        )}

        <form
          className="border-t border-slate-200 p-3"
          onSubmit={(e) => {
            e.preventDefault()
            void send(input, activeId)
          }}
        >
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Send a message…"
              disabled={sending}
              aria-label="Message"
              className="min-h-10"
            />
            <Button type="submit" disabled={sending || !input.trim()} className="gap-1.5">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}
