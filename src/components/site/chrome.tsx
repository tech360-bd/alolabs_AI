'use client'

/**
 * Site chrome — the shared furniture of the public alolabs.net website.
 *
 * One header, one footer, one CTA band, one page-hero/section vocabulary, one
 * FAQ accordion and one contact form, composed by every page under /site so the
 * site reads as a single publication. All colour, type and copy constants come
 * from the brand tokens; nothing here re-types a hex value.
 */

import * as React from 'react'
import Link from 'next/link'
import { AloLabsLogo, Mark, BrandRule } from '@/components/brand/alo-logo'
import { Button } from '@/components/ui/button'
import { BRAND, BRAND_FONTS, COMPANY, GRADIENTS, HEADLINE_STATS } from '@/lib/brand/tokens'
import {
  ArrowRight,
  Check,
  ChevronDown,
  Mail,
  MapPin,
  Menu,
  MessageSquare,
  Phone,
  X,
} from 'lucide-react'

// ─── Navigation ──────────────────────────────────────────────────────────────

export interface NavItem {
  href: string
  label: string
  hint?: string
}

export const SITE_NAV: NavItem[] = [
  { href: '/site/platform', label: 'Platform', hint: 'The AgentOS stack' },
  { href: '/site/solutions', label: 'Solutions', hint: 'Services & automation' },
  { href: '/site/work', label: 'Work', hint: 'Case studies' },
  { href: '/site/pricing', label: 'Pricing', hint: 'Plans & deployment' },
  { href: '/site/insights', label: 'Insights', hint: 'Notes & guides' },
  { href: '/site/about', label: 'About', hint: 'The company' },
]

export const SITE_RESOURCE_NAV: NavItem[] = [
  { href: '/site/diagrams', label: 'Diagram gallery', hint: '45 editorial visual types' },
  { href: '/site/press', label: 'Marketing kit', hint: 'Logos, colours, boilerplate' },
  { href: '/design', label: 'Design system', hint: 'Buttons, cards, tokens' },
  { href: '/brand', label: 'Brand book', hint: 'The guideline sheet' },
  { href: '/site/careers', label: 'Careers', hint: 'Join the team' },
  { href: '/site/contact', label: 'Contact', hint: 'Talk to us' },
]

// ─── Header ──────────────────────────────────────────────────────────────────

export function SiteHeader({ active }: { active?: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-6 px-6 py-3.5">
        <Link href="/site" className="flex items-center gap-3" onClick={() => setOpen(false)}>
          <AloLabsLogo size={34} tagline={false} title="ALO Labs AgentOS" />
        </Link>
        <nav className="hidden items-center gap-1 lg:flex">
          {SITE_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
                active === item.href
                  ? 'text-slate-900'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {item.label}
            </Link>
          ))}
          <div className="group relative">
            <button className="flex items-center gap-1 rounded-md px-3 py-2 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900">
              Resources <ChevronDown className="size-3.5" />
            </button>
            <div className="invisible absolute right-0 top-full z-50 w-[280px] translate-y-1 rounded-xl border border-slate-200 bg-white p-2 opacity-0 shadow-xl transition-all group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
              {SITE_RESOURCE_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-slate-50"
                >
                  <span className="block text-[13px] font-semibold" style={{ color: BRAND.ink }}>
                    {item.label}
                  </span>
                  {item.hint ? (
                    <span className="mt-0.5 block text-[11px]" style={{ color: BRAND.graySoft }}>
                      {item.hint}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          </div>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="hidden gap-1.5 sm:flex" asChild>
            <Link href="/site/contact">
              <MessageSquare className="size-3.5" /> Talk to us
            </Link>
          </Button>
          <Button size="sm" className="gap-1.5" style={{ background: BRAND.orange }} asChild>
            <Link href="/">
              Open AgentOS <ArrowRight className="size-3.5" />
            </Link>
          </Button>
          <button
            className="rounded-md border border-slate-200 p-2 lg:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>
      {open ? (
        <nav className="border-t border-slate-200 bg-white px-6 py-4 lg:hidden">
          <div className="grid gap-1">
            {[...SITE_NAV, ...SITE_RESOURCE_NAV].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5 text-[14px] font-medium text-slate-700 hover:bg-slate-100"
              >
                {item.label}
                {item.hint ? (
                  <span className="ml-2 text-[11px] font-normal text-slate-400">{item.hint}</span>
                ) : null}
              </Link>
            ))}
          </div>
        </nav>
      ) : null}
    </header>
  )
}

