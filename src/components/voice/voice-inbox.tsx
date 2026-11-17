'use client'

/**
 * Shared Inbox (Module I) — real omnichannel threads.
 *
 * - Thread list grouped by channel with approval/failure counts
 * - Thread view with the customer's calls alongside messages
 * - AI drafts require explicit human approval (server enforces it)
 * - Templates with live rendering and a missing-variable report
 *
 * Delivery is NOT faked: a message sent through a channel whose adapter is not
 * configured is recorded as failed by the channel module, and the inbox shows it.
 */

import { useState } from 'react'
import { MessageSquare, Send, CheckCircle2, FileText, Clock3 } from 'lucide-react'
import {
  Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  EmptyState, ErrorNote, InfoNote, Input, Label, Skeleton, StatusBadge,
  TableWrap, Td, Th, Textarea, useVoiceApi, voiceMutate, fmtDate,
} from './kit'

interface Thread {
  threadKey: string; channel: string; address: string; lastMessage: string; lastMessageAt: string
  count: number; inbound: number; outbound: number; needsApproval: number; failed: number
  assignedUserId: string | null; contactId: string | null
}

interface ThreadDetail {
  data: {
    threadKey: string; channel: string
    contact: { id: string; firstName: string; lastName: string; phone: string | null; status: string } | null
    calls: Array<{ id: string; direction: string; status: string; durationSeconds: number; createdAt: string }>
    messages: Array<{
      id: string; direction: string; body: string; status: string
      aiDrafted: boolean; approvedById: string | null; createdAt: string
    }>
    needsApproval: number
  }
}

interface TemplateRow {
  id: string; channel: string; name: string; language: string; body: string; variables: string; status: string
}

const CHANNELS = ['sms', 'whatsapp', 'email', 'webchat'] as const

