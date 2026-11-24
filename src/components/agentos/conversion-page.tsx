'use client'

/**
 * The three conversion pages — Start a Project, Request an AI Solution, Book a
 * Consultation — share one component and differ only by copy and by which
 * fields the form asks for.
 *
 * Why one component rather than three near-identical files: three copies of a
 * form is three places for validation, consent wording and error handling to
 * drift apart. The differences are real but small, so they are data (see
 * CONVERSION_PATHS) and the behaviour is shared.
 *
 * Every variant posts to the same real endpoint, `/api/public/contact`, which
 * validates, honeypots, rate-limits and persists a CRM lead before returning
 * success. There is no optimistic “sent” state anywhere in this file: the
 * success message appears only after the server has acknowledged the write.
 */

import Link from 'next/link'
import { ArrowRight, Check, Clock, Loader2, Mail, ShieldCheck } from 'lucide-react'
import { useRef, useState } from 'react'

import { PUBLIC_COMPANY, agentosStyle } from '@/lib/brand/agentos-3d'
import { BUSINESS_SOLUTIONS } from '@/lib/brand/solutions'
import { apiFetch } from '@/lib/api-client'
import { Breadcrumbs, DarkFooter, DarkPageShell } from '@/components/agentos/dark-chrome'

export type ConversionKind = 'project' | 'solution' | 'consultation'

interface PathConfig {
  kind: ConversionKind
  eyebrow: string
  /** h1 split into a plain lead-in and a warm-coloured tail. */
  titleLead: string
  titleWarm: string
  lead: string
  /** Subject line stored on the CRM note; makes the source obvious in the CRM. */
  subject: string
  formTitle: string
  formNote: string
  messageLabel: string
  messagePlaceholder: string
  /** Whether to ask for budget and timeline (project-style questions). */
  askCommercials: boolean
  timingLabel: string
  timingOptions: string[]
  assurances: { icon: typeof Clock; label: string }[]
  /** The alternate routes shown under the form. */
  alternates: { href: string; label: string; body: string }[]
}

const TIMELINES = ['Not decided yet', 'As soon as possible', 'Within 1–3 months', 'This quarter', 'Next quarter', 'Just exploring']
const CONSULT_LENGTHS = ['30 minutes', '60 minutes', '90 minutes', 'Not sure yet']