// ─── Section vocabulary ──────────────────────────────────────────────────────

export function Section({
  id,
  eyebrow,
  title,
  lead,
  children,
  ground = 'white',
  narrow,
}: {
  id?: string
  eyebrow: string
  title: string
  lead?: string
  children: React.ReactNode
  ground?: 'white' | 'canvas' | 'navy'
  narrow?: boolean
}) {
  const bg = ground === 'navy' ? BRAND.navy : ground === 'canvas' ? BRAND.canvas : '#FFFFFF'
  const titleColor = ground === 'navy' ? '#FFFFFF' : BRAND.blue
  const leadColor = ground === 'navy' ? 'rgba(255,255,255,0.72)' : BRAND.gray
  return (
    <section id={id} className="scroll-mt-20 border-b border-slate-200" style={{ background: bg }}>
      <div className={`mx-auto px-6 py-16 lg:py-20 ${narrow ? 'max-w-[880px]' : 'max-w-[1200px]'}`}>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: BRAND.orange }}>
          {eyebrow}
        </p>
        <h2
          className="mt-3 max-w-[46ch] text-3xl font-bold tracking-tight sm:text-[34px]"
          style={{ color: titleColor, fontFamily: BRAND_FONTS.secondary.stack }}
        >
          {title}
        </h2>
        {lead ? (
          <p className="mt-4 max-w-[70ch] text-[14px] leading-relaxed" style={{ color: leadColor }}>
            {lead}
          </p>
        ) : null}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  )
}

export function PageHero({
  eyebrow,
  title,
  lead,
  children,
  crumbs,
}: {
  eyebrow: string
  title: React.ReactNode
  lead: string
  children?: React.ReactNode
  crumbs?: { href: string; label: string }[]
}) {
  return (
    <section className="relative overflow-hidden border-b border-slate-200" style={{ background: BRAND.canvas }}>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
        style={{ background: GRADIENTS.orange.css }}
        aria-hidden="true"
      />
      <div className="mx-auto max-w-[1200px] px-6 py-14 lg:py-18">
        {crumbs?.length ? (
          <nav className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: BRAND.graySoft }}>
            <Link href="/site" className="hover:text-slate-700">
              Home
            </Link>
            {crumbs.map((c) => (
              <React.Fragment key={c.href}>
                <span aria-hidden="true">/</span>
                <Link href={c.href} className="hover:text-slate-700">
                  {c.label}
                </Link>
              </React.Fragment>
            ))}
          </nav>
        ) : null}
        <p className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: BRAND.orange }}>
          {eyebrow}
        </p>
        <h1
          className="mt-3 max-w-[22ch] text-4xl font-bold leading-[1.08] tracking-tight sm:text-[44px]"
          style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}
        >
          {title}
        </h1>
        <p className="mt-5 max-w-[68ch] text-[15px] leading-relaxed" style={{ color: BRAND.gray }}>
          {lead}
        </p>
        {children ? <div className="mt-8">{children}</div> : null}
      </div>
    </section>
  )
}

export function StatCard({
  icon: Icon,
  value,
  label,
  note,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  value: string
  label: string
  note: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Icon className="size-4" style={{ color: BRAND.orange }} />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: BRAND.gray }}>
          {label}
        </span>
      </div>
      <p className="mt-2 text-3xl font-bold" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
        {value}
      </p>
      <p className="mt-1 text-[11px]" style={{ color: BRAND.graySoft }}>
        {note}
      </p>
    </div>
  )
}