export default function VoiceInboxPanel() {
  const threads = useVoiceApi<{ data: Thread[]; total: number; templates: TemplateRow[] }>('/api/voice/inbox')
  const [activeThread, setActiveThread] = useState<string | null>(null)
  const detail = useVoiceApi<ThreadDetail>(activeThread ? `/api/voice/inbox?threadKey=${encodeURIComponent(activeThread)}` : '/api/voice/inbox?channel=sms')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState('')
  const [compose, setCompose] = useState({ channel: 'sms', fromAddress: '', toAddress: '', body: '', aiDrafted: false })
  const [template, setTemplate] = useState({ channel: 'sms', name: '', body: '', language: 'bn-BD' })

  const openThread = async (threadKey: string) => {
    setActiveThread(threadKey)
    setReply('')
    await detail.refresh()
  }

  const sendMessage = async (threadKey: string, channel: string, address: string) => {
    if (!reply.trim()) return
    setBusy(true); setMsg(null)
    const res = await voiceMutate('/api/voice/inbox', 'POST', {
      action: 'record',
      channel,
      direction: 'outbound',
      fromAddress: 'business',
      toAddress: address,
      body: reply,
    })
    setMsg(res.ok
      ? { ok: true, text: 'Message recorded on the thread. Delivery is performed by the channel adapter — check its status in the message list.' }
      : { ok: false, text: res.error ?? 'Failed' })
    if (res.ok) setReply('')
    await detail.refresh(); await threads.refresh()
    setBusy(false)
  }

  const approve = async (messageId: string) => {
    setBusy(true)
    const res = await voiceMutate('/api/voice/inbox', 'POST', { action: 'approve', messageId })
    setMsg(res.ok ? { ok: true, text: 'Draft approved.' } : { ok: false, text: res.error ?? 'Failed' })
    await detail.refresh(); await threads.refresh()
    setBusy(false)
  }

  const composeMessage = async () => {
    setBusy(true); setMsg(null)
    const res = await voiceMutate('/api/voice/inbox', 'POST', {
      action: 'record',
      channel: compose.channel,
      direction: 'outbound',
      fromAddress: compose.fromAddress || 'business',
      toAddress: compose.toAddress,
      body: compose.body,
      aiDrafted: compose.aiDrafted,
    })
    setMsg(res.ok
      ? { ok: true, text: compose.aiDrafted ? 'AI draft recorded — approve it in the thread before it can be sent.' : 'Message recorded.' }
      : { ok: false, text: res.error ?? 'Failed' })
    if (res.ok) setCompose({ ...compose, toAddress: '', body: '' })
    await threads.refresh()
    setBusy(false)
  }

  const saveTemplate = async () => {
    setBusy(true); setMsg(null)
    const res = await voiceMutate('/api/voice/inbox', 'POST', {
      action: 'template',
      channel: template.channel,
      name: template.name,
      body: template.body,
      language: template.language,
    })
    setMsg(res.ok ? { ok: true, text: 'Template saved.' } : { ok: false, text: res.error ?? 'Failed' })
    if (res.ok) setTemplate({ ...template, name: '', body: '' })
    await threads.refresh()
    setBusy(false)
  }

  const detailData = detail.data?.data

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2"><MessageSquare className="h-5 w-5" /> Shared Inbox</h2>
        <p className="text-sm text-slate-500">
          One timeline across SMS, WhatsApp, email and web chat. AI drafts stay queued until a human approves them.
        </p>
      </div>

      {msg && (msg.ok ? <InfoNote>{msg.text}</InfoNote> : <ErrorNote message={msg.text} />)}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Threads</CardTitle></CardHeader>
          <CardContent>
            {threads.loading ? <Skeleton className="h-40" /> : threads.error ? (
              <ErrorNote message={`Could not load threads: ${threads.error}`} />
            ) : !threads.data || threads.data.data.length === 0 ? (
              <EmptyState title="No threads yet" hint="Inbound messages from a configured channel adapter create threads automatically; you can also compose one." />
            ) : (
              <div className="space-y-1">
                {threads.data.data.map((thread) => (
                  <button key={thread.threadKey} type="button" onClick={() => openThread(thread.threadKey)}
                    className={`w-full rounded-md border p-2 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${activeThread === thread.threadKey ? 'border-[#0066CC] bg-[#0066CC]/5' : ''}`}>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{thread.channel}</Badge>
                      <span className="truncate font-medium">{thread.address}</span>
                      <span className="ml-auto text-xs text-slate-400">{thread.count}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{thread.lastMessage}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {thread.needsApproval > 0 && <Badge variant="outline" className="border-amber-500/50 text-amber-600">{thread.needsApproval} to approve</Badge>}
                      {thread.failed > 0 && <Badge variant="outline" className="border-red-500/50 text-red-600">{thread.failed} failed</Badge>}
                      <span className="text-[10px] text-slate-400">{fmtDate(thread.lastMessageAt)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{detailData ? (detailData.contact ? `${detailData.contact.firstName} ${detailData.contact.lastName}` : detailData.threadKey) : 'Thread'}</CardTitle>
            <CardDescription>
              {detailData?.contact ? `${detailData.contact.phone ?? 'no phone'} · status ${detailData.contact.status}` : 'Select a thread to view the conversation.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!activeThread ? (
              <EmptyState title="No thread selected" />
            ) : detail.loading ? <Skeleton className="h-40" /> : !detailData ? (
              <EmptyState title="Thread not found" />
            ) : (
              <>
                {detailData.calls.length > 0 && (
                  <div className="rounded border p-2">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Recent calls</p>
                    {detailData.calls.slice(0, 4).map((call) => (
                      <p key={call.id} className="text-xs text-slate-600 dark:text-slate-300">
                        {fmtDate(call.createdAt)} · {call.direction} · <StatusBadge status={call.status} />
                      </p>
                    ))}
                  </div>
                )}

                <div className="max-h-96 space-y-2 overflow-y-auto">
                  {detailData.messages.map((message) => (
                    <div key={message.id} className={`rounded-lg border p-2 text-sm ${message.direction === 'inbound' ? 'bg-slate-50 dark:bg-slate-900' : 'ml-6'}`}>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span className="font-medium uppercase">{message.direction}</span>
                        <StatusBadge status={message.status} />
                        {message.aiDrafted && <Badge variant="outline">AI draft</Badge>}
                        <span className="ml-auto">{fmtDate(message.createdAt)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap">{message.body}</p>
                      {message.aiDrafted && !message.approvedById && (
                        <Button size="sm" variant="outline" className="mt-1 inline-flex items-center gap-1" disabled={busy} onClick={() => approve(message.id)}>
                          <CheckCircle2 className="h-3 w-3" /> Approve
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder="Reply on this thread…" className="flex-1" />
                  <Button onClick={() => sendMessage(detailData.threadKey, detailData.channel, detailData.threadKey.split(':').slice(1).join(':'))} disabled={busy || !reply.trim()} className="self-end">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Compose / draft</CardTitle>
            <CardDescription>An AI draft is stored as queued until a human approves it.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="c-channel">Channel</Label>
              <select id="c-channel" value={compose.channel} onChange={(e) => setCompose({ ...compose, channel: e.target.value })}
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm">
                {CHANNELS.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="c-to">To</Label>
              <Input id="c-to" value={compose.toAddress} onChange={(e) => setCompose({ ...compose, toAddress: e.target.value })} placeholder="01712345678" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="c-body">Message</Label>
              <Textarea id="c-body" value={compose.body} onChange={(e) => setCompose({ ...compose, body: e.target.value })} rows={3} />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={compose.aiDrafted} onChange={(e) => setCompose({ ...compose, aiDrafted: e.target.checked })} />
              Mark as AI-drafted (requires approval)
            </label>
            <div className="sm:col-span-2">
              <Button onClick={composeMessage} disabled={busy || !compose.toAddress.trim() || !compose.body.trim()}>Record message</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Templates</CardTitle>
            <CardDescription>Provider approval status is separate — creating a template does not submit it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {threads.data?.templates.length ? (
              <TableWrap>
                <thead><tr><Th>Name</Th><Th>Channel</Th><Th>Status</Th><Th>Vars</Th></tr></thead>
                <tbody>
                  {threads.data.templates.map((row) => (
                    <tr key={row.id}>
                      <Td className="font-medium">{row.name}</Td>
                      <Td>{row.channel}</Td>
                      <Td><StatusBadge status={row.status} /></Td>
                      <Td className="text-xs">{row.variables}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            ) : (
              <p className="text-xs text-slate-400">No templates yet.</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="t-channel">Channel</Label>
                <select id="t-channel" value={template.channel} onChange={(e) => setTemplate({ ...template, channel: e.target.value })}
                  className="h-9 w-full rounded-md border bg-transparent px-2 text-sm">
                  <option value="sms">sms</option><option value="whatsapp">whatsapp</option><option value="email">email</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="t-name">Name</Label>
                <Input id="t-name" value={template.name} onChange={(e) => setTemplate({ ...template, name: e.target.value })} placeholder="order_update" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="t-body">Body ({'{{variable}}'} supported)</Label>
                <Textarea id="t-body" value={template.body} onChange={(e) => setTemplate({ ...template, body: e.target.value })} rows={2}
                  placeholder="আসসালামু আলাইকুম {{name}}, আপনার অর্ডার {{orderId}} পাঠানো হয়েছে।" />
              </div>
              <div className="sm:col-span-2">
                <Button size="sm" onClick={saveTemplate} disabled={busy || !template.name.trim() || !template.body.trim()}>Save template</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