const CONFIG: Record<ConversionKind, PathConfig> = {
  project: {
    kind: 'project',
    eyebrow: 'Start a project',
    titleLead: 'Tell us what you are',
    titleWarm: 'trying to build.',
    lead:
      'A short description of the problem is enough to begin. We reply within one business day with a technical response — a scope direction, a question, or an honest “this is not what we do”.',
    subject: 'Website enquiry — New project',
    formTitle: 'Project enquiry',
    formNote: 'The more concrete you are about the problem, the more useful our first reply will be.',
    messageLabel: 'Project description',
    messagePlaceholder:
      'What are you trying to build, what is getting in the way today, and what would a good outcome look like? A few sentences is plenty.',
    askCommercials: true,
    timingLabel: 'Timeline',
    timingOptions: TIMELINES,
    assurances: [
      { icon: Clock, label: 'Reply within one business day' },
      { icon: Mail, label: PUBLIC_COMPANY.email },
      { icon: ShieldCheck, label: 'Details used only to answer this enquiry' },
    ],
    alternates: [
      { href: '/site/request-a-solution', label: 'Request an AI solution', body: 'You have a problem and suspect AI is part of the answer.' },
      { href: '/site/book-a-consultation', label: 'Book a consultation', body: 'You want an engineering opinion before committing to a build.' },
      { href: '/site/services', label: 'Browse services', body: 'See how each line is delivered and what state it is in.' },
    ],
  },
  solution: {
    kind: 'solution',
    eyebrow: 'Request an AI solution',
    titleLead: 'Describe the outcome, not the',
    titleWarm: 'technology.',
    lead:
      'Tell us what should be faster, cheaper, more accurate or less manual. If AI is the right tool we will scope it; if a simpler fix does the job, we will say that instead.',
    subject: 'Website enquiry — AI solution request',
    formTitle: 'Solution request',
    formNote: 'Pick the closest solution below. If none fits, choose “General enquiry” and describe the problem.',
    messageLabel: 'The business problem',
    messagePlaceholder:
      'What happens today, how often, and what does it cost you? For example: “three people re-key supplier invoices into our ERP, about 600 a month, and about one in twenty is wrong.”',
    askCommercials: true,
    timingLabel: 'How soon does this matter?',
    timingOptions: TIMELINES,
    assurances: [
      { icon: Clock, label: 'Reply within one business day' },
      { icon: ShieldCheck, label: 'We will tell you if AI is the wrong answer' },
      { icon: Mail, label: PUBLIC_COMPANY.email },
    ],
    alternates: [
      { href: '/site/solutions', label: 'All twelve solutions', body: 'Each with the problem it solves and what is real today.' },
      { href: '/site/start-a-project', label: 'Start a project', body: 'You already know what needs building.' },
      { href: '/site/platform-overview', label: 'The platform', body: 'What AgentOS gives an AI solution underneath.' },
    ],
  },
  consultation: {
    kind: 'consultation',
    eyebrow: 'Book a consultation',
    titleLead: 'A working session with an',
    titleWarm: 'engineer.',
    lead:
      'Not a discovery call with a salesperson. Bring the process, the constraints and the mess; leave with an architecture opinion, a risk list and an honest view of whether the work is worth doing.',
    subject: 'Website enquiry — Consultation request',
    formTitle: 'Consultation request',
    formNote: 'Tell us what you want to get out of the session, and who should be in the room.',
    messageLabel: 'What should we cover?',
    messagePlaceholder:
      'What decision are you trying to make? For example: “we have two vendor proposals for an AI support agent and cannot tell which is credible.”',
    askCommercials: false,
    timingLabel: 'Preferred session length',
    timingOptions: CONSULT_LENGTHS,
    assurances: [
      { icon: Clock, label: 'Scheduled within two business days' },
      { icon: ShieldCheck, label: 'We will say if you do not need us' },
      { icon: Mail, label: PUBLIC_COMPANY.email },
    ],
    alternates: [
      { href: '/site/start-a-project', label: 'Start a project', body: 'You already know what you want built.' },
      { href: '/site/how-we-work', label: 'How we work', body: 'The delivery process the session will reference.' },
      { href: '/site/projects', label: 'See the work', body: 'Three builds with their architecture and limits.' },
    ],
  },
}

type FormState = 'idle' | 'sending' | 'sent' | 'error'

