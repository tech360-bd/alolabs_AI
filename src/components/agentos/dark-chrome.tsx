'use client'

/**
 * Chrome for the dark public site.
 *
 * Deliberately separate from src/components/site/site-header.tsx, which serves
 * the light `/site` publication. Folding a dark variant into that header would
 * have meant two themes in one component and a risk of restyling pages that
 * already work; this is additive.
 */

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronRight,
  Facebook,
  Instagram,
  Link2,
  Loader2,
  Menu,
  Users2,
  X,
  Youtube,
} from 'lucide-react'

import { AGENTOS_LOGO, PUBLIC_COMPANY, agentosStyle } from '@/lib/brand/agentos-3d'
import { publishedSocialLinks, type SocialIconName } from '@/lib/brand/social'
import { apiFetch } from '@/lib/api-client'

/**
 * Icon per network. Lucide has no Pinterest glyph, so that one is drawn inline
 * rather than approximated with a lookalike from another brand.
 */
const SOCIAL_ICON: Record<
  SocialIconName,
  React.ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' | 'false' }>
> = {
  facebook: Facebook,
  facebookCommunity: Users2,
  // Distinct glyph: a share link is a distinct destination from the page, and
  // two identical "f" icons in a row read as a rendering bug.
  facebookShare: Link2,
  instagram: Instagram,
  youtube: Youtube,
  pinterest: function PinterestGlyph({ size = 16 }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
        <path d="M12 2C6.48 2 2 6.48 2 12c0 4.24 2.64 7.86 6.36 9.32-.09-.79-.17-2.01.03-2.87.19-.79 1.2-5.06 1.2-5.06s-.31-.61-.31-1.52c0-1.43.83-2.49 1.86-2.49.88 0 1.3.66 1.3 1.45 0 .88-.56 2.2-.85 3.42-.24 1.02.51 1.85 1.52 1.85 1.82 0 3.22-1.92 3.22-4.69 0-2.45-1.76-4.17-4.28-4.17-2.91 0-4.62 2.19-4.62 4.45 0 .88.34 1.83.76 2.34.08.1.09.19.07.29-.08.32-.25 1.02-.28 1.16-.05.19-.16.23-.36.14-1.34-.62-2.18-2.58-2.18-4.15 0-3.38 2.46-6.48 7.08-6.48 3.72 0 6.61 2.65 6.61 6.19 0 3.69-2.33 6.66-5.56 6.66-1.09 0-2.11-.57-2.46-1.24l-.67 2.55c-.24.93-.89 2.1-1.33 2.81.99.31 2.05.47 3.15.47 5.52 0 10-4.48 10-10S17.52 2 12 2z" />
      </svg>
    )
  },
}

/* ── Navigation ────────────────────────────────────────────────────────────── */

/**
 * Primary navigation.
 *
 * Solutions sits first because it is the buying view — a visitor arriving from
 * search wants to know what they can purchase before they care how it is
 * engineered. Services, Work and Process are the evidence that the claim is
 * real, so they follow directly behind it.
 */
const NAV = [
  { href: '/site/solutions', label: 'Solutions' },
  { href: '/site/services', label: 'Services' },
  { href: '/site/platform-overview', label: 'Platform' },
  { href: '/site/projects', label: 'Work' },
  { href: '/site/how-we-work', label: 'Process' },
  { href: '/site/about', label: 'About' },
] as const

/**
 * Wraps an interior page and binds the design tokens.
 *
 * Binding them here rather than in each page is what stops a page from
 * silently rendering unstyled: the `.ag-*` classes depend entirely on these
 * custom properties.
 */
export function DarkPageShell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`ag-page ${className}`} style={agentosStyle}>
      <DarkHeader />
      {children}
    </div>
  )
}

