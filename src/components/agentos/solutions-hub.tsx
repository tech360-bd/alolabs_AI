'use client'

/**
 * /site/solutions — "AI Solutions That Move Your Business Forward."
 *
 * This is the buying view of the company. The services index at
 * /site/services answers "how is it delivered and is it real?"; this page
 * answers "what outcome can I actually purchase, and what do I get?".
 *
 * Both render from data (src/lib/brand/solutions.ts and service-lines.ts) and
 * both show the delivery state on every card, because a solutions page that
 * only ever says "available" is an advertisement, not information.
 *
 * Page order follows the brief: what this is → the twelve solutions by group →
 * how the four questions get answered → the engagement paths → the platform
 * behind it → conversion.
 */

import Link from 'next/link'
import {
  ArrowRight,
  Bot,
  Boxes,
  BrainCircuit,
  Clapperboard,
  ClipboardList,
  Code2,
  Compass,
  Gauge,
  Globe,
  Headphones,
  Layers,
  Megaphone,
  PenLine,
  Plug,
  ServerCog,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
} from 'lucide-react'

import { agentosStyle } from '@/lib/brand/agentos-3d'
import {
  BUSINESS_SOLUTIONS,
  SOLUTION_GROUPS,
  SOLUTION_GROUP_BLURB,
  SOLUTION_STATE_LABEL,
  SOLUTION_STATE_MEANING,
  solutionStateCounts,
  type SolutionState,
} from '@/lib/brand/solutions'
import { Breadcrumbs, DarkPageShell, DarkFooter } from '@/components/agentos/dark-chrome'

/** Icon per solution slug. Fallback keeps a new slug from rendering blank. */
const SOL_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  'ai-software-development': Code2,
  'custom-ai-agent-development': Bot,
  'multi-agent-ai-systems': Workflow,
  'business-process-automation': Gauge,
  'website-web-application-development': Globe,
  'enterprise-crm-portals': Users,
  'ai-marketing-seo': Megaphone,
  'ai-content-production': PenLine,
  'image-video-audio': Clapperboard,
  'voice-ai-customer-support': Headphones,
  'api-system-integration': Plug,
  'cloud-devops-engineering': ServerCog,
}

const STATE_ICON: Record<SolutionState, React.ComponentType<{ size?: number; style?: React.CSSProperties; 'aria-hidden'?: boolean | 'true' | 'false' }>> = {
  live: ShieldCheck,
  available: Compass,
  scoped: ClipboardList,
}