export function Pill({ children, tone = 'blue' }: { children: React.ReactNode; tone?: 'blue' | 'orange' | 'plain' }) {
  const style =
    tone === 'orange'
      ? { background: 'rgba(255,106,0,0.10)', color: BRAND.orange }
      : tone === 'blue'
        ? { background: BRAND.tint, color: BRAND.blue }
        : { background: '#FFFFFF', color: BRAND.gray, border: `1px solid ${BRAND.grayLine}` }
  return (
    <span
      className="inline-flex items-center rounded-md px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]"
      style={style}
    >
      {children}
    </span>
  )
}

export function CheckList({ items, tone = 'orange' }: { items: string[]; tone?: 'orange' | 'blue' | 'white' }) {
  const check =
    tone === 'white' ? '#FFFFFF' : tone === 'blue' ? BRAND.blue : BRAND.orange
  const text = tone === 'white' ? 'rgba(255,255,255,0.82)' : BRAND.gray
  return (
    <ul className="space-y-2.5">
      {items.map((line) => (
        <li key={line} className="flex items-start gap-2.5 text-[13px] leading-relaxed" style={{ color: text }}>
          <Check className="mt-0.5 size-4 shrink-0" style={{ color: check }} />
          {line}
        </li>
      ))}
    </ul>
  )
}

