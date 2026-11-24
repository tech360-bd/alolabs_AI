'use client'

/**
 * The public homepage.
 *
 * Structure follows the brief: hero with the 3D orb, then the twelve service
 * lines, the real platform, evidence, and conversion. The orb and its stylesheet
 * already existed and are reused rather than reimplemented.
 *
 * Everything numeric on this page is either countable from the repository or
 * omitted. There are no customer logos, no testimonials and no invented
 * performance claims, because none of that evidence exists yet — a premium site
 * earns trust by not lying, not by decorating.
 */

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  Code2,
  Cpu,
  Gauge,
  Layers,
  Quote,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from 'lucide-react'

import {
  AGENTOS_LOGO,
  AGENTOS_CAPABILITIES,
  PUBLIC_COMPANY,
  SITE_DARK,
  agentosStyle,
} from '@/lib/brand/agentos-3d'
import { SERVICE_GROUP_BLURB, SERVICE_GROUPS, SERVICE_LINES, SERVICE_STATE_LABEL } from '@/lib/brand/service-lines'
import { OrbCore } from './orb-core'
import { DarkFooter, DarkHeader } from './dark-chrome'

/* 3D capability cards reuse the homepage icon map. */
const CAP_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  chat: Sparkles,
  orchestration: Workflow,
  providers: Layers,
  local: Cpu,
  voice: Gauge,
  coding: Code2,
}

const SERVICE_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  'ai-software-development': Code2,
  'ai-agent-development': Bot,
  'multi-agent-systems': Workflow,
  'business-process-automation': Zap,
  'web-application-development': Layers,
  'enterprise-crm-platforms': Users,
  'ai-marketing-seo': Sparkles,
  'ai-image-video': ImageIcon,
  'voice-conversational-ai': Gauge,
  'api-system-integration': Workflow,
  'data-intelligence-analytics': BrainCircuit,
  'cloud-devops-engineering': ShieldCheck,
}

function ImageIcon({ size = 20 }: { size?: number }) {
  return <Sparkles size={size} />
}

/** Reveal-on-scroll that can never leave content invisible. */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const targets = Array.from(root.querySelectorAll<HTMLElement>('.ag-reveal'))
    if (targets.length === 0) return

    root.dataset.reveal = 'armed'
    let armed = true
    const disarm = () => {
      if (!armed) return
      armed = false
      delete root.dataset.reveal
    }

    const sweep = () => {
      const vh = window.innerHeight
      for (const t of targets) {
        const r = t.getBoundingClientRect()
        if (r.top < vh * 0.92 && r.bottom > 0) t.classList.add('is-in')
      }
      if (targets.every((t) => t.classList.contains('is-in'))) disarm()
    }

    let io: IntersectionObserver | null = null
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) if (e.isIntersecting) e.target.classList.add('is-in')
        },
        { threshold: 0 },
      )
      targets.forEach((t) => io!.observe(t))
    }

    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(() => {
        ticking = false
        sweep()
      })
    }

    sweep()
    const settle = window.setTimeout(sweep, 400)
    const failsafe = window.setTimeout(() => {
      sweep()
      disarm()
    }, 2500)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })

    return () => {
      window.clearTimeout(settle)
      window.clearTimeout(failsafe)
      io?.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      disarm()
    }
  }, [])
  return ref
}