export function SolutionsHubPage() {
  const counts = solutionStateCounts()
  const grouped = SOLUTION_GROUPS.map((group) => ({
    group,
    blurb: SOLUTION_GROUP_BLURB[group],
    items: BUSINESS_SOLUTIONS.filter((s) => s.group === group),
  }))

  return (
    <DarkPageShell>
      <main id="main">
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="ag-page-hero">
          <div className="ag-shell">
            <Breadcrumbs crumbs={[{ href: '/site/solutions', label: 'Solutions' }]} />

            <div className="ag-case-head">
              <div>
                <p className="ag-eyebrow">Business solutions</p>
                <h1 className="ag-h1" style={{ fontSize: 'clamp(2.2rem, 4.8vw, 3.7rem)', maxWidth: '19ch' }}>
                  AI solutions that move your business{' '}
                  <span className="ag-h1-warm">forward</span>.
                </h1>
                <p className="ag-lead">
                  Twelve things you can buy from ALO Labs — AI software, agents, automation, platforms,
                  growth and the engineering underneath. Each one states the business problem it solves,
                  exactly what you receive, how we deliver it, and what is genuinely available today.
                </p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 30 }}>
                  <Link href="/site/contact" className="ag-btn ag-btn-primary">
                    Start a project <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                  <Link href="#solutions" className="ag-btn ag-btn-ghost">
                    See the twelve solutions
                  </Link>
                </div>
              </div>

              <div className="ag-glass" style={{ padding: '22px 20px' }}>
                <p className="ag-eyebrow" style={{ marginBottom: 14 }}>
                  Read the labels
                </p>
                <div style={{ display: 'grid', gap: 14 }}>
                  {(Object.keys(SOLUTION_STATE_LABEL) as SolutionState[]).map((s) => {
                    const Icon = STATE_ICON[s]
                    return (
                      <div key={s} style={{ display: 'grid', gridTemplateColumns: '26px 1fr', gap: 10 }}>
                        <Icon size={17} aria-hidden="true" style={{ color: '#9DBBFF', marginTop: 2 }} />
                        <div>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span className={`ag-pill-state ag-pill-${s === 'scoped' ? 'project' : s}`}>
                              {SOLUTION_STATE_LABEL[s]}
                            </span>
                            <span style={{ fontSize: '0.72rem', color: '#6E80A4' }}>{counts[s]} of 12</span>
                          </span>
                          <p style={{ margin: '7px 0 0', fontSize: '0.79rem', lineHeight: 1.5, color: '#93A2C2' }}>
                            {SOLUTION_STATE_MEANING[s]}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p style={{ margin: '16px 0 0', paddingTop: 14, borderTop: '1px solid rgba(160,195,255,0.1)', fontSize: '0.75rem', lineHeight: 1.55, color: '#6E80A4' }}>
                  We label the state instead of hiding it. A solution marked scoped is real work we
                  deliver — it simply is not a self-serve product today.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── The twelve ────────────────────────────────────────────────── */}
        <section className="ag-section" id="solutions" style={{ scrollMarginTop: 90 }} aria-labelledby="sol-title">
          <div className="ag-shell">
            <div className="ag-section-head">
              <div className="ag-section-lead">
                <p className="ag-eyebrow">What we do</p>
                <h2 id="sol-title" className="ag-h2">
                  Twelve solutions. One engineering standard.
                </h2>
              </div>
              <p className="ag-muted" style={{ maxWidth: '38ch', fontSize: '0.9rem', lineHeight: 1.62, margin: 0 }}>
                Every card opens a page that answers four questions in the same order: what it does, which
                business problem it solves, what you receive, and how we deliver it.
              </p>
            </div>

            <div style={{ display: 'grid', gap: 44 }}>
              {grouped.map(({ group, blurb, items }) => (
                <div key={group}>
                  <div className="ag-group-head">
                    <h3 className="ag-group-name" data-warm={group === 'Intelligence' ? 'true' : 'false'}>
                      {group}
                    </h3>
                    <p className="ag-group-blurb">{blurb}</p>
                  </div>

                  <div className="ag-sol-grid">
                    {items.map((sol) => {
                      const Icon = SOL_ICON[sol.slug] ?? Sparkles
                      return (
                        <Link key={sol.slug} href={`/site/solutions/${sol.slug}`} className="ag-sol-card">
                          <div className="ag-sol-head">
                            <span className="ag-sol-glyph" aria-hidden="true">
                              <Icon size={18} />
                            </span>
                            <span className={`ag-pill-state ag-pill-${sol.state === 'scoped' ? 'project' : sol.state}`}>
                              {SOLUTION_STATE_LABEL[sol.state]}
                            </span>
                          </div>
                          <h4 className="ag-sol-title">{sol.name}</h4>
                          <p className="ag-sol-line">{sol.tagline}</p>
                          <div className="ag-sol-tags">
                            {sol.tags.map((t) => (
                              <span key={t} className="ag-tag">
                                {t}
                              </span>
                            ))}
                          </div>
                          <span className="ag-sol-foot">
                            What it solves <ArrowRight size={14} aria-hidden="true" />
                          </span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="ag-shell">
          <hr className="ag-rule" />
        </div>

        {/* ── What every engagement answers ─────────────────────────────── */}
        <section className="ag-section" aria-labelledby="sol-how-title">
          <div className="ag-shell">
            <div className="ag-section-head">
              <div className="ag-section-lead">
                <p className="ag-eyebrow ag-eyebrow-cool">How we answer it</p>
                <h2 id="sol-how-title" className="ag-h2">
                  Four questions, answered before you commit.
                </h2>
              </div>
            </div>

            <div className="ag-qa">
              {[
                {
                  q: 'What it does',
                  a: 'A plain description of the capability — the work the system performs, not the technology it uses. If we cannot describe it in two sentences, it is not scoped yet.',
                  tone: 'cool' as const,
                },
                {
                  q: 'Which business problem it solves',
                  a: 'The cost you are paying today: hours, errors, missed follow-ups, decisions made without data. If we cannot name the problem, we do not have a proposal — we have a demo.',
                  tone: 'warm' as const,
                },
                {
                  q: 'What you receive',
                  a: 'Deliverables, not adjectives. Architecture documents, working software, tests, configuration in version control, documentation and a handover you can act on without us.',
                  tone: 'cool' as const,
                },
                {
                  q: 'How ALO Labs delivers it',
                  a: 'The actual sequence of work, including the review and verification steps. The same process for every engagement: discovery through support, documented at /site/how-we-work.',
                  tone: 'warm' as const,
                },
              ].map((item) => (
                <div key={item.q} className="ag-qa-block" data-tone={item.tone}>
                  <p className="ag-qa-q">{item.q}</p>
                  <p className="ag-qa-a">{item.a}</p>
                </div>
              ))}
            </div>

            <div className="ag-note" style={{ marginTop: 22 }}>
              <ShieldCheck size={17} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                <strong style={{ color: '#fff' }}>The fifth question is “what is real today?” </strong>
                Every solution page answers it with a delivery state and a written reason. Where an enabling
                component is missing — a telephony provider, a local inference runtime, container isolation —
                the page says so rather than implying the capability is finished.
              </span>
            </div>
          </div>
        </section>

        {/* ── Engage ────────────────────────────────────────────────────── */}
        <section className="ag-section" aria-labelledby="sol-engage-title">
          <div className="ag-shell">
            <div className="ag-section-head">
              <div className="ag-section-lead">
                <p className="ag-eyebrow">Ways in</p>
                <h2 id="sol-engage-title" className="ag-h2">
                  Three ways to start a conversation.
                </h2>
              </div>
            </div>

            <div className="ag-paths">
              {[
                {
                  href: '/site/start-a-project',
                  title: 'Start a project',
                  body: 'You know what you need built. Give us the problem, the constraints and the timing; we come back with a scope.',
                  meta: 'Best for new builds, platforms, integrations',
                },
                {
                  href: '/site/request-a-solution',
                  title: 'Request an AI solution',
                  body: 'You have a business problem and suspect AI is part of the answer. We will tell you where it fits — and where it does not.',
                  meta: 'Best for automation, agents, document work',
                },
                {
                  href: '/site/book-a-consultation',
                  title: 'Book a consultation',
                  body: 'A working session with an engineer, not a sales call. Bring the process; leave with an architecture opinion.',
                  meta: 'Best for a second opinion before you build',
                },
              ].map((p) => (
                <Link key={p.href} href={p.href} className="ag-path">
                  <h3 className="ag-path-title">{p.title}</h3>
                  <p className="ag-path-body">{p.body}</p>
                  <span className="ag-path-meta">{p.meta}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── Platform band ─────────────────────────────────────────────── */}
        <section className="ag-section" aria-labelledby="sol-platform-title">
          <div className="ag-shell">
            <div className="ag-glass" style={{ padding: 'clamp(24px, 3.4vw, 40px)' }}>
              <div className="ag-case-head">
                <div>
                  <p className="ag-eyebrow">
                    The platform behind it
                  </p>
                  <h2 id="sol-platform-title" className="ag-h2" style={{ fontSize: 'clamp(1.5rem, 2.8vw, 2.1rem)' }}>
                    Every solution runs on AgentOS.
                  </h2>
                  <p className="ag-lead" style={{ marginTop: 14, fontSize: '1rem' }}>
                    ALO Labs is not an agency assembling other people’s tools. Client systems are built on
                    AgentOS — our own AI agent operating system — which is why permissions, audit and
                    provider failover are engineered once and inherited by every engagement.
                  </p>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 }}>
                    <Link href="/site/platform-overview" className="ag-btn ag-btn-ghost">
                      Explore the platform <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                    <Link href="/site/projects" className="ag-btn ag-btn-ghost">
                      See the projects
                    </Link>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                  {[
                    { icon: Layers, label: 'Five layers, one inference gateway' },
                    { icon: BrainCircuit, label: 'Versioned, auditable agent registry' },
                    { icon: ShieldCheck, label: 'Tenant isolation enforced in the query' },
                    { icon: Boxes, label: 'Honest capability states, updated as work lands' },
                  ].map(({ icon: Icon, label }) => (
                    <span
                      key={label}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '11px 14px',
                        borderRadius: 11,
                        background: 'rgba(255,255,255,0.035)',
                        border: '1px solid rgba(160,195,255,0.12)',
                        fontSize: '0.86rem',
                        color: '#C3D0E8',
                      }}
                    >
                      <Icon size={16} aria-hidden="true" style={{ color: '#9DBBFF', flexShrink: 0 }} />
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ───────────────────────────────────────────────────────── */}
        <section className="ag-section">
          <div className="ag-shell">
            <div className="ag-cta">
              <h2 className="ag-h2" style={{ marginBottom: 14 }}>
                Which of these is your problem?
              </h2>
              <p className="ag-lead" style={{ margin: '0 auto 28px', maxWidth: '52ch' }}>
                You do not need to know which solution you want. Describe what is slow, expensive or
                unreliable, and we will tell you what we would build — including if the answer is nothing.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link href="/site/contact" className="ag-btn ag-btn-primary">
                  Talk to us <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link href="/site/services" className="ag-btn ag-btn-ghost">
                  See how it is delivered
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <DarkFooter />
    </DarkPageShell>
  )
}

export default SolutionsHubPage
