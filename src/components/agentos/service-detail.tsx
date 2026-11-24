'use client'

/**
 * /site/services/[slug] — one page per service line, rendered from data.
 *
 * Content (problem, deliverables, stack, outcomes, state) comes from
 * SERVICE_LINES so the index, the detail page, the sitemap, the JSON-LD and the
 * contact form's topic list can never disagree.
 */

import Link from 'next/link'
import { ArrowRight, Check, Info } from 'lucide-react'

import { agentosStyle } from '@/lib/brand/agentos-3d'
import { SERVICE_STATE_LABEL, SERVICE_LINES, type ServiceLine } from '@/lib/brand/service-lines'
import { Breadcrumbs, DarkFooter, DarkPageShell, EnquiryForm } from '@/components/agentos/dark-chrome'

export function ServiceDetailPage({ service }: { service: ServiceLine }) {
  const others = SERVICE_LINES.filter((s) => s.slug !== service.slug).slice(0, 3)

  return (
    <DarkPageShell>

      <main id="main">
        <section className="ag-page-hero">
          <div className="ag-shell">
            <Breadcrumbs
              crumbs={[
                { href: '/site/services', label: 'Services' },
                { href: `/site/services/${service.slug}`, label: service.name },
              ]}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
              <span className={`ag-pill-state ag-pill-${service.state}`}>{SERVICE_STATE_LABEL[service.state]}</span>
              <span style={{ fontSize: '0.78rem', color: '#8194B8', letterSpacing: '0.04em' }}>
                {service.category} · Service line
              </span>
            </div>

            <h1 className="ag-h1" style={{ fontSize: 'clamp(2.1rem, 4.4vw, 3.4rem)', maxWidth: '22ch' }}>
              {service.name}
            </h1>
            <p className="ag-lead" style={{ fontSize: 'clamp(1rem, 1.5vw, 1.2rem)', maxWidth: '56ch' }}>
              {service.tagline}
            </p>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 30 }}>
              <Link href="#enquire" className="ag-btn ag-btn-primary">
                Discuss this project <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link href="/site/services" className="ag-btn ag-btn-ghost">
                All services
              </Link>
            </div>
          </div>
        </section>

        <section className="ag-section" style={{ paddingTop: 20 }}>
          <div className="ag-shell">
            {/* Honest state note, always visible rather than buried in a footnote. */}
            <div className={`ag-note ag-reveal ${service.state === 'delivered' ? '' : 'ag-note-warm'}`} style={{ marginBottom: 40 }}>
              <Info size={17} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, opacity: 0.85 }} />
              <span>
                <strong style={{ color: '#fff' }}>{SERVICE_STATE_LABEL[service.state]} — </strong>
                {service.stateNote}
              </span>
            </div>

            <div className="ag-split" style={{ marginBottom: 52 }}>
              <div>
                <p className="ag-eyebrow">The problem</p>
                <h2 className="ag-h2" style={{ fontSize: 'clamp(1.4rem, 2.6vw, 2rem)', marginBottom: 16 }}>
                  Why this exists
                </h2>
                <p className="ag-lead" style={{ marginTop: 0 }}>
                  {service.problem}
                </p>

                <p className="ag-eyebrow" style={{ marginTop: 34 }}>
                  What we build
                </p>
                <p style={{ margin: 0, fontSize: '1rem', lineHeight: 1.7, color: '#B7C5E0' }}>{service.description}</p>
              </div>

              <div className="ag-glass" style={{ padding: '24px 22px' }}>
                <p className="ag-eyebrow" style={{ marginBottom: 14 }}>
                  What changes for you
                </p>
                <ul className="ag-list ag-list-cool">
                  {service.outcomes.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>

                <p className="ag-eyebrow" style={{ margin: '26px 0 12px' }}>
                  Technology
                </p>
                <div className="ag-chips-row">
                  {service.stack.map((tech) => (
                    <span key={tech} className="ag-chip-tech">
                      {tech}
                    </span>
                  ))}
                </div>
                <p className="ag-muted" style={{ margin: '18px 0 0', fontSize: '0.76rem', lineHeight: 1.55 }}>
                  Indicative rather than prescriptive — the stack is chosen against your constraints, not ours.
                </p>
              </div>
            </div>

            <div style={{ marginBottom: 56 }}>
              <p className="ag-eyebrow">Deliverables</p>
              <h2 className="ag-h2" style={{ fontSize: 'clamp(1.4rem, 2.6vw, 2rem)', marginBottom: 22 }}>
                Exactly what you receive
              </h2>
              <div className="ag-svc-grid ag-svc-grid-2">
                {service.deliverables.map((d, i) => (
                  <div
                    key={d}
                    style={{
                      display: 'flex',
                      gap: 13,
                      alignItems: 'flex-start',
                      padding: '16px 18px',
                      borderRadius: 13,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(160,195,255,0.13)',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'grid',
                        placeItems: 'center',
                        width: 22,
                        height: 22,
                        borderRadius: 7,
                        flexShrink: 0,
                        color: '#6EE7B7',
                        background: 'rgba(16,185,129,0.14)',
                        border: '1px solid rgba(16,185,129,0.32)',
                        fontSize: '0.66rem',
                        fontWeight: 800,
                      }}
                    >
                      <Check size={12} />
                    </span>
                    <span style={{ fontSize: '0.9rem', lineHeight: 1.55, color: '#C3D1EA' }}>
                      <span style={{ color: '#6E80A4', fontVariantNumeric: 'tabular-nums', marginRight: 6 }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      {d}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Enquiry ─────────────────────────────────────────────────── */}
            <div id="enquire" className="ag-split" style={{ scrollMarginTop: 90 }}>
              <div>
                <p className="ag-eyebrow">Next step</p>
                <h2 className="ag-h2" style={{ fontSize: 'clamp(1.5rem, 2.8vw, 2.1rem)', marginBottom: 14 }}>
                  Talk to us about {service.name.toLowerCase()}.
                </h2>
                <p className="ag-lead" style={{ marginTop: 0 }}>
                  Tell us the problem in your own words. We will tell you whether this is the right service, what a
                  realistic scope looks like, and what it would cost — before any commitment.
                </p>
                <ul className="ag-list" style={{ marginTop: 22 }}>
                  {[
                    'A reply within one business day',
                    'A technical response, not a brochure',
                    'Your details used only to answer this enquiry',
                  ].map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>

                <div style={{ marginTop: 30 }}>
                  <p className="ag-eyebrow" style={{ marginBottom: 12 }}>
                    Related services
                  </p>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {others.map((o) => (
                      <Link
                        key={o.slug}
                        href={`/site/services/${o.slug}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          padding: '11px 14px',
                          borderRadius: 10,
                          border: '1px solid rgba(160,195,255,0.13)',
                          background: 'rgba(255,255,255,0.03)',
                          color: '#C3D1EA',
                          textDecoration: 'none',
                          fontSize: '0.88rem',
                        }}
                      >
                        {o.name}
                        <ArrowRight size={14} aria-hidden="true" style={{ color: '#6E80A4', flexShrink: 0 }} />
                      </Link>
                    ))}
                  </div>
                </div>
              </div>

              <div className="ag-glass" style={{ padding: '26px 24px' }}>
                <h2 style={{ margin: '0 0 6px', fontSize: '1.1rem', fontWeight: 720, color: '#fff' }}>
                  Project enquiry
                </h2>
                <p style={{ margin: '0 0 20px', fontSize: '0.85rem', color: '#8194B8' }}>
                  No account needed. We reply by email unless you ask otherwise.
                </p>
                <EnquiryForm subject={`Service enquiry — ${service.name}`} defaultTopic={service.name} compact />
              </div>
            </div>
          </div>
        </section>
      </main>

      <DarkFooter />

      <style>{`
        @media (max-width: 760px) {
          .ag-svc-grid[style] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </DarkPageShell>
  )
}