export function DarkHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close the mobile panel on route change, otherwise it stays open over the
  // new page because the header does not remount.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Lock background scrolling while the menu sheet is open, otherwise a drag
  // inside the panel scrolls the page behind it on touch devices.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onPointer = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  return (
    <>
      <a href="#main" className="ag-skip">
        Skip to content
      </a>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 60,
          // zIndex alone does not lift the bar above the panel once the panel is
          // a fixed overlay, so the bar gets its own stacking context. This is
          // what keeps the logo and the close button on top of the menu.
          isolation: 'isolate',
          backdropFilter: scrolled ? 'blur(18px) saturate(1.2)' : 'none',
          background: scrolled ? 'rgba(4,7,15,0.82)' : 'transparent',
          borderBottom: scrolled ? '1px solid rgba(160,195,255,0.12)' : '1px solid transparent',
          transition: 'background .3s ease, border-color .3s ease',
        }}
      >
        <div className="ag-shell" style={{ display: 'flex', alignItems: 'center', gap: 18, height: 70 }}>
          <Link
            href="/"
            aria-label="ALO Labs — home"
            style={{ display: 'flex', alignItems: 'center', gap: 11, textDecoration: 'none', flexShrink: 0 }}
          >
            <Image
              src={AGENTOS_LOGO.mark}
              alt=""
              width={34}
              height={30}
              style={{ objectFit: 'contain' }}
              priority
            />
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
              <span style={{ fontSize: '0.94rem', fontWeight: 800, letterSpacing: '-0.015em', color: '#fff' }}>
                ALO Labs
              </span>
              <span
                style={{
                  fontSize: '0.58rem',
                  fontWeight: 700,
                  letterSpacing: '0.15em',
                  color: '#FC5400',
                  textTransform: 'uppercase',
                }}
              >
                AgentOS
              </span>
            </span>
          </Link>

          <nav aria-label="Primary" className="ag-nav-desktop" style={{ marginLeft: 'auto', alignItems: 'center', gap: 4 }}>
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className="ag-nav-item"
                  data-active={active ? 'true' : 'false'}
                >
                  {item.label}
                </Link>
              )
            })}
            <Link href="/site/start-a-project" className="ag-btn ag-btn-primary" style={{ padding: '10px 20px', marginLeft: 12 }}>
              Start a project <ArrowRight size={15} />
            </Link>
          </nav>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="ag-mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="ag-menu-btn"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {open ? (
          <div ref={panel} id="ag-mobile-nav" className="ag-mobile-panel">
            <nav aria-label="Mobile navigation" className="ag-shell" style={{ display: 'grid', gap: 4, paddingBottom: 18 }}>
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="ag-mobile-link">
                  {item.label}
                  <ChevronRight size={16} />
                </Link>
              ))}
              <Link
                href="/site/start-a-project"
                className="ag-btn ag-btn-primary"
                style={{ marginTop: 10, justifyContent: 'center' }}
              >
                Start a project <ArrowRight size={16} />
              </Link>
            </nav>
          </div>
        ) : null}

        <style>{`
          .ag-nav-desktop { display: flex; }
          .ag-menu-btn {
            display: none;
            margin-left: auto;
            align-items: center;
            justify-content: center;
            width: 40px; height: 40px;
            border-radius: 11px;
            border: 1px solid rgba(160,195,255,0.20);
            background: rgba(255,255,255,0.05);
            color: #EAF0FF;
            cursor: pointer;
          }
          .ag-menu-btn:focus-visible { outline: 2px solid #9DBBFF; outline-offset: 2px; }
          .ag-nav-item {
            padding: 8px 13px;
            border-radius: 9px;
            font-size: 0.88rem;
            font-weight: 560;
            color: #A9B9D8;
            text-decoration: none;
            transition: color .18s ease, background .18s ease;
          }
          .ag-nav-item:hover { color: #fff; background: rgba(255,255,255,0.05); }
          .ag-nav-item[data-active='true'] { color: #fff; background: rgba(44,107,232,0.16); }
          /*
           * The panel used to be an in-flow block below the bar, so it pushed the
           * page down and its own top edge covered the logo — leaving the close
           * button sitting on the brand mark. As a fixed sheet anchored under the
           * 70px bar it reads as a menu, not as page content, and the logo stays
           * visible (and tappable) at all times.
           */
          .ag-mobile-panel {
            position: fixed;
            top: 70px;
            left: 0;
            right: 0;
            bottom: 0;
            overflow-y: auto;
            overscroll-behavior: contain;
            border-top: 1px solid rgba(160,195,255,0.10);
            background: rgba(4,7,15,0.985);
            backdrop-filter: blur(18px);
            animation: ag-sheet-in .18s ease-out;
          }
          @keyframes ag-sheet-in {
            from { opacity: 0; transform: translateY(-6px); }
            to   { opacity: 1; transform: none; }
          }
          @media (prefers-reduced-motion: reduce) {
            .ag-mobile-panel { animation: none; }
          }
          .ag-mobile-link {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 13px 4px;
            font-size: 1rem;
            font-weight: 600;
            color: #EAF0FF;
            text-decoration: none;
            border-bottom: 1px solid rgba(160,195,255,0.08);
          }
          @media (max-width: 980px) {
            .ag-nav-desktop { display: none !important; }
            .ag-menu-btn { display: inline-flex; }
          }
        `}</style>
      </header>
    </>
  )
}

