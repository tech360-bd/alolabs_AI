'use client'

/** /portal/support/:id — one support request and its conversation. */

import * as React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { BRAND } from '@/lib/brand/tokens'
import { ChevronLeft, Send } from 'lucide-react'
import {
  ErrorBanner, LoadingRows, PortalPageHero, SectionCard, StatusPill, fmtDate, usePortalData, usePortalFetch,
} from '@/components/portal/portal-primitives'

interface Detail {
  ticket: { id: string; reference: string; subject: string; category: string; priority: string; status: string; statusLabel: string; firstResponseAt: string | null; resolvedAt: string | null; resolutionSummary: string | null; createdAt: string | null }
  messages: { id: string; from: string; senderName: string; body: string; createdAt: string | null }[]
}

export default function PortalTicketPage() {
  const { id } = useParams<{ id: string }>()
  const { portalFetch } = usePortalFetch()
  const { data, loading, error, reload } = usePortalData<Detail>(id ? `/tickets/${id}` : null)
  const [draft, setDraft] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [actionError, setActionError] = React.useState('')

  const act = async (body: Record<string, unknown>) => {
    setBusy(true)
    setActionError('')
    try {
      await portalFetch(`/tickets/${id}`, { method: 'POST', body: JSON.stringify(body) })
      setDraft('')
      reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const back = (
    <Link href="/portal/support" className="mb-4 inline-flex items-center gap-1 text-[13px] font-medium" style={{ color: BRAND.blue }}>
      <ChevronLeft className="size-4" /> All requests
    </Link>
  )
  if (loading) return <>{back}<LoadingRows rows={3} /></>
  if (error) return <>{back}<ErrorBanner message={error} onRetry={reload} /></>
  if (!data) return null
  const { ticket } = data
  const closed = ticket.status === 'closed'
  const resolved = ticket.status === 'resolved'

  return (
    <>
      {back}
      <PortalPageHero eyebrow={`Support request · ${ticket.reference}`} title={ticket.subject} />
      {actionError ? <div className="mb-4"><ErrorBanner message={actionError} /></div> : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard className="lg:col-span-2" title="Conversation">
          <div className="space-y-3">
            {data.messages.map((m) => (
              <div key={m.id} className={`flex ${m.from === 'you' ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[85%] rounded-lg px-4 py-2.5" style={m.from === 'you' ? { background: BRAND.blue, color: '#FFFFFF' } : { background: BRAND.tintSoft, color: BRAND.ink }}>
                  <p className="text-[11px] font-semibold opacity-80">{m.from === 'you' ? 'You' : m.senderName} · {fmtDate(m.createdAt)}</p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed">{m.body}</p>
                </div>
              </div>
            ))}
          </div>
          <form className="mt-5 space-y-2" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) void act({ action: closed || resolved ? 'reopen' : 'reply', body: draft }) }}>
            <Textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={5000} aria-label="Reply"
              placeholder={closed || resolved ? 'Still need help? Write a message to reopen this request.' : 'Write a reply…'} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy || !draft.trim()} className="gap-2" style={{ background: BRAND.blue, color: '#FFFFFF' }}>
                <Send className="size-4" /> {closed || resolved ? 'Reopen request' : 'Send reply'}
              </Button>
              {!closed ? (
                <Button type="button" variant="outline" disabled={busy} onClick={() => void act({ action: 'close' })}>
                  {resolved ? 'Confirm and close' : 'Close request'}
                </Button>
              ) : null}
            </div>
          </form>
        </SectionCard>

        <SectionCard title="Request details" action={<StatusPill status={ticket.status} label={ticket.statusLabel} />}>
          <dl className="space-y-3 text-[13px]">
            <div><dt className="text-[11px] uppercase tracking-[0.1em]" style={{ color: BRAND.gray }}>Opened</dt><dd style={{ color: BRAND.ink }}>{fmtDate(ticket.createdAt)}</dd></div>
            <div><dt className="text-[11px] uppercase tracking-[0.1em]" style={{ color: BRAND.gray }}>First response</dt><dd style={{ color: BRAND.ink }}>{ticket.firstResponseAt ? fmtDate(ticket.firstResponseAt) : 'Awaiting our response'}</dd></div>
            <div><dt className="text-[11px] uppercase tracking-[0.1em]" style={{ color: BRAND.gray }}>Priority</dt><dd className="capitalize" style={{ color: BRAND.ink }}>{ticket.priority}</dd></div>
            {ticket.resolvedAt ? <div><dt className="text-[11px] uppercase tracking-[0.1em]" style={{ color: BRAND.gray }}>Resolved</dt><dd style={{ color: BRAND.ink }}>{fmtDate(ticket.resolvedAt)}</dd></div> : null}
            {ticket.resolutionSummary ? <div><dt className="text-[11px] uppercase tracking-[0.1em]" style={{ color: BRAND.gray }}>Resolution</dt><dd style={{ color: BRAND.ink }}>{ticket.resolutionSummary}</dd></div> : null}
          </dl>
        </SectionCard>
      </div>
    </>
  )
}
