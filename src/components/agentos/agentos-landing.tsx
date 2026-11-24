'use client'

/**
 * ALO Labs AgentOS — 3D landing page.
 *
 * Content policy: every claim here is either measured from the repository or
 * labelled with its real state. Capability cards carry a live / partial /
 * planned badge, because the platform's own audit would contradict anything
 * stronger. Nothing on this page fabricates a metric.
 */

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Bot,
  Code2,
  Cpu,
  GaugeCircle,
  Layers,
  MessagesSquare,
  Network,
  ShieldCheck,
  Sparkles,
  Workflow,
  Zap,
} from 'lucide-react'

import {
  AGENTOS_CAPABILITIES,
  AGENTOS_DEPARTMENTS,
  AGENTOS_LOGO,
  AGENTOS_STATS,
  agentosStyle,
} from '@/lib/brand/agentos-3d'
import { OrbCore } from './orb-core'

const CAPABILITY_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  chat: MessagesSquare,
  orchestration: Network,
  providers: Workflow,
  local: Cpu,
  voice: GaugeCircle,
  coding: Code2,
}

const STATE_LABEL: Record<string, string> = {
  live: 'Live',
  partial: 'Partial',
  planned: 'Planned',
}

/** Reveal-on-scroll. Content is visible without JS; this only adds motion. */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const targets = Array.from(root.querySelectorAll<HTMLElement>('.ag-reveal'))
    if (targets.length === 0) return

    // The reveal is decoration; visibility is a correctness requirement. So the
    // hidden state is only armed while this element is actually at the top of
    // the page, and a plain scroll sweep runs alongside IntersectionObserver.
    // IO alone proved non-deterministic here (elements already in the viewport
    // were occasionally never reported), and the failure mode is invisible
    // content, which is unacceptable regardless of the cause.
    root.dataset.reveal = 'armed'

    let armed = true
    const disarm = () => {
      if (!armed) return
      armed = false
      // Deleting the attribute restores every element to full opacity without
      // touching the observer, so mid-scroll animating elements never flicker.
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
          for (const e of entries) {
            if (e.isIntersecting) e.target.classList.add('is-in')
          }
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

    // Sweep on settle as well as on scroll. A single trailing scroll event is
    // not guaranteed (and a full-page capture never scrolls at all), so the
    // authoritative pass runs once the layout is quiet.
    sweep()
    const settle = window.setTimeout(sweep, 400)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })

    // Belt and braces: if anything above failed, stop hiding content.
    const failsafe = window.setTimeout(() => {
      sweep()
      disarm()
    }, 2500)

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

/** Pointer-driven 3D tilt for cards, disabled for touch and reduced motion. */
function useTilt<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    if (window.matchMedia?.('(hover: none)').matches) return

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width - 0.5
      const py = (e.clientY - r.top) / r.height - 0.5
      el.style.transform = `translate3d(${px * 8}px, ${py * -8 - 6}px, 26px) rotateX(${py * -6}deg) rotateY(${px * 6}deg)`
    }
    const onLeave = () => {
      el.style.transform = ''
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [])
  return ref
}

function TiltCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useTilt<HTMLDivElement>()
  return (
    <div ref={ref} className={`ag-card ${className}`}>
      {children}
    </div>
  )
}

const ARCH_LAYERS = [
  {
    tone: 'warm',
    label: 'Experience',
    body: (
      <>
        <strong>One conversational surface.</strong> Persistent history, search, code blocks, retry, and
        per-conversation context — the single place a user starts any supported work.
      </>
    ),
  },
  {
    tone: 'warm',
    label: 'Orchestration',
    body: (
      <>
        <strong>Requests become plans.</strong> Goal decomposition, skill-based agent assignment, parallel
        execution for independent steps, and a tracked status for every step.
      </>
    ),
  },
  {
    tone: 'cool',
    label: 'Agents',
    body: (
      <>
        <strong>Permissioned specialists.</strong> Each agent runs inside an assigned scope with declared tools,
        resource limits, version history, and an approval gate for privileged actions.
      </>
    ),
  },
  {
    tone: 'cool',
    label: 'Inference',
    body: (
      <>
        <strong>One AI gateway.</strong> Local-first routing with a bounded four-attempt provider chain. The
        provider that actually answered is recorded; paid APIs are never a silent fallback.
      </>
    ),
  },
  {
    tone: 'cool',
    label: 'Data and Audit',
    body: (
      <>
        <strong>Tenant-isolated by default.</strong> Company scoping is enforced in the query, usage is metered
        inside the same transaction as the model call, and every administrative action is audited.
      </>
    ),
  },
] as const