/* ── Footer ────────────────────────────────────────────────────────────────── */

/**
 * Footer navigation.
 *
 * Six column groups, matching the brief: Company, Services, AgentOS, Projects,
 * Resources, plus the legal pair on its own row. Every label here must resolve
 * to a real public page — `__tests__/unit/lib/footer-links.test.ts` checks each
 * href against the routes that exist, so a nav entry cannot quietly 404.
 */
const FOOTER_GROUPS = [
  {
    title: 'Company',
    links: [
      { href: '/site/about', label: 'About ALO Labs' },
      { href: '/site/how-we-work', label: 'How we work' },
      { href: '/site/careers', label: 'Careers' },
      { href: '/site/contact', label: 'Contact' },
    ],
  },
  {
    title: 'Services',
    links: [
      { href: '/site/solutions', label: 'All solutions' },
      { href: '/site/services', label: 'All service lines' },
      { href: '/site/services/ai-agent-development', label: 'AI agent development' },
      { href: '/site/services/multi-agent-systems', label: 'Multi-agent systems' },
      { href: '/site/services/business-process-automation', label: 'Process automation' },
    ],
  },
  {
    title: 'AgentOS',
    links: [
      { href: '/site/platform-overview', label: 'Platform overview' },
      { href: '/site/platform-overview#capabilities', label: 'Capabilities' },
      { href: '/site/platform-overview#architecture', label: 'Architecture' },
      { href: '/site/services/cloud-devops-engineering', label: 'Cloud & DevOps' },
    ],
  },
  {
    title: 'Projects',
    links: [
      { href: '/site/projects', label: 'All projects' },
      { href: '/site/projects/agentos', label: 'AgentOS platform' },
      { href: '/site/projects/client-portal', label: 'Client portal' },
      { href: '/site/projects/public-website', label: 'This website' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { href: '/site/how-we-work', label: 'Delivery process' },
      { href: '/site/start-a-project', label: 'Start a project' },
      { href: '/login', label: 'Client login' },
      { href: '/site/privacy', label: 'Privacy policy' },
    ],
  },
] as const

export function DarkFooter() {
  const social = publishedSocialLinks()

  return (
    <footer style={{ borderTop: '1px solid rgba(160,195,255,0.11)', padding: '52px 0 34px', marginTop: 40 }}>
      <div className="ag-shell">
        <div className="ag-footer-grid-5">
          <div>
            <Link
              href="/"
              style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 14 }}
            >
              <Image src={AGENTOS_LOGO.mark} alt="" width={30} height={26} style={{ objectFit: 'contain' }} />
              <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.015em' }}>
                ALO Labs
              </span>
            </Link>
            <p style={{ margin: 0, maxWidth: '34ch', fontSize: '0.86rem', lineHeight: 1.65, color: '#8194B8' }}>
              AI-native software, intelligent agents and business automation — engineered to run in
              production.
            </p>
            <a
              href={`mailto:${PUBLIC_COMPANY.email}`}
              style={{ display: 'inline-block', marginTop: 14, fontSize: '0.86rem', color: '#9DBBFF', textDecoration: 'none' }}
            >
              {PUBLIC_COMPANY.email}
            </a>

            {/*
              Social icons render only for channels the owner has confirmed.
              src/lib/brand/social.ts holds the registry; anything unverified is
              filtered out before it reaches this loop, so a guessed URL can
              never appear here. Keyed by `id`, not `network`, because there are
              three Facebook destinations and duplicate React keys would silently
              drop icons.
            */}
            {social.length > 0 ? (
              <div className="ag-social" aria-label="ALO Labs on social media">
                {social.map((link) => {
                  const Icon = SOCIAL_ICON[link.icon]
                  return (
                    <a
                      key={link.id}
                      href={link.href}
                      aria-label={link.label}
                      title={link.label}
                      target="_blank"
                      rel="noopener noreferrer me"
                    >
                      <Icon size={16} aria-hidden="true" />
                    </a>
                  )
                })}
              </div>
            ) : null}
          </div>

          {FOOTER_GROUPS.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <p
                style={{
                  margin: '0 0 12px',
                  fontSize: '0.66rem',
                  fontWeight: 800,
                  letterSpacing: '0.13em',
                  textTransform: 'uppercase',
                  color: '#6E80A4',
                }}
              >
                {group.title}
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 9 }}>
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="ag-footer-link">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 40,
            paddingTop: 22,
            borderTop: '1px solid rgba(160,195,255,0.09)',
            fontSize: '0.78rem',
            color: '#6E80A4',
          }}
        >
          <span>© {new Date().getFullYear()} ALO Labs. All rights reserved.</span>
          <nav aria-label="Legal" style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <Link href="/site/privacy" className="ag-footer-link">
              Privacy Policy
            </Link>
            <Link href="/site/terms" className="ag-footer-link">
              Terms of Service
            </Link>
            <Link href="/site/contact" className="ag-footer-link">
              Contact
            </Link>
          </nav>
          <span>AgentOS — AI Agent Operating System.</span>
        </div>
      </div>
      <style>{`
        .ag-footer-link { color: #A9B9D8; text-decoration: none; font-size: 0.86rem; }
        .ag-footer-link:hover { color: #fff; text-decoration: underline; }
        .ag-footer-link:focus-visible { outline: 2px solid #9DBBFF; outline-offset: 2px; }
      `}</style>
    </footer>
  )
}

