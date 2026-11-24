'use client'

/**
 * /site/solutions/[slug] — one page per business solution, rendered from data.
 *
 * The page answers the brief's five questions in order and then stops:
 *
 *   1. What it does
 *   2. Which business problem it solves
 *   3. What the customer receives
 *   4. How ALO Labs delivers it
 *   5. What is genuinely available today        ← rendered as a state, not a footnote
 *
 * It then hands off: related services for the engineering detail, related
 * solutions for adjacent needs, and an enquiry form wired to the real endpoint.
 * Nothing on this page is a promise the delivery process cannot keep.
 */

import Link from 'next/link'
import { ArrowRight, Check, Info, ShieldCheck } from 'lucide-react'

import { agentosStyle } from '@/lib/brand/agentos-3d'
import {
  BUSINESS_SOLUTIONS,
  SOLUTION_STATE_LABEL,
  SOLUTION_STATE_MEANING,
  type BusinessSolution,
} from '@/lib/brand/solutions'
import { SERVICE_LINES, SERVICE_STATE_LABEL, serviceBySlug } from '@/lib/brand/service-lines'
import { Breadcrumbs, DarkFooter, DarkPageShell, EnquiryForm } from '@/components/agentos/dark-chrome'

export function SolutionDetailPage({ solution }: { solution: BusinessSolution }) {
  const service = serviceBySlug(solution.service)
  const related = BUSINESS_SOLUTIONS.filter((s) => s.slug !== solution.slug && s.group === solution.group).slice(0, 3)
  const fallbackRelated = BUSINESS_SOLUTIONS.filter((s) => s.slug !== solution.slug).slice(0, 3)
  const alsoSee = related.length >= 2 ? related : fallbackRelated

  // Same-group first, then anywhere else — so the rail is never half-empty.
  const statePill = solution.state === 'scoped' ? 'project' : solution.state

  return (
    <DarkPageShell>
      <main id="main">
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="ag-page-hero">
          <div className="ag-shell">
            <Breadcrumbs
              crumbs={[
                { href: '/site/solutions', label: 'Solutions' },
                { href: `/site/solutions/${solution.slug}`, label: solution.name },
              ]}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
              <span className={`ag-pill-state ag-pill-${statePill}`}>{SOLUTION_STATE_LABEL[solution.state]}</span>
              <span style={{ fontSize: '0.78rem', color: '#8194B8', letterSpacing: '0.04em' }}>
                {solution.group} · Business solution
              </span>
            </div>

            <h1 className="ag-h1" style={{ fontSize: 'clamp(2.1rem, 4.4vw, 3.4rem)', maxWidth: '22ch' }}>
              {solution.name}
            </h1>
            <p className="ag-lead" style={{ fontSize: 'clamp(1rem, 1.5vw, 1.2rem)', maxWidth: '58ch' }}>
              {solution.tagline}
            </p>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 30 }}>
              <Link href="#enquire" className="ag-btn ag-btn-primary">
                Discuss this solution <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link href="/site/solutions" className="ag-btn ag-btn-ghost">
                All solutions
              </Link>
            </div>
          </div>
        </section>

        <section className="ag-section" style={{ paddingTop: 24 }}>
          <div className="ag-shell">
            {/* Honest state, always visible rather than buried in a footnote. */}
            <div className="ag-note" style={{ marginBottom: 40 }}>
              <ShieldCheck size={17} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, color: '#9DBBFF' }} />
              <span>
                <strong style={{ color: '#fff' }}>{SOLUTION_STATE_LABEL[solution.state]} — </strong>
                {SOLUTION_STATE_MEANING[solution.state]} {solution.availableToday}
              </span>
            </div>

            {/* ── The five questions ─────────────────────────────────────── */}
            <div className="ag-qa" style={{ marginBottom: 56 }}>
              <div className="ag-qa-block" data-tone="cool">
                <p className="ag-qa-q">01 · What it does</p>
                <p className="ag-qa-a">{solution.whatItDoes}</p>
              </div>

              <div className="ag-qa-block" data-tone="warm">
                <p className="ag-qa-q">02 · The business problem</p>
                <p className="ag-qa-a">{solution.businessProblem}</p>
              </div>
            </div>

            <div className="ag-case-head" style={{ marginBottom: 56 }}>
              <div>
                <p className="ag-eyebrow">03 · What you receive</p>
                <h2 className="ag-h2" style={{ fontSize: 'clamp(1.4rem, 2.6vw, 2rem)', marginBottom: 18 }}>
                  Deliverables, not adjectives.
                </h2>
                <ul className="ag-list ag-list-cool">
                  {solution.youReceive.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="ag-glass" style={{ padding: '24px 22px' }}>
                <p className="ag-eyebrow" style={{ marginBottom: 16 }}>
                  04 · How we deliver it
                </p>
                <div className="ag-steps">
                  {solution.howWeDeliver.map((step, i) => (
                    <div className="ag-step" key={step}>
                      <span className="ag-step-n">{String(i + 1).padStart(2, '0')}</span>
                      <p className="ag-step-body">{step}</p>
                    </div>
                  ))}
                </div>
                <Link
                  href="/site/how-we-work"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    marginTop: 18,
                    fontSize: '0.82rem',
                    color: '#9DBBFF',
                    textDecoration: 'none',
                  }}
                >
                  The full delivery process <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </div>

            {/* ── 05 · Available today ───────────────────────────────────── */}
            <div className="ag-split" style={{ marginBottom: 56 }}>
              <div>
                <p className="ag-eyebrow">05 · What is real today</p>
                <h2 className="ag-h2" style={{ fontSize: 'clamp(1.4rem, 2.6vw, 2rem)', marginBottom: 16 }}>
                  {SOLUTION_STATE_LABEL[solution.state]}.
                </h2>
                <p className="ag-lead" style={{ marginTop: 0 }}>
                  {solution.availableToday}
                </p>
                <p style={{ margin: '18px 0 0', fontSize: '0.9rem', lineHeight: 1.68, color: '#93A2C2' }}>
                  Delivery state labels are shared across this site — the same vocabulary the platform page and
                  the service pages use. If a solution is marked scoped, it is real work we deliver through a
                  project; it simply is not a self-serve product today.
                </p>
              </div>

              <div className="ag-glass" style={{ padding: '24px 22px' }}>
                <p className="ag-eyebrow" style={{ marginBottom: 14 }}>
                  Delivered through this service line
                </p>
                {service ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                      <span className={`ag-pill-state ag-pill-${service.state}`}>
                        {SERVICE_STATE_LABEL[service.state]}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#6E80A4' }}>{service.category}</span>
                    </div>
                    <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 700, color: '#fff' }}>{service.name}</h3>
                    <p style={{ margin: '0 0 16px', fontSize: '0.86rem', lineHeight: 1.6, color: '#A9B9D8' }}>
                      {service.tagline}
                    </p>
                    <div className="ag-chips-row" style={{ marginBottom: 18 }}>
                      {service.stack.slice(0, 5).map((tech) => (
                        <span key={tech} className="ag-chip-tech">
                          {tech}
                        </span>
                      ))}
                    </div>
                    <Link
                      href={`/site/services/${service.slug}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 7,
                        fontSize: '0.84rem',
                        fontWeight: 640,
                        color: '#9DBBFF',
                        textDecoration: 'none',
                      }}
                    >
                      The engineering detail <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  </>
                ) : (
                  <p style={{ margin: 0, fontSize: '0.88rem', color: '#A9B9D8' }}>
                    This solution is delivered as a scoped engagement; see the service lines for the detail.
                  </p>
                )}

                <p
                  style={{
                    margin: '20px 0 0',
                    paddingTop: 16,
                    borderTop: '1px solid rgba(160,195,255,0.1)',
                    fontSize: '0.76rem',
                    lineHeight: 1.58,
                    color: '#6E80A4',
                  }}
                >
                  Technology listed is indicative rather than prescriptive — the stack is chosen against your
                  constraints, not ours.
                </p>
              </div>
            </div>

            {/* ── Related ────────────────────────────────────────────────── */}
            <div style={{ marginBottom: 56 }}>
              <p className="ag-eyebrow">Usually bought alongside</p>
              <div className="ag-svc-grid">
                {alsoSee.map((s) => (
                  <Link key={s.slug} href={`/site/solutions/${s.slug}`} className="ag-svc-card">
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                      <span className={`ag-pill-state ag-pill-${s.state === 'scoped' ? 'project' : s.state}`}>
                        {SOLUTION_STATE_LABEL[s.state]}
                      </span>
                    </div>
                    <h3 className="ag-svc-name">{s.name}</h3>
                    <p className="ag-svc-tagline">{s.tagline}</p>
                    <span className="ag-svc-foot">
                      View solution <ArrowRight size={14} aria-hidden="true" />
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            {/* ── Enquiry ────────────────────────────────────────────────── */}
            <div id="enquire" style={{ scrollMarginTop: 90 }} className="ag-split">
              <div>
                <p className="ag-eyebrow">Start a conversation</p>
                <h2 className="ag-h2" style={{ fontSize: 'clamp(1.5rem, 2.8vw, 2.1rem)', marginBottom: 16 }}>
                  Tell us what you are trying to {solution.group === 'Growth' ? 'reach' : 'build'}.
                </h2>
                <p className="ag-lead" style={{ marginTop: 0 }}>
                  A few sentences about the problem is enough. We reply within one business day with a technical
                  opinion, a question, or an honest “this is not what we do”.
                </p>
                <ul className="ag-list" style={{ marginTop: 24 }}>
                  {[
                    'Your details are used only to answer this enquiry',
                    'No account needed, and no sales sequence',
                    'Sensitive material goes through a secure channel after the first conversation',
                  ].map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                <p style={{ margin: '22px 0 0', fontSize: '0.8rem', lineHeight: 1.6, color: '#6E80A4' }}>
                  Need a different route?{' '}
                  <Link href="/site/start-a-project" style={{ color: '#9DBBFF' }}>
                    Start a project
                  </Link>{' '}
                  ·{' '}
                  <Link href="/site/book-a-consultation" style={{ color: '#9DBBFF' }}>
                    Book a consultation
                  </Link>
                </p>
              </div>

              <div className="ag-glass" style={{ padding: '26px 24px' }}>
                <h3 style={{ margin: '0 0 6px', fontSize: '1.05rem', fontWeight: 720, color: '#fff' }}>
                  Request this solution
                </h3>
                <p style={{ margin: '0 0 20px', fontSize: '0.82rem', color: '#8194B8' }}>
                  Fields marked * are required.
                </p>
                <EnquiryForm subject={`Solution enquiry — ${solution.name}`} defaultTopic={solution.name} />
              </div>
            </div>

            <div className="ag-note" style={{ marginTop: 34 }}>
              <Info size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: '0.82rem' }}>
                {SERVICE_LINES.length} service lines, {BUSINESS_SOLUTIONS.length} business solutions — the same
                engineering, described two ways. Nothing here is claimed as ready unless it is.
              </span>
            </div>
          </div>
        </section>
      </main>

      <DarkFooter />
      <span className="ag-sr">
        <Check aria-hidden="true" />
      </span>
    </DarkPageShell>
  )
}

export default SolutionDetailPage
