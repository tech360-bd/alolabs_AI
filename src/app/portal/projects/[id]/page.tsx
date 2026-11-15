'use client'

/**
 * /portal/projects/:id — one project: status, milestones, deliverables to
 * review, documents, quotations, the conversation with the service team and
 * the history. The client sees what stage the work is at — not how it is done.
 */

import * as React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { BRAND } from '@/lib/brand/tokens'
import { Check, ChevronLeft, Circle, Download, ExternalLink, Paperclip, Send } from 'lucide-react'
import {
  ErrorBanner, LoadingRows, PortalPageHero, ProgressBar, SectionCard, Spinner, StatusPill,
  fmtDate, fmtDay, fmtMoney, fmtSize, usePortalData, usePortalFetch,
} from '@/components/portal/portal-primitives'

interface Detail {
  project: {
    id: string; reference: string; title: string; serviceName: string; requirements: string; status: string
    statusLabel: string; stage: string; stageLabel: string; progress: number; pendingAction: string | null
    targetDate: string | null; createdAt: string | null; completedAt: string | null
  }
  milestones: { id: string; title: string; description: string | null; status: string; dueDate: string | null; completedAt: string | null }[]
  documents: { id: string; fileName: string; size: number; uploadedBy: string; createdAt: string | null; downloadPath: string }[]
  deliverables: {
    id: string; title: string; description: string | null; type: string; version: number; isFinal: boolean; status: string
    deliveredAt: string | null; reviewedAt: string | null; revisionNote: string | null; downloadPath: string | null; externalUrl: string | null
  }[]
  quotations: { id: string; number: string; title: string; total: number; currency: string; status: string; validUntil: string | null }[]
  activity: { id: string; summary: string; by: string; createdAt: string | null }[]
}
interface Message { id: string; from: string; senderName: string; body: string; createdAt: string | null }

const STEPS = ['requested', 'reviewing', 'quotation', 'approved', 'in_progress', 'client_review', 'completed'] as const
const STEP_LABELS: Record<string, string> = {
  requested: 'Requested', reviewing: 'Reviewing', quotation: 'Quotation', approved: 'Approved',
  in_progress: 'In Progress', client_review: 'Client Review', completed: 'Completed',
}

function Stepper({ status }: { status: string }) {
  // "Revision" is work in progress again; it sits at the In Progress step.
  const current = STEPS.indexOf((status === 'revision' ? 'in_progress' : status) as (typeof STEPS)[number])
  return (
    <ol className="flex flex-wrap gap-x-2 gap-y-3">
      {STEPS.map((step, i) => {
        const done = current > i || status === 'completed'
        const active = current === i && status !== 'completed'
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className="inline-flex size-6 items-center justify-center rounded-full text-[11px] font-bold"
              style={done ? { background: BRAND.blue, color: '#FFFFFF' } : active ? { background: BRAND.orange, color: '#FFFFFF' } : { background: BRAND.tint, color: BRAND.gray }}
            >
              {done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className="text-[12px] font-medium" style={{ color: done || active ? BRAND.ink : BRAND.gray }}>
              {step === 'in_progress' && status === 'revision' ? 'Revision' : STEP_LABELS[step]}
            </span>
            {i < STEPS.length - 1 ? <span className="hidden h-px w-5 sm:block" style={{ background: BRAND.grayLine }} /> : null}
          </li>
        )
      })}
    </ol>
  )
}