export function AgentosLanding() {
  const pageRef = useReveal()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="agentos" style={agentosStyle} ref={pageRef}>
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header
        className="ag-nav"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backdropFilter: scrolled ? 'blur(16px)' : 'none',
          background: scrolled ? 'rgba(5,10,24,0.78)' : 'transparent',
          borderBottom: scrolled ? '1px solid rgba(160,195,255,0.12)' : '1px solid transparent',
          transition: 'background 0.3s ease, border-color 0.3s ease',
        }}
      >
        <div className="ag-shell" style={{ display: 'flex', alignItems: 'center', gap: 18, height: 68 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 11, textDecoration: 'none' }}>
            <Image
              src={AGENTOS_LOGO.mark}
              alt="ALO Labs AgentOS"
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
                  fontSize: '0.6rem',
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

          <nav
            aria-label="Primary"
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 26 }}
            className="ag-nav-links"
          >
            <a href="#capabilities" className="ag-nav-link">Capabilities</a>
            <a href="#architecture" className="ag-nav-link">Architecture</a>
            <a href="#identity" className="ag-nav-link">Brand</a>
            <Link href="/login" className="ag-btn ag-btn-ghost" style={{ padding: '10px 20px' }}>
              Sign in
            </Link>
            <Link href="/dashboard" className="ag-btn ag-btn-primary" style={{ padding: '10px 20px' }}>
              Open console <ArrowRight size={15} />
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="ag-hero" aria-labelledby="ag-title">
        <div className="ag-shell ag-hero-grid">
          <div>
            <p className="ag-eyebrow">AI Agent Operating System</p>
            <h1 id="ag-title" className="ag-h1">
              The operating system for{' '}
              <span className="ag-h1-grad">intelligent</span>{' '}
              <span className="ag-h1-warm">agents</span>.
            </h1>
            <p className="ag-lead">
              ALO Labs AgentOS orchestrates specialised AI agents across one conversational surface — planning,
              delegating, verifying and reporting real work inside your own infrastructure.
            </p>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 32 }}>
              <Link href="/dashboard" className="ag-btn ag-btn-primary">
                Enter the console <ArrowRight size={16} />
              </Link>
              <a href="#capabilities" className="ag-btn ag-btn-ghost">
                Explore capabilities
              </a>
            </div>

            <div className="ag-chips">
              {AGENTOS_STATS.map((s) => (
                <div className="ag-chip" key={s.label}>
                  <span className="ag-chip-value">{s.value}</span>
                  <span className="ag-chip-label">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 3D scene */}
          <div className="ag-3d-scene">
            <OrbCore />
          </div>
        </div>
      </section>

      {/* ── Capabilities ────────────────────────────────────────────────── */}
      <section className="ag-section" id="capabilities" aria-labelledby="ag-cap-title">
        <div className="ag-shell">
          <div className="ag-section-head ag-reveal">
            <div>
              <p className="ag-eyebrow">Core capabilities</p>
              <h2 id="ag-cap-title" className="ag-h2">
                Built to do the work, not to describe it.
              </h2>
            </div>
            <p className="ag-muted" style={{ maxWidth: '34ch', fontSize: '0.92rem', lineHeight: 1.6, margin: 0 }}>
              Each card shows its real state in this build. Nothing is marked live that is not running.
            </p>
          </div>

          <div className="ag-cards">
            {AGENTOS_CAPABILITIES.map((cap, i) => {
              const Icon = CAPABILITY_ICONS[cap.id] ?? Sparkles
              return (
                <div className="ag-reveal" key={cap.id} style={{ transitionDelay: `${i * 60}ms`, height: '100%' }}>
                  <TiltCard>
                    <span className={`ag-state ag-state-${cap.state}`}>{STATE_LABEL[cap.state]}</span>
                    <div className="ag-card-icon">
                      <Icon size={21} />
                    </div>
                    <h3 className="ag-card-title">{cap.title}</h3>
                    <p className="ag-card-blurb">{cap.blurb}</p>
                    <p className="ag-card-detail">{cap.detail}</p>
                  </TiltCard>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Architecture ────────────────────────────────────────────────── */}
      <section className="ag-section" id="architecture" aria-labelledby="ag-arch-title">
        <div className="ag-shell">
          <div className="ag-section-head ag-reveal">
            <div>
              <p className="ag-eyebrow">System architecture</p>
              <h2 id="ag-arch-title" className="ag-h2">
                Five layers. One gateway. No duplicated brains.
              </h2>
            </div>
          </div>

          <div className="ag-stack">
            {ARCH_LAYERS.map((layer, i) => (
              <div
                className="ag-plane ag-reveal"
                data-tone={layer.tone}
                key={layer.label}
              >
                <div>
                  <span className="ag-plane-label">
                    {String(i + 1).padStart(2, '0')} / {layer.label}
                  </span>
                </div>
                <p className="ag-plane-body" style={{ margin: 0 }}>
                  {layer.body}
                </p>
              </div>
            ))}
          </div>

          <div className="ag-reveal" style={{ marginTop: 34 }}>
            <p className="ag-muted" style={{ fontSize: '0.85rem', margin: '0 0 14px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Agent departments
            </p>
            <div className="ag-pills">
              {AGENTOS_DEPARTMENTS.map((d) => (
                <span className="ag-pill" key={d}>{d}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Brand identity ──────────────────────────────────────────────── */}
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
                  alt="ALO Labs AgentOS logo — hexagonal A mark with orange and blue identity ring"
                  width={AGENTOS_LOGO.width}
                  height={AGENTOS_LOGO.height}
                  sizes="(max-width: 960px) 74vw, 400px"
                  priority
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
                  <div key={sw.name} style={{ minWidth: 118 }}>
                    <div
                      style={{
                        height: 62,
                        borderRadius: 14,
                        background: `linear-gradient(150deg, ${sw.from}, ${sw.to})`,
                        boxShadow:
                          '0 1px 0 rgba(255,255,255,0.35) inset, 0 -8px 18px -8px rgba(0,0,0,0.8) inset, 0 16px 30px -18px rgba(0,0,0,0.9)',
                        border: '1px solid rgba(255,255,255,0.14)',
                      }}
                    />
                    <p style={{ margin: '10px 0 2px', fontSize: '0.82rem', fontWeight: 680, color: '#fff' }}>
                      {sw.name}
                    </p>
                    <p style={{ margin: 0, fontSize: '0.74rem', color: '#8FA2C4', fontFamily: 'ui-monospace, monospace' }}>
                      {sw.hex}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section className="ag-section" aria-labelledby="ag-cta-title">
        <div className="ag-shell">
          <div className="ag-cta ag-reveal">
            <div style={{ display: 'grid', placeItems: 'center', marginBottom: 20 }}>
              <div
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  background: 'linear-gradient(150deg, rgba(252,84,0,0.9), rgba(214,63,0,0.9))',
                  boxShadow: '0 1px 0 rgba(255,255,255,0.45) inset, 0 16px 34px -14px rgba(252,84,0,0.8)',
                }}
              >
                <Bot size={28} color="#fff" />
              </div>
            </div>
            <h2 id="ag-cta-title" className="ag-h2" style={{ marginBottom: 14 }}>
              Put the agents to work.
            </h2>
            <p className="ag-lead" style={{ margin: '0 auto 30px', maxWidth: '54ch' }}>
              Start a conversation, create a project, and let the orchestrator plan and delegate inside your
              infrastructure — with every step tracked and every action auditable.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/dashboard" className="ag-btn ag-btn-primary">
                Open the console <ArrowRight size={16} />
              </Link>
              <Link href="/site/contact" className="ag-btn ag-btn-ghost">
                Talk to the team
              </Link>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 26,
                justifyContent: 'center',
                flexWrap: 'wrap',
                marginTop: 42,
                paddingTop: 28,
                borderTop: '1px solid rgba(160,195,255,0.12)',
              }}
            >
              {[
                { icon: ShieldCheck, label: 'Tenant-isolated by default' },
                { icon: Cpu, label: 'Local-first routing' },
                { icon: Zap, label: 'Bounded provider failover' },
                { icon: Layers, label: 'Versioned and auditable' },
              ].map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#9DBBFF' }}
                >
                  <Icon size={15} /> {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid rgba(160,195,255,0.10)', padding: '34px 0 44px', marginTop: 20 }}>
        <div
          className="ag-shell"
          style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', justifyContent: 'space-between' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Image src={AGENTOS_LOGO.mark} alt="" width={24} height={21} style={{ objectFit: 'contain' }} />
            <span style={{ fontSize: '0.82rem', color: '#8FA2C4' }}>
              © {new Date().getFullYear()} ALO Labs. AgentOS — AI Agent Operating System.
            </span>
          </div>
          <div style={{ display: 'flex', gap: 22, fontSize: '0.82rem' }}>
            <Link href="/site/privacy" style={{ color: '#8FA2C4', textDecoration: 'none' }}>Privacy</Link>
            <Link href="/site/terms" style={{ color: '#8FA2C4', textDecoration: 'none' }}>Terms</Link>
            <Link href="/site/contact" style={{ color: '#8FA2C4', textDecoration: 'none' }}>Contact</Link>
          </div>
        </div>
      </footer>

      <style>{`
        .ag-nav-link {
          color: #A9B9D8;
          text-decoration: none;
          font-size: 0.88rem;
          font-weight: 560;
          transition: color 0.2s ease;
        }
        .ag-nav-link:hover { color: #fff; }
        @media (max-width: 900px) {
          .ag-nav-links .ag-nav-link { display: none; }
        }
        .ag-nav-links .ag-btn { white-space: nowrap; }
        @media (max-width: 560px) {
          /* Drop the secondary action rather than squeezing the primary one. */
          .ag-nav-links .ag-btn-ghost { display: none; }
          .ag-nav-links { gap: 12px !important; }
          .ag-nav-links .ag-btn { padding: 10px 16px !important; font-size: 0.86rem !important; }
        }
        @media (max-width: 960px) {
          .ag-brand-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

export default AgentosLanding