/** Numbered editorial card — “01 / Title / body / bullets / CTA”, the reference pattern. */
export function NumberedCard({
  index,
  title,
  body,
  items,
  href,
  ctaLabel = 'Talk to us',
}: {
  index: string
  title: string
  body: string
  items?: string[]
  href?: string
  ctaLabel?: string
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-7">
      <span className="font-mono text-[11px] font-bold tracking-[0.2em]" style={{ color: BRAND.orange }}>
        {index}
      </span>
      <h3 className="mt-3 text-[19px] font-semibold" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
        {title}
      </h3>
      <p className="mt-2.5 text-[13px] leading-relaxed" style={{ color: BRAND.gray }}>
        {body}
      </p>
      {items?.length ? (
        <ul className="mt-4 space-y-1.5">
          {items.map((item) => (
            <li key={item} className="flex items-start gap-2 text-[12px]" style={{ color: BRAND.ink }}>
              <span className="mt-[7px] size-[5px] shrink-0 rounded-full" style={{ background: BRAND.orange }} />
              {item}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-5 flex-1" />
      {href ? (
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold"
          style={{ color: BRAND.orange }}
        >
          {ctaLabel} <ArrowRight className="size-3.5" />
        </Link>
      ) : null}
    </div>
  )
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────

export interface FaqItem {
  q: string
  a: string
}

export function FaqList({ items }: { items: FaqItem[] }) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <details key={item.q} className="group rounded-xl border border-slate-200 bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-[14px] font-semibold" style={{ color: BRAND.blue }}>
            {item.q}
            <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" style={{ color: BRAND.orange }} />
          </summary>
          <p className="px-6 pb-5 text-[13px] leading-relaxed" style={{ color: BRAND.gray }}>
            {item.a}
          </p>
        </details>
      ))}
    </div>
  )
}

// ─── CTA band ────────────────────────────────────────────────────────────────

export function CtaBand({
  title = 'Ready to put 1020 agents to work?',
  lead = 'See the command centre run a real command — or talk to the team about your departments, workflows and approval rules.',
}: {
  title?: string
  lead?: string
}) {
  return (
    <section className="border-b border-slate-200" style={{ background: BRAND.blue }}>
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-8 px-6 py-14">
        <div className="max-w-[560px]">
          <h2 className="text-3xl font-bold tracking-tight text-white" style={{ fontFamily: BRAND_FONTS.secondary.stack }}>
            {title}
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-white/75">{lead}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button size="lg" className="gap-2" style={{ background: BRAND.orange }} asChild>
              <Link href="/">
                Open the Command Center <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="gap-2 border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white" asChild>
              <Link href="/site/contact">Talk to the team</Link>
            </Button>
          </div>
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/5 p-6">
          <dl className="grid grid-cols-2 gap-x-10 gap-y-4">
            {HEADLINE_STATS.map((stat) => (
              <div key={stat.label}>
                <dt className="text-2xl font-bold text-white" style={{ fontFamily: BRAND_FONTS.secondary.stack }}>
                  {stat.value}
                </dt>
                <dd className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/60">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}

// ─── Footer ──────────────────────────────────────────────────────────────────

const FOOTER_COLUMNS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Platform',
    items: [
      { href: '/site/platform', label: 'AgentOS overview' },
      { href: '/site/platform#command', label: 'Command Center' },
      { href: '/site/platform#agents', label: 'AI agents & departments' },
      { href: '/site/platform#rag', label: 'Hybrid RAG engine' },
      { href: '/site/platform#approvals', label: 'Approval & audit' },
      { href: '/site/pricing', label: 'Pricing & deployment' },
    ],
  },
  {
    title: 'Solutions',
    items: [
      { href: '/site/solutions', label: 'All services' },
      { href: '/site/solutions#automation', label: 'AI automation' },
      { href: '/site/solutions#crm', label: 'CRM & marketing' },
      { href: '/site/solutions#education', label: 'Education operations' },
      { href: '/site/work', label: 'Case studies' },
      { href: '/site/careers', label: 'Careers' },
    ],
  },
  {
    title: 'Resources',
    items: [
      { href: '/site/insights', label: 'Insights & guides' },
      { href: '/site/diagrams', label: 'Diagram gallery' },
      { href: '/site/press', label: 'Marketing kit' },
      { href: '/design', label: 'Design system' },
      { href: '/brand', label: 'Brand book' },
      { href: '/invoice', label: 'Invoice & letterhead' },
    ],
  },
  {
    title: 'Company',
    items: [
      { href: '/site/about', label: 'About ALO Labs' },
      { href: '/site/about#values', label: 'How we work' },
      { href: '/site/contact', label: 'Contact' },
      { href: '/site/press', label: 'Press & media' },
      { href: '/site/contact#offices', label: 'Offices' },
      { href: '/', label: 'Open AgentOS' },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer style={{ background: BRAND.navy }}>
      <div className="mx-auto max-w-[1200px] px-6 py-12">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <AloLabsLogo size={40} tagline theme="dark" />
            <BrandRule width={150} className="mt-4 opacity-90" />
            <p className="mt-3 max-w-[380px] text-[12px] leading-relaxed text-white/70">{COMPANY.promise}</p>
            <div className="mt-5 space-y-1.5">
              <a href={COMPANY.phoneHref} className="flex items-center gap-2 text-[12px] text-white/80 hover:text-white">
                <Phone className="size-3.5" style={{ color: BRAND.orange }} /> {COMPANY.phone}
              </a>
              <a href={COMPANY.emailHref} className="flex items-center gap-2 text-[12px] text-white/80 hover:text-white">
                <Mail className="size-3.5" style={{ color: BRAND.orange }} /> {COMPANY.email}
              </a>
              <p className="flex items-start gap-2 text-[12px] text-white/80">
                <MapPin className="mt-0.5 size-3.5 shrink-0" style={{ color: BRAND.orange }} />
                <span>
                  {COMPANY.entity} · {COMPANY.address[0]}
                  <br />
                  {COMPANY.address[1]}
                </span>
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.title}>
                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-white/50">{col.title}</p>
                <ul className="mt-2.5 space-y-1.5">
                  {col.items.map((item) => (
                    <li key={item.href + item.label}>
                      <Link href={item.href} className="text-[12px] text-white/80 hover:text-white">
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-10 border-t border-white/10 pt-6">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/50">
            {COMPANY.domains.map((d) => d.value).join(' · ')}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/50">
              © {new Date().getFullYear()} {COMPANY.legalName} · {COMPANY.product} · {COMPANY.tagline}
            </p>
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/50">{COMPANY.promiseShort}</p>
          </div>
        </div>
      </div>
    </footer>
  )
}

// ─── Contact form ────────────────────────────────────────────────────────────

type FormState = 'idle' | 'sending' | 'sent' | 'error'

export function ContactForm({
  subject = 'Website enquiry',
  compact,
}: {
  subject?: string
  compact?: boolean
}) {
  const [state, setState] = React.useState<FormState>('idle')
  const [detail, setDetail] = React.useState<string>('')

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>
    setState('sending')
    try {
      const res = await fetch('/api/public/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, subject: data.subject || subject }),
      })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; delivered?: boolean; message?: string }
      if (res.ok && body.ok) {
        setState('sent')
        setDetail(
          body.delivered
            ? 'Your request has been sent; we will reply within one business day.'
            : 'Your request has been recorded. For anything urgent, email ' + COMPANY.email + '.',
        )
        form.reset()
      } else {
        setState('error')
        setDetail(body.message || `The message could not be sent. Please email ${COMPANY.email}.`)
      }
    } catch {
      setState('error')
      setDetail(`The message could not be sent. Please email ${COMPANY.email}.`)
    }
  }

  const field =
    'w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[13px] text-slate-900 outline-none transition-colors focus:border-slate-400 focus:shadow-[0_0_0_3px_rgba(255,106,0,0.18)]'
  const fieldShell = { ['--field-accent']: BRAND.orange } as React.CSSProperties

  return (
    <form onSubmit={onSubmit} className="space-y-4" style={fieldShell}>
      <div className={`grid gap-4 ${compact ? '' : 'sm:grid-cols-2'}`}>
        <label className="block">
          <span className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: BRAND.gray }}>
            Name
          </span>
          <input required name="name" autoComplete="name" className={field} placeholder="Your name" />
        </label>
        <label className="block">
          <span className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: BRAND.gray }}>
            Email
          </span>
          <input required type="email" name="email" autoComplete="email" className={field} placeholder="you@company.com" />
        </label>
      </div>
      <div className={`grid gap-4 ${compact ? '' : 'sm:grid-cols-2'}`}>
        <label className="block">
          <span className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: BRAND.gray }}>
            Company
          </span>
          <input name="company" autoComplete="organization" className={field} placeholder="Company name" />
        </label>
        <label className="block">
          <span className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: BRAND.gray }}>
            Phone
          </span>
          <input name="phone" autoComplete="tel" className={field} placeholder="Optional" />
        </label>
      </div>
      {!compact ? (
        <label className="block">
          <span className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: BRAND.gray }}>
            What can we help with?
          </span>
          <select name="topic" className={field} defaultValue="General enquiry">
            {[
              'General enquiry',
              'AgentOS platform demo',
              'AI automation project',
              'CRM & marketing',
              'Education operations',
              'Partnership',
              'Press & media',
              'Careers',
            ].map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="block">
        <span className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: BRAND.gray }}>
          Message
        </span>
        <textarea
          required
          name="message"
          rows={compact ? 4 : 6}
          className={field}
          placeholder="Tell us about your team, your departments and what you want to automate."
        />
      </label>
      <input type="hidden" name="subject" value={subject} />
      {/* Honeypot — humans never see or fill this field. */}
      <input
        type="text"
        name="company_website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" className="gap-2" style={{ background: BRAND.orange }} disabled={state === 'sending'}>
          {state === 'sending' ? 'Sending…' : 'Send message'} <ArrowRight className="size-4" />
        </Button>
        <p className="text-[11px]" style={{ color: BRAND.graySoft }}>
          We reply within one business day. No newsletter spam.
        </p>
      </div>
      {state === 'sent' ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12px] text-emerald-800">{detail}</p>
      ) : null}
      {state === 'error' ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-800">{detail}</p>
      ) : null}
    </form>
  )
}