/* ── Breadcrumbs ──────────────────────────────────────────────────────────── */

export function Breadcrumbs({ crumbs }: { crumbs: { href: string; label: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="ag-crumbs">
        <li>
          <Link href="/">Home</Link>
        </li>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          return (
            <li key={c.href}>
              <ChevronRight size={13} aria-hidden="true" style={{ color: '#4A5A7A' }} />
              {last ? (
                <span aria-current="page">{c.label}</span>
              ) : (
                <Link href={c.href}>{c.label}</Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/* ── JSON-LD ──────────────────────────────────────────────────────────────── */

/**
 * Structured data block. `data` must already be escaped through jsonLd() —
 * the escaping lives in the builder so callers cannot forget it.
 */
export function JsonLd({ data }: { data: string }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: data }} />
}

/* ── Enquiry form (real endpoint) ─────────────────────────────────────────── */

type FormState = 'idle' | 'sending' | 'sent' | 'error'

const TOPICS = [
  'General enquiry',
  'AI Software Development',
  'AI Agent Development',
  'Multi-Agent AI Systems',
  'Business Process Automation',
  'Websites & Web Applications',
  'Enterprise CRM & Business Platforms',
  'AI Marketing & SEO',
  'AI Image & Video Production',
  'Voice & Conversational AI',
  'API & System Integration',
  'Data Intelligence & Analytics',
  'Cloud & DevOps Engineering',
  'Partnership',
  'Careers',
]

/**
 * Project enquiry form.
 *
 * Posts to /api/public/contact — the endpoint that already validates, honeypots,
 * rate-limits and persists a CRM lead. Reusing it rather than adding a second
 * lead API keeps one record of truth and one set of security checks.
 *
 * Success is only shown when the server says ok. `delivered: false` is surfaced
 * honestly: the lead was recorded but the notification email did not go out, and
 * the visitor is told what to do instead of being told it was sent.
 */
export function EnquiryForm({
  subject = 'Website enquiry',
  defaultTopic,
  compact = false,
}: {
  subject?: string
  defaultTopic?: string
  compact?: boolean
}) {
  const [state, setState] = useState<FormState>('idle')
  const [detail, setDetail] = useState('')
  const formRef = useRef<HTMLFormElement>(null)

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
        body: JSON.stringify({ ...data, subject: data.subject || subject }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        delivered?: boolean
        message?: string
      }
      if (res.ok && body.ok) {
        setState('sent')
        setDetail(
          body.delivered
            ? 'Your request has reached us. We reply to project enquiries within one business day.'
            : 'Your request has been recorded. The notification email could not be sent, so for anything urgent please write to info@alolabs.net.',
        )
        form.reset()
      } else {
        setState('error')
        setDetail(body.message || 'The message could not be sent. Please email info@alolabs.net.')
      }
    } catch {
      setState('error')
      setDetail('The message could not be sent — check your connection, or email info@alolabs.net.')
    }
  }

  const id = (n: string) => `${subject.replace(/\W+/g, '-').toLowerCase()}-${n}`

  if (state === 'sent') {
    return (
      <div role="status" aria-live="polite" className="ag-form-ok" style={{ alignItems: 'flex-start' }}>
        <Check size={17} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
        <span>{detail}</span>
      </div>
    )
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate={false} style={{ display: 'grid', gap: 16 }}>
      <div className={compact ? '' : 'ag-form-row'}>
        <div>
          <label className="ag-field-label" htmlFor={id('name')}>
            Name <span aria-hidden="true">*</span>
          </label>
          <input
            id={id('name')}
            name="name"
            required
            autoComplete="name"
            className="ag-input"
            placeholder="Your name"
          />
        </div>
        <div>
          <label className="ag-field-label" htmlFor={id('email')}>
            Email <span aria-hidden="true">*</span>
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

      <div className={compact ? '' : 'ag-form-row'}>
        <div>
          <label className="ag-field-label" htmlFor={id('company')}>
            Company
          </label>
          <input
            id={id('company')}
            name="company"
            autoComplete="organization"
            className="ag-input"
            placeholder="Optional"
          />
        </div>
        <div>
          <label className="ag-field-label" htmlFor={id('phone')}>
            Phone
          </label>
          <input
            id={id('phone')}
            name="phone"
            type="tel"
            autoComplete="tel"
            className="ag-input"
            placeholder="Optional"
          />
        </div>
      </div>

      {!compact ? (
        <div className="ag-form-row">
          <div>
            <label className="ag-field-label" htmlFor={id('topic')}>
              What is this about?
            </label>
            <select id={id('topic')} name="topic" className="ag-select" defaultValue={defaultTopic ?? 'General enquiry'}>
              {TOPICS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
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
        </div>
      ) : null}

      <div>
        <label className="ag-field-label" htmlFor={id('message')}>
          Project description <span aria-hidden="true">*</span>
        </label>
        <textarea
          id={id('message')}
          name="message"
          required
          rows={compact ? 4 : 6}
          className="ag-textarea"
          placeholder="What are you trying to build, and what is getting in the way? A few sentences is plenty."
          aria-describedby={id('msg-help')}
        />
        <p id={id('msg-help')} style={{ margin: '7px 0 0', fontSize: '0.76rem', color: '#6E80A4' }}>
          At least 10 characters. Please do not include passwords or confidential credentials.
        </p>
      </div>

      <input type="hidden" name="subject" value={subject} />

      {/*
        Honeypot: hidden from people, irresistible to bots.
        The wrapper is aria-hidden, but a visually-hidden field is still
        focusable by assistive technology, so the input also carries an explicit
        aria-label and tabIndex={-1}. Without this an automated audit reports an
        unlabeled form control on every page with this form.
      */}
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
              Send enquiry <ArrowRight size={16} aria-hidden="true" />
            </>
          )}
        </button>
        <span style={{ fontSize: '0.78rem', color: '#6E80A4' }}>We reply within one business day.</span>
      </div>

      <style>{`
        .ag-form-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
        @media (max-width: 620px) { .ag-form-row { grid-template-columns: 1fr; } }
        .ag-spin { animation: ag-spin-icon 1s linear infinite; }
        @keyframes ag-spin-icon { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .ag-spin { animation: none; }
        }
      `}</style>
    </form>
  )
}