export default function PortalProjectPage() {
  const { id } = useParams<{ id: string }>()
  const { portalFetch, portalDownload } = usePortalFetch()
  const { data, loading, error, reload } = usePortalData<Detail>(id ? `/projects/${id}` : null)
  const messages = usePortalData<{ messages: Message[] }>(id ? `/projects/${id}/messages` : null)
  const [busy, setBusy] = React.useState('')
  const [actionError, setActionError] = React.useState('')
  const [draft, setDraft] = React.useState('')
  const [revisionFor, setRevisionFor] = React.useState<string | null>(null)
  const [revisionNote, setRevisionNote] = React.useState('')
  const fileInput = React.useRef<HTMLInputElement>(null)

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key)
    setActionError('')
    try {
      await action()
      reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy('')
    }
  }

  const sendMessage = (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft.trim()) return
    void run('message', async () => {
      await portalFetch(`/projects/${id}/messages`, { method: 'POST', body: JSON.stringify({ body: draft }) })
      setDraft('')
      messages.reload()
    })
  }

  const upload = (file: File | undefined) => {
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    void run('upload', async () => {
      await portalFetch(`/projects/${id}/documents`, { method: 'POST', body: form })
      if (fileInput.current) fileInput.current.value = ''
    })
  }

  if (loading) return <LoadingRows rows={4} />
  if (error) {
    return (
      <>
        <Link href="/portal/projects" className="mb-4 inline-flex items-center gap-1 text-[13px] font-medium" style={{ color: BRAND.blue }}><ChevronLeft className="size-4" /> All projects</Link>
        <ErrorBanner message={error} onRetry={reload} />
      </>
    )
  }
  if (!data) return null
  const { project } = data
  const closed = project.status === 'completed' || project.status === 'cancelled'
  const canWithdraw = ['requested', 'reviewing', 'quotation'].includes(project.status)

  return (
    <>
      <Link href="/portal/projects" className="mb-4 inline-flex items-center gap-1 text-[13px] font-medium" style={{ color: BRAND.blue }}><ChevronLeft className="size-4" /> All projects</Link>
      <PortalPageHero eyebrow={`${project.serviceName} · ${project.reference}`} title={project.title} />

      {actionError ? <div className="mb-4"><ErrorBanner message={actionError} /></div> : null}

      <div className="space-y-6">
        <SectionCard
          title="Status"
          description={project.pendingAction ?? project.stageLabel}
          action={<StatusPill status={project.status} label={project.statusLabel} />}
        >
          {project.status === 'cancelled' ? (
            <p className="text-[13px]" style={{ color: BRAND.gray }}>This request was withdrawn.</p>
          ) : (
            <>
              <Stepper status={project.status} />
              <div className="mt-5 flex items-center gap-3">
                <ProgressBar value={project.progress} />
                <span className="w-10 text-right text-[12px] font-semibold" style={{ color: BRAND.blue }}>{project.progress}%</span>
              </div>
            </>
          )}
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[12px]" style={{ color: BRAND.gray }}>
            <span>Requested {fmtDay(project.createdAt)}</span>
            {project.targetDate ? <span>Target delivery {fmtDay(project.targetDate)}</span> : null}
            {project.completedAt ? <span>Completed {fmtDay(project.completedAt)}</span> : null}
          </div>
          {canWithdraw ? (
            <Button variant="outline" size="sm" className="mt-4" disabled={busy === 'withdraw'}
              onClick={() => { if (window.confirm('Withdraw this request?')) void run('withdraw', () => portalFetch(`/projects/${id}/withdraw`, { method: 'POST', body: '{}' })) }}>
              Withdraw request
            </Button>
          ) : null}
        </SectionCard>

        {data.quotations.some((q) => q.status === 'sent') ? (
          <SectionCard title="Quotation awaiting your response">
            {data.quotations.filter((q) => q.status === 'sent').map((q) => (
              <div key={q.id} className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[14px] font-semibold" style={{ color: BRAND.ink }}>{q.title}</p>
                  <p className="text-[12px]" style={{ color: BRAND.gray }}>{q.number} · {fmtMoney(q.total, q.currency)}{q.validUntil ? ` · valid until ${fmtDay(q.validUntil)}` : ''}</p>
                </div>
                <Button asChild style={{ background: BRAND.orange, color: '#FFFFFF' }}><Link href="/portal/billing">Review quotation</Link></Button>
              </div>
            ))}
          </SectionCard>
        ) : null}

        {data.deliverables.length > 0 ? (
          <SectionCard title="Deliverables" description="Review delivered work, then approve it or ask for changes.">
            <div className="space-y-3">
              {data.deliverables.map((d) => (
                <div key={d.id} className="rounded-md border p-4" style={{ borderColor: BRAND.grayLine }}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[14px] font-semibold" style={{ color: BRAND.ink }}>
                        {d.title} <span className="font-normal" style={{ color: BRAND.gray }}>· version {d.version}{d.isFinal ? ' · final' : ''}</span>
                      </p>
                      {d.description ? <p className="mt-1 text-[13px]" style={{ color: BRAND.gray }}>{d.description}</p> : null}
                      <p className="mt-1 text-[11px]" style={{ color: BRAND.gray }}>
                        Delivered {fmtDate(d.deliveredAt)}{d.reviewedAt ? ` · reviewed ${fmtDate(d.reviewedAt)}` : ''}
                      </p>
                      {d.revisionNote ? <p className="mt-2 text-[12px]" style={{ color: BRAND.ink }}><strong>Your revision request:</strong> {d.revisionNote}</p> : null}
                    </div>
                    <StatusPill status={d.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {d.downloadPath ? (
                      <Button variant="outline" size="sm" className="gap-2" disabled={busy === `dl-${d.id}`}
                        onClick={() => void run(`dl-${d.id}`, () => portalDownload(d.downloadPath as string, d.title))}>
                        <Download className="size-3.5" /> Download
                      </Button>
                    ) : null}
                    {d.externalUrl ? (
                      <Button asChild variant="outline" size="sm" className="gap-2">
                        <a href={d.externalUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-3.5" /> Open</a>
                      </Button>
                    ) : null}
                    {d.status === 'delivered' ? (
                      <>
                        <Button size="sm" disabled={busy === `ap-${d.id}`} style={{ background: BRAND.blue, color: '#FFFFFF' }}
                          onClick={() => void run(`ap-${d.id}`, () => portalFetch(`/deliverables/${d.id}/approve`, { method: 'POST', body: '{}' }))}>
                          Approve
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setRevisionFor(d.id); setRevisionNote('') }}>Request revision</Button>
                      </>
                    ) : null}
                  </div>
                  {revisionFor === d.id ? (
                    <div className="mt-3 space-y-2">
                      <Textarea rows={3} value={revisionNote} onChange={(e) => setRevisionNote(e.target.value)} placeholder="What would you like changed?" maxLength={5000} />
                      <div className="flex gap-2">
                        <Button size="sm" disabled={revisionNote.trim().length < 5 || busy === `rv-${d.id}`} style={{ background: BRAND.orange, color: '#FFFFFF' }}
                          onClick={() => void run(`rv-${d.id}`, async () => {
                            await portalFetch(`/deliverables/${d.id}/revision`, { method: 'POST', body: JSON.stringify({ note: revisionNote }) })
                            setRevisionFor(null)
                          })}>
                          Send revision request
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setRevisionFor(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </SectionCard>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title="Milestones" description="The agreed plan for this project.">
            {data.milestones.length === 0 ? (
              <p className="text-[13px]" style={{ color: BRAND.gray }}>Milestones appear here once your project plan is approved.</p>
            ) : (
              <ul className="space-y-3">
                {data.milestones.map((m) => (
                  <li key={m.id} className="flex gap-3">
                    {m.status === 'completed'
                      ? <Check className="mt-0.5 size-4 shrink-0" style={{ color: '#047857' }} />
                      : <Circle className="mt-0.5 size-4 shrink-0" style={{ color: m.status === 'in_progress' ? BRAND.orange : BRAND.graySoft }} />}
                    <div>
                      <p className="text-[13px] font-semibold" style={{ color: BRAND.ink }}>{m.title}</p>
                      {m.description ? <p className="text-[12px]" style={{ color: BRAND.gray }}>{m.description}</p> : null}
                      <p className="text-[11px]" style={{ color: BRAND.gray }}>
                        {m.status === 'completed' ? `Completed ${fmtDay(m.completedAt)}` : m.dueDate ? `Due ${fmtDay(m.dueDate)}` : m.status === 'in_progress' ? 'In progress' : 'Planned'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title="Documents"
            description="Files shared on this project."
            action={!closed ? (
              <>
                <input ref={fileInput} type="file" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
                <Button variant="outline" size="sm" className="gap-2" disabled={busy === 'upload'} onClick={() => fileInput.current?.click()}>
                  {busy === 'upload' ? <Spinner /> : <Paperclip className="size-3.5" />} Upload
                </Button>
              </>
            ) : undefined}
          >
            {data.documents.length === 0 ? (
              <p className="text-[13px]" style={{ color: BRAND.gray }}>No documents yet. Upload briefs, examples or source files to support your requirements.</p>
            ) : (
              <ul className="space-y-2">
                {data.documents.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2" style={{ borderColor: BRAND.grayLine }}>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium" style={{ color: BRAND.ink }}>{doc.fileName}</span>
                      <span className="block text-[11px]" style={{ color: BRAND.gray }}>
                        {fmtSize(doc.size)} · {doc.uploadedBy === 'you' ? 'Uploaded by you' : 'From ALO Labs'} · {fmtDay(doc.createdAt)}
                      </span>
                    </span>
                    <Button variant="ghost" size="sm" aria-label={`Download ${doc.fileName}`} disabled={busy === `doc-${doc.id}`}
                      onClick={() => void run(`doc-${doc.id}`, () => portalDownload(doc.downloadPath, doc.fileName))}>
                      <Download className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Messages" description="Talk to the team delivering your project.">
          <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
            {messages.loading ? <LoadingRows rows={2} cols={2} /> : (messages.data?.messages ?? []).length === 0 ? (
              <p className="text-[13px]" style={{ color: BRAND.gray }}>No messages yet. Ask a question or share an update below.</p>
            ) : (
              (messages.data?.messages ?? []).map((m) => (
                <div key={m.id} className={`flex ${m.from === 'you' ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[80%] rounded-lg px-4 py-2.5" style={m.from === 'you' ? { background: BRAND.blue, color: '#FFFFFF' } : { background: BRAND.tintSoft, color: BRAND.ink }}>
                    <p className="text-[11px] font-semibold opacity-80">{m.from === 'you' ? 'You' : m.senderName} · {fmtDate(m.createdAt)}</p>
                    <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed">{m.body}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <form onSubmit={sendMessage} className="mt-4 flex gap-2">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={5000} placeholder="Write a message…" aria-label="Message" />
            <Button type="submit" disabled={!draft.trim() || busy === 'message'} className="gap-2 self-end" style={{ background: BRAND.blue, color: '#FFFFFF' }}>
              <Send className="size-4" /> Send
            </Button>
          </form>
        </SectionCard>

        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title="Your requirements">
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed" style={{ color: BRAND.ink }}>{project.requirements}</p>
          </SectionCard>
          <SectionCard title="History">
            {data.activity.length === 0 ? (
              <p className="text-[13px]" style={{ color: BRAND.gray }}>No activity yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.activity.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3 text-[13px]">
                    <span style={{ color: BRAND.ink }}>{a.summary}</span>
                    <span className="shrink-0 text-[11px]" style={{ color: BRAND.gray }}>{fmtDate(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </>
  )
}