export function ConversionPage({ kind }: { kind: ConversionKind }) {
  const config = CONFIG[kind]
  const [state, setState] = useState<FormState>('idle')
  const [detail, setDetail] = useState('')
  const [delivered, setDelivered] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  // One stable id prefix per page, so label/input pairing cannot collide even if
  // two of these forms ever render on one page.
  const id = (n: string) => `${kind}-${n}`

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>
    setState('sending')
    setDetail('')
    try {
      const res = await apiFetch('/api/public/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, subject: config.subject }),
      })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; delivered?: boolean; message?: string }
      if (res.ok && body.ok) {
        setState('sent')
        setDelivered(Boolean(body.delivered))
        setDetail(
          body.delivered
            ? 'Your request has reached us. We reply to project enquiries within one business day.'
            : `Your request has been recorded. The notification email could not be sent, so for anything urgent please write to ${PUBLIC_COMPANY.email}.`,
        )
        form.reset()
      } else {
        setState('error')
        setDetail(body.message || `The message could not be sent. Please email ${PUBLIC_COMPANY.email}.`)
      }
    } catch {
      setState('error')
      setDetail(`The message could not be sent — check your connection, or email ${PUBLIC_COMPANY.email}.`)
    }
  }

  return (
    <DarkPageShell>
      <main id="main">
        <section className="ag-page-hero">
          <div className="ag-shell">
            <Breadcrumbs
              crumbs={[
                {
                  href: kind === 'project' ? '/site/start-a-project' : kind === 'solution' ? '/site/request-a-solution' : '/site/book-a-consultation',
                  label: config.eyebrow,
                },
              ]}
            />

            <div className="ag-split">
              <div>
                <p className="ag-eyebrow">{config.eyebrow}</p>
                <h1 className="ag-h1" style={{ fontSize: 'clamp(2.1rem, 4.4vw, 3.3rem)', maxWidth: '19ch' }}>
                  {config.titleLead} <span className="ag-h1-warm">{config.titleWarm}</span>
                </h1>
                <p className="ag-lead">{config.lead}</p>

                <div style={{ display: 'grid', gap: 12, marginTop: 30 }}>
                  {config.assurances.map(({ icon: Icon, label }) => (
                    <span
                      key={label}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: '0.9rem', color: '#B7C5E0' }}
                    >
                      <Icon size={16} aria-hidden="true" style={{ color: '#9DBBFF', flexShrink: 0 }} />
                      {label}
                    </span>
                  ))}
                </div>

                <div className="ag-note" style={{ marginTop: 28 }}>
                  <ShieldCheck size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: '0.84rem' }}>
                    Please do not send passwords, API keys or client data in this form — it is not an encrypted
                    channel. We arrange a secure handover after the first conversation.
                  </span>
                </div>
              </div>

              {/* ── The form ─────────────────────────────────────────────── */}
              <div className="ag-glass" style={{ padding: '26px 24px' }}>
                <h2 style={{ margin: '0 0 6px', fontSize: '1.1rem', fontWeight: 720, color: '#fff' }}>
                  {config.formTitle}
                </h2>
                <p style={{ margin: '0 0 20px', fontSize: '0.82rem', color: '#8194B8' }}>{config.formNote}</p>

                {state === 'sent' ? (
                  <div role="status" aria-live="polite" style={{ display: 'grid', gap: 16 }}>
                    <div className="ag-form-ok" style={{ alignItems: 'flex-start' }}>
                      <Check size={17} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
                      <span>{detail}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="ag-btn ag-btn-ghost"
                        onClick={() => {
                          setState('idle')
                          setDetail('')
                        }}
                      >
                        Send another request
                      </button>
                      <Link href="/site/projects" className="ag-btn ag-btn-ghost">
                        See the work <ArrowRight size={15} aria-hidden="true" />
                      </Link>
                    </div>
                    {!delivered ? (
                      <p style={{ margin: 0, fontSize: '0.78rem', lineHeight: 1.6, color: '#8194B8' }}>
                        The lead is stored in our CRM either way — the notification email is a convenience, not
                        the record of truth.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <form ref={formRef} onSubmit={onSubmit} style={{ display: 'grid', gap: 16 }}>
                    <div className="ag-form-row">
                      <div>
                        <label className="ag-field-label" htmlFor={id('name')}>
                          Name <span aria-hidden="true">*</span>
                        </label>
                        <input id={id('name')} name="name" required autoComplete="name" className="ag-input" placeholder="Your name" />
                      </div>
                      <div>
                        <label className="ag-field-label" htmlFor={id('email')}>
                          Business email <span aria-hidden="true">*</span>
                        </label>
                        <input
                          id={id('email')}
                          name="email"
                          type="email"
                          required
                          autoComplete="email"
                          className="ag-input"
                          placeholder="you@company.com"
                        />
                      </div>
                    </div>

                    <div className="ag-form-row">
                      <div>
                        <label className="ag-field-label" htmlFor={id('company')}>
                          Company
                        </label>
                        <input id={id('company')} name="company" autoComplete="organization" className="ag-input" placeholder="Optional" />
                      </div>
                      <div>
                        <label className="ag-field-label" htmlFor={id('phone')}>
                          Phone
                        </label>
                        <input id={id('phone')} name="phone" type="tel" autoComplete="tel" className="ag-input" placeholder="Optional" />
                      </div>
                    </div>

                    <div className="ag-form-row">
                      <div>
                        <label className="ag-field-label" htmlFor={id('topic')}>
                          Required service
                        </label>
                        <select id={id('topic')} name="topic" className="ag-select" defaultValue="General enquiry">
                          <option value="General enquiry">General enquiry — not sure yet</option>
                          {BUSINESS_SOLUTIONS.map((s) => (
                            <option key={s.slug} value={s.name}>
                              {s.name}
                            </option>
                          ))}
                          <option value="Partnership">Partnership</option>
                          <option value="Careers">Careers</option>
                        </select>
                      </div>
                      <div>
                        <label className="ag-field-label" htmlFor={id('timing')}>
                          {config.timingLabel}
                        </label>
                        <select id={id('timing')} name="timeline" className="ag-select" defaultValue={config.timingOptions[0]}>
                          {config.timingOptions.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {config.askCommercials ? (
                      <div>
                        <label className="ag-field-label" htmlFor={id('budget')}>
                          Budget range
                        </label>
                        <select id={id('budget')} name="budget" className="ag-select" defaultValue="Not decided yet">
                          {['Not decided yet', 'Under $5,000', '$5,000 – $25,000', '$25,000 – $100,000', '$100,000+'].map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    <div>
                      <label className="ag-field-label" htmlFor={id('message')}>
                        {config.messageLabel} <span aria-hidden="true">*</span>
                      </label>
                      <textarea
                        id={id('message')}
                        name="message"
                        required
                        rows={6}
                        className="ag-textarea"
                        placeholder={config.messagePlaceholder}
                        aria-describedby={id('msg-help')}
                      />
                      <p id={id('msg-help')} style={{ margin: '7px 0 0', fontSize: '0.76rem', color: '#6E80A4' }}>
                        At least 10 characters. Please do not include passwords or confidential credentials.
                      </p>
                    </div>

                    <input type="hidden" name="subject" value={config.subject} />

                    {/* Honeypot: hidden from people, irresistible to bots. */}
                    <div aria-hidden="true" className="ag-sr">
                      <label htmlFor={id('hp')}>Website</label>
                      <input
                        id={id('hp')}
                        type="text"
                        name="company_website"
                        tabIndex={-1}
                        autoComplete="off"
                        aria-label="Leave this field empty"
                      />
                    </div>

                    <label
                      style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.8rem', lineHeight: 1.55, color: '#93A2C2' }}
                    >
                      <input
                        type="checkbox"
                        name="consent"
                        value="yes"
                        required
                        style={{ marginTop: 3, accentColor: '#FC5400', width: 15, height: 15, flexShrink: 0 }}
                      />
                      <span>
                        I agree that ALO Labs may use these details to respond to this enquiry, in line with the{' '}
                        <Link href="/site/privacy" style={{ color: '#9DBBFF', textDecoration: 'underline' }}>
                          privacy policy
                        </Link>
                        .
                      </span>
                    </label>

                    {state === 'error' ? (
                      <p role="alert" className="ag-form-error">
                        {detail}
                      </p>
                    ) : null}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                      <button
                        type="submit"
                        className="ag-btn ag-btn-primary"
                        disabled={state === 'sending'}
                        style={{ opacity: state === 'sending' ? 0.7 : 1, cursor: state === 'sending' ? 'progress' : 'pointer' }}
                      >
                        {state === 'sending' ? (
                          <>
                            <Loader2 size={16} className="ag-spin" aria-hidden="true" /> Sending…
                          </>
                        ) : (
                          <>
                            Send request <ArrowRight size={16} aria-hidden="true" />
                          </>
                        )}
                      </button>
                      <span style={{ fontSize: '0.78rem', color: '#6E80A4' }}>We reply within one business day.</span>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── Alternate routes ──────────────────────────────────────────── */}
        <section className="ag-section" aria-labelledby={`${kind}-alts`}>
          <div className="ag-shell">
            <p className="ag-eyebrow">Other ways in</p>
            <h2 id={`${kind}-alts`} className="ag-h2" style={{ fontSize: 'clamp(1.3rem, 2.4vw, 1.8rem)', marginBottom: 22 }}>
              Not quite the right door?
            </h2>
            <div className="ag-paths">
              {config.alternates.map((a) => (
                <Link key={a.href} href={a.href} className="ag-path">
                  <h3 className="ag-path-title">{a.label}</h3>
                  <p className="ag-path-body">{a.body}</p>
                  <span className="ag-path-meta">
                    Go <ArrowRight size={12} aria-hidden="true" style={{ verticalAlign: '-1px' }} />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>

      <DarkFooter />
      <style>{`
        .ag-form-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
        @media (max-width: 620px) { .ag-form-row { grid-template-columns: 1fr; } }
        .ag-spin { animation: ag-spin-icon 1s linear infinite; }
        @keyframes ag-spin-icon { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .ag-spin { animation: none; } }
      `}</style>
      <span className="ag-sr" style={agentosStyle}>
        {config.eyebrow}
      </span>
    </DarkPageShell>
  )
}

export default ConversionPage