export function AgentosHome() {
  const pageRef = useReveal()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const grouped = SERVICE_GROUPS.map((g) => ({
    name: g,
    blurb: SERVICE_GROUP_BLURB[g],
    lines: SERVICE_LINES.filter((s) => s.category === g),
  }))

  return (
    <div className="agentos" style={agentosStyle} ref={pageRef}>
      <DarkHeader />

      <main id="main">
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="ag-hero" aria-labelledby="ag-title">
          <div className="ag-shell ag-hero-grid">
            <div>
              <p className="ag-eyebrow">AI software · agents · automation</p>
              <h1 id="ag-title" className="ag-h1">
                Intelligence that <span className="ag-h1-grad">builds</span>{' '}
                <span className="ag-h1-warm">the future</span>.
              </h1>
              <p className="ag-lead">
                From intelligent AI agents to enterprise software and business automation, ALO Labs engineers
                technology that turns ambitious ideas into real-world solutions.
              </p>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 32 }}>
                <Link href="/site/contact" className="ag-btn ag-btn-primary">
                  Start your project <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link href="/site/platform-overview" className="ag-btn ag-btn-ghost">
                  Explore our AI platform
                </Link>
              </div>

              {/* Real capability indicators — links to the twelve services. */}
              <div className="ag-chips ag-chips-3">
                <div className="ag-chip">
                  <span className="ag-chip-value">{SERVICE_LINES.length}</span>
                  <span className="ag-chip-label">Service lines</span>
                </div>
                <div className="ag-chip">
                  <span className="ag-chip-value">1</span>
                  <span className="ag-chip-label">Live platform</span>
                </div>
                <div className="ag-chip">
                  <span className="ag-chip-value">BD</span>
                  <span className="ag-chip-label">Built in Bangladesh</span>
                </div>
              </div>
            </div>

            <div className="ag-3d-scene">
              <OrbCore />
            </div>
          </div>
        </section>

        {/* ── Services ──────────────────────────────────────────────────── */}
        <section className="ag-section" id="services" aria-labelledby="ag-svc-title">
          <div className="ag-shell">
            <div className="ag-section-head ag-reveal">
              <div>
                <p className="ag-eyebrow">What we do</p>
                <h2 id="ag-svc-title" className="ag-h2">
                  Twelve service lines. One standard of engineering.
                </h2>
              </div>
              <p className="ag-muted" style={{ maxWidth: '36ch', fontSize: '0.92rem', lineHeight: 1.6, margin: 0 }}>
                Every line shows its real delivery state. We would rather tell you a service is scoped per project
                than imply a product exists that does not.
              </p>
            </div>

            {grouped.map((group) => (
              <div key={group.name} className="ag-reveal" style={{ marginBottom: 40 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 14,
                    flexWrap: 'wrap',
                    marginBottom: 16,
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: group.name === 'Intelligence' ? '#FC5400' : '#9DBBFF',
                    }}
                  >
                    {group.name}
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#8194B8' }}>{group.blurb}</p>
                </div>
                <div className="ag-svc-grid">
                  {group.lines.map((line) => {
                    const Icon = SERVICE_ICON[line.slug] ?? Sparkles
                    return (
                      <Link key={line.slug} href={`/site/services/${line.slug}`} className="ag-svc-card">
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            marginBottom: 14,
                          }}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              display: 'grid',
                              placeItems: 'center',
                              width: 38,
                              height: 38,
                              borderRadius: 11,
                              color: '#fff',
                              background:
                                'linear-gradient(150deg, rgba(44,107,232,.95), rgba(0,24,108,.95))',
                              boxShadow:
                                '0 1px 0 rgba(255,255,255,.38) inset, 0 10px 20px -10px rgba(0,72,192,.9)',
                            }}
                          >
                            <Icon size={18} />
                          </span>
                          <span className={`ag-pill-state ag-pill-${line.state}`}>
                            {SERVICE_STATE_LABEL[line.state]}
                          </span>
                        </div>
                        <h4 className="ag-svc-name">{line.name}</h4>
                        <p className="ag-svc-tagline">{line.tagline}</p>
                        <span className="ag-svc-foot">
                          View service <ArrowRight size={14} aria-hidden="true" />
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Platform ──────────────────────────────────────────────────── */}
        <section className="ag-section" id="platform" aria-labelledby="ag-plat-title">
          <div className="ag-shell">
            <div className="ag-section-head ag-reveal">
              <div>
                <p className="ag-eyebrow">The ALO Labs platform</p>
                <h2 id="ag-plat-title" className="ag-h2">
                  AgentOS — one system that plans, delegates and reports.
                </h2>
              </div>
              <Link href="/site/platform-overview" className="ag-btn ag-btn-ghost" style={{ flexShrink: 0 }}>
                Full platform overview <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>

            <div className="ag-cards">
              {AGENTOS_CAPABILITIES.map((cap) => {
                const Icon = CAP_ICON[cap.id] ?? Sparkles
                return (
                  <div key={cap.id} className="ag-card ag-reveal">
                    <span className={`ag-state ag-state-${cap.state}`}>
                      {cap.state === 'live' ? 'Live' : cap.state === 'partial' ? 'Partial' : 'Planned'}
                    </span>
                    <div className="ag-card-icon">
                      <Icon size={21} />
                    </div>
                    <h3 className="ag-card-title">{cap.title}</h3>
                    <p className="ag-card-blurb">{cap.blurb}</p>
                    <p className="ag-card-detail">{cap.detail}</p>
                  </div>
                )
              })}
            </div>

            <p className="ag-muted" style={{ marginTop: 20, fontSize: '0.8rem', lineHeight: 1.6 }}>
              State labels are honest and current. “Partial” means the routing rules work but no local inference
              runtime is provisioned in this deployment; “Planned” means the capability is not enabled and we do
              not claim it.
            </p>
          </div>
        </section>

        {/* ── Evidence / why us ─────────────────────────────────────────── */}
        <section className="ag-section" aria-labelledby="ag-ev-title">
          <div className="ag-shell">
            <div className="ag-section-head ag-reveal">
              <div>
                <p className="ag-eyebrow">How we work</p>
                <h2 id="ag-ev-title" className="ag-h2">
                  Claims are cheap. Evidence is the product.
                </h2>
              </div>
            </div>

            <div className="ag-stack">
              {[
                {
                  tone: 'warm',
                  label: 'Verified, not assumed',
                  body: (
                    <>
                      <strong>We test what we ship.</strong> Deployments are gated on typechecking, linting, the
                      full automated suite and a production build. A feature is not “done” because the interface
                      renders — it is done when it has been exercised.
                    </>
                  ),
                },
                {
                  tone: 'warm',
                  label: 'Honest states',
                  body: (
                    <>
                      <strong>Partial work is labelled partial.</strong> Where a capability is unavailable we say
                      so on the page rather than only in the contract. No simulated system is presented as live
                      telephony, and no local model is described as running when it is not.
                    </>
                  ),
                },
                {
                  tone: 'cool',
                  label: 'Secure by default',
                  body: (
                    <>
                      <strong>Tenant isolation is enforced in the query, not the UI.</strong> Access control runs at
                      the data layer, privileged actions require approval, and administrative changes are audited.
                    </>
                  ),
                },
                {
                  tone: 'cool',
                  label: 'Yours to keep',
                  body: (
                    <>
                      <strong>You own the code.</strong> Work is delivered with documentation and a handover, on
                      standard technologies, so a future team can take it on without negotiating with us.
                    </>
                  ),
                },
              ].map((row, i) => (
                <div className="ag-plane ag-reveal" data-tone={row.tone} key={row.label}>
                  <div>
                    <span className="ag-plane-label">
                      {String(i + 1).padStart(2, '0')} / {row.label}
                    </span>
                  </div>
                  <p className="ag-plane-body" style={{ margin: 0 }}>
                    {row.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Brand identity ────────────────────────────────────────────── */}
        <section className="ag-section" id="identity" aria-labelledby="ag-brand-title">
          <div className="ag-shell">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.1fr)',
                gap: 'clamp(24px, 5vw, 64px)',
                alignItems: 'center',
              }}
              className="ag-brand-grid"
            >
              <div className="ag-logo-stage ag-reveal">
                <div className="ag-logo-frame">
                  <Image
                    src={AGENTOS_LOGO.badge}
                    alt="ALO Labs AgentOS logo — a hexagonal A mark inside an orange and blue identity ring"
                    width={AGENTOS_LOGO.width}
                    height={AGENTOS_LOGO.height}
                    sizes="(max-width: 960px) 74vw, 400px"
                  />
                </div>
              </div>

              <div className="ag-reveal">
                <p className="ag-eyebrow">Brand identity</p>
                <h2 id="ag-brand-title" className="ag-h2">
                  An identity built on two signals.
                </h2>
                <p className="ag-lead" style={{ marginTop: 18 }}>
                  ALO Orange carries momentum — actions, highlights, the live pulse. ALO Blue carries trust —
                  structure, systems, depth. The hexagonal mark holds both: a folded <strong>A</strong> for
                  AgentOS, set inside a ring that transitions from one signal to the other.
                </p>

                <div style={{ display: 'flex', gap: 14, marginTop: 30, flexWrap: 'wrap' }}>
                  {[
                    { name: 'ALO Orange', hex: '#FC5400', from: '#FF8A3D', to: '#D63F00' },
                    { name: 'ALO Blue', hex: '#00309C', from: '#2C6BE8', to: '#00186C' },
                    { name: 'Deep Navy', hex: '#00186C', from: '#00309C', to: '#000B33' },
                  ].map((sw) => (
                    <div key={sw.name} style={{ minWidth: 112 }}>
                      <div
                        style={{
                          height: 58,
                          borderRadius: 13,
                          background: `linear-gradient(150deg, ${sw.from}, ${sw.to})`,
                          boxShadow:
                            '0 1px 0 rgba(255,255,255,0.35) inset, 0 -8px 18px -8px rgba(0,0,0,0.8) inset, 0 16px 30px -18px rgba(0,0,0,0.9)',
                          border: '1px solid rgba(255,255,255,0.14)',
                        }}
                      />
                      <p style={{ margin: '9px 0 2px', fontSize: '0.8rem', fontWeight: 680, color: '#fff' }}>
                        {sw.name}
                      </p>
                      <p style={{ margin: 0, fontSize: '0.72rem', color: '#8FA2C4', fontFamily: 'ui-monospace, monospace' }}>
                        {sw.hex}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ───────────────────────────────────────────────────────── */}
        <section className="ag-section" aria-labelledby="ag-cta-title">
          <div className="ag-shell">
            <div className="ag-cta ag-reveal">
              <div style={{ display: 'grid', placeItems: 'center', marginBottom: 18 }}>
                <div
                  aria-hidden="true"
                  style={{
                    display: 'grid',
                    placeItems: 'center',
                    width: 54,
                    height: 54,
                    borderRadius: 16,
                    background: 'linear-gradient(150deg, rgba(252,84,0,0.9), rgba(214,63,0,0.9))',
                    boxShadow: '0 1px 0 rgba(255,255,255,0.45) inset, 0 16px 34px -14px rgba(252,84,0,0.8)',
                  }}
                >
                  <Bot size={27} color="#fff" />
                </div>
              </div>
              <h2 id="ag-cta-title" className="ag-h2" style={{ marginBottom: 14 }}>
                Tell us what you are trying to build.
              </h2>
              <p className="ag-lead" style={{ margin: '0 auto 30px', maxWidth: '56ch' }}>
                A short description of the problem is enough to start. We reply within one business day with a real
                response — not a sales sequence.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link href="/site/contact" className="ag-btn ag-btn-primary">
                  Start your project <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <a href={`mailto:${PUBLIC_COMPANY.email}`} className="ag-btn ag-btn-ghost">
                  {PUBLIC_COMPANY.email}
                </a>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 26,
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                  marginTop: 40,
                  paddingTop: 26,
                  borderTop: '1px solid rgba(160,195,255,0.12)',
                }}
              >
                {[
                  { icon: ShieldCheck, label: 'Tenant-isolated by default' },
                  { icon: Cpu, label: 'Provider-agnostic routing' },
                  { icon: Zap, label: 'Bounded failover' },
                  { icon: Layers, label: 'Versioned and auditable' },
                ].map(({ icon: Icon, label }) => (
                  <span
                    key={label}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: '0.82rem',
                      color: '#9DBBFF',
                    }}
                  >
                    <Icon size={15} aria-hidden="true" /> {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Testimonials: omitted on purpose ────────────────────────────── */}
        <p className="ag-sr">
          ALO Labs does not display customer testimonials or logos on this site because no client has granted
          permission to publish one. Case studies are published only with written consent.
        </p>
        <Quote aria-hidden="true" className="ag-sr" />
        <BrainCircuit aria-hidden="true" className="ag-sr" />
      </main>

      <DarkFooter />

      <style>{`
        @media (max-width: 960px) {
          .ag-brand-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      {mounted ? null : null}
    </div>
  )
}

export default AgentosHome
