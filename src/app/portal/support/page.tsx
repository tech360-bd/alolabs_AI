'use client'

/** /portal/support — support requests, their response status, and the account manager. */

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { BRAND } from '@/lib/brand/tokens'
import {
  PortalPageHero, SectionCard, Spinner, StateList, StatusPill, fmtDate, usePortalData, usePortalFetch,
} from '@/components/portal/portal-primitives'

interface Ticket { id: string; reference: string; subject: string; category: string; priority: string; status: string; statusLabel: string; resolvedAt: string | null; resolutionSummary: string | null; createdAt: string | null; updatedAt: string | null }
interface Manager { name: string; title: string | null; email: string | null; phone: string | null }

const CATEGORIES = [['general', 'General'], ['project', 'A project'], ['billing', 'Billing'], ['technical', 'Technical'], ['account', 'My account']]
const PRIORITIES = [['low', 'Low'], ['normal', 'Normal'], ['high', 'High'], ['urgent', 'Urgent']]
const selectClass = 'h-9 w-full rounded-md border bg-white px-3 text-[13px]'

export default function PortalSupportPage() {
  const router = useRouter()
  const { portalFetch } = usePortalFetch()
  const { data, loading, error, reload } = usePortalData<{ tickets: Ticket[]; accountManager: Manager | null }>('/tickets')
  const [subject, setSubject] = React.useState('')
  const [message, setMessage] = React.useState('')
  const [category, setCategory] = React.useState('general')
  const [priority, setPriority] = React.useState('normal')
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState('')
  const tickets = data?.tickets ?? []
  const openTickets = tickets.filter((t) => !['resolved', 'closed'].includes(t.status))
  const history = tickets.filter((t) => ['resolved', 'closed'].includes(t.status))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setFormError('')
    try {
      const result = await portalFetch<{ ticket: { id: string } }>('/tickets', { method: 'POST', body: JSON.stringify({ subject, message, category, priority }) })
      router.push(`/portal/support/${result.ticket.id}`)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong.')
      setSubmitting(false)
    }
  }

  const list = (items: Ticket[]) => (
    <div className="space-y-2">
      {items.map((t) => (
        <Link key={t.id} href={`/portal/support/${t.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 hover:bg-slate-50" style={{ borderColor: BRAND.grayLine }}>
          <span>
            <span className="block text-[13px] font-semibold" style={{ color: BRAND.ink }}>{t.subject}</span>
            <span className="block text-[11px]" style={{ color: BRAND.gray }}>
              {t.reference} · opened {fmtDate(t.createdAt)}{t.resolvedAt ? ` · resolved ${fmtDate(t.resolvedAt)}` : ''}
            </span>
            {t.resolutionSummary ? <span className="mt-1 block text-[12px]" style={{ color: BRAND.gray }}>{t.resolutionSummary}</span> : null}
          </span>
          <StatusPill status={t.status} label={t.statusLabel} />
        </Link>
      ))}
    </div>
  )

  return (
    <>
      <PortalPageHero eyebrow="Support" title="How can we help?" lead="Open a request and our team will respond here. You can follow every reply and see how each request was resolved." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard title="Open requests">
            <StateList loading={loading} error={error} isEmpty={openTickets.length === 0} onRetry={reload} emptyTitle="No open requests" emptyHint="Use the form to contact our team.">
              {list(openTickets)}
            </StateList>
          </SectionCard>
          {history.length > 0 ? <SectionCard title="Resolution history">{list(history)}</SectionCard> : null}
        </div>

        <div className="space-y-6">
          <SectionCard title="Your account manager">
            {data?.accountManager ? (
              <div className="text-[13px]" style={{ color: BRAND.ink }}>
                <p className="font-semibold">{data.accountManager.name}</p>
                {data.accountManager.title ? <p style={{ color: BRAND.gray }}>{data.accountManager.title}</p> : null}
                {data.accountManager.email ? <a className="mt-2 block underline" style={{ color: BRAND.blue }} href={`mailto:${data.accountManager.email}`}>{data.accountManager.email}</a> : null}
                {data.accountManager.phone ? <p>{data.accountManager.phone}</p> : null}
              </div>
            ) : (
              <p className="text-[13px]" style={{ color: BRAND.gray }}>An account manager will be assigned to you. Until then, open a request here and our team will respond.</p>
            )}
          </SectionCard>

          <SectionCard title="New support request">
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="subject">Subject</Label>
                <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} required minLength={3} maxLength={160} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="category">About</Label>
                  <select id="category" className={selectClass} style={{ borderColor: BRAND.grayLine }} value={category} onChange={(e) => setCategory(e.target.value)}>
                    {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="priority">Priority</Label>
                  <select id="priority" className={selectClass} style={{ borderColor: BRAND.grayLine }} value={priority} onChange={(e) => setPriority(e.target.value)}>
                    {PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="message">Message</Label>
                <Textarea id="message" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} required minLength={5} maxLength={5000} />
              </div>
              {formError ? <p role="alert" className="text-[13px]" style={{ color: '#b91c1c' }}>{formError}</p> : null}
              <Button type="submit" disabled={submitting} className="w-full gap-2" style={{ background: BRAND.orange, color: '#FFFFFF' }}>
                {submitting ? <Spinner /> : null} Send request
              </Button>
            </form>
          </SectionCard>
        </div>
      </div>
    </>
  )
}
