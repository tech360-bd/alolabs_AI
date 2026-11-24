'use client'

/**
 * /site/services — the index of the twelve service lines.
 *
 * Replaces the previous "how we deliver" page at this path, whose content moves
 * unchanged to /site/how-we-work (it was always delivery-process material, not a
 * service list). The navigation label "Services" now points at services.
 *
 * Every card carries its delivery state so a reader cannot mistake "project
 * scope" for "finished product".
 */

import Link from 'next/link'
import { ArrowRight, Sparkles, Check } from 'lucide-react'

import { agentosStyle } from '@/lib/brand/agentos-3d'
import {
  SERVICE_GROUP_BLURB,
  SERVICE_GROUPS,
  SERVICE_LINES,
  SERVICE_STATE_LABEL,
  type ServiceState,
} from '@/lib/brand/service-lines'
import { Breadcrumbs, DarkFooter, DarkPageShell } from '@/components/agentos/dark-chrome'

const STATE_EXPLAINER: Record<ServiceState, string> = {
  delivered: 'Running today — our own product, or shipped client work.',
  available: 'Sold and staffed now, scoped and agreed per engagement.',
  project: 'Delivered through a scoped project only; nothing self-serve.',
}

export function ServicesIndexPage() {
  return (
    <DarkPageShell>

      <main id="main">
        <section className="ag-page-hero">
          <div className="ag-shell">
            <Breadcrumbs crumbs={[{ href: '/site/services', label: 'Services' }]} />
            <p className="ag-eyebrow">Services</p>
            <h1 className="ag-h1" style={{ fontSize: 'clamp(2.2rem, 4.6vw, 3.6rem)', maxWidth: '20ch' }}>
              Twelve ways we <span className="ag-h1-grad">build</span> and{' '}
              <span className="ag-h1-warm">automate</span>.
            </h1>
            <p className="ag-lead">
              Software engineering, applied AI and the operational work around them. Each service page states the
              problem it solves, exactly what you receive, the technology involved and the honest delivery state.
            </p>

            <div className="ag-chips ag-chips-3" style={{ maxWidth: 620, marginTop: 28 }}>
              {(['delivered', 'available', 'project'] as ServiceState[]).map((s) => (
                <div className="ag-chip" key={s} style={{ display: 'block' }}>
                  <span className={`ag-pill-state ag-pill-${s}`}>{SERVICE_STATE_LABEL[s]}</span>
                  <p style={{ margin: '9px 0 0', fontSize: '0.76rem', lineHeight: 1.45, color: '#8194B8' }}>
                    {STATE_EXPLAINER[s]}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {SERVICE_GROUPS.map((group) => {
          const lines = SERVICE_LINES.filter((s) => s.category === group)
          return (
            <section key={group} className="ag-section" style={{ paddingTop: 12 }} aria-labelledby={`svc-${group}`}>
              <div className="ag-shell">
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
                  <h2
                    id={`svc-${group}`}
                    className="ag-h2"
                    style={{ fontSize: 'clamp(1.4rem, 2.4vw, 1.9rem)' }}
                  >
                    {group}
                  </h2>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#8194B8' }}>{SERVICE_GROUP_BLURB[group]}</p>
                </div>

                <div className="ag-svc-grid">
                  {lines.map((line) => (
                    <Link key={line.slug} href={`/site/services/${line.slug}`} className="ag-svc-card">
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          marginBottom: 13,
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            display: 'grid',
                            placeItems: 'center',
                            width: 34,
                            height: 34,
                            borderRadius: 10,
                            color: '#fff',
                            background:
                              group === 'Intelligence'
                                ? 'linear-gradient(150deg, rgba(252,84,0,.95), rgba(214,63,0,.95))'
                                : 'linear-gradient(150deg, rgba(44,107,232,.95), rgba(0,24,108,.95))',
                            boxShadow: '0 1px 0 rgba(255,255,255,.35) inset, 0 8px 18px -10px rgba(0,0,0,.9)',
                          }}
                        >
                          <Sparkles size={16} />
                        </span>
                        <span className={`ag-pill-state ag-pill-${line.state}`}>
                          {SERVICE_STATE_LABEL[line.state]}
                        </span>
                      </div>
                      <h3 className="ag-svc-name">{line.name}</h3>
                      <p className="ag-svc-tagline">{line.tagline}</p>
                      <span className="ag-svc-foot">
                        Details & deliverables <ArrowRight size={14} aria-hidden="true" />
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )
        })}

        {/* ── Wider context ───────────────────────────────────────────────── */}
        <section className="ag-section" aria-labelledby="svc-ctx">
          <div className="ag-shell">
            <div className="ag-split">
              <div>
                <p className="ag-eyebrow">Before you engage us</p>
                <h2 id="svc-ctx" className="ag-h2">
                  What working with ALO Labs actually looks like.
                </h2>
                <p className="ag-lead">
                  A written scope before code, a named point of contact, and deliverables you can inspect. Where
                  something is not feasible in the budget or timeline, we say so in the scope conversation rather
                  than after the invoice.
                </p>
                <ul className="ag-list" style={{ marginTop: 22 }}>
                  {[
                    'Scope, deliverables and commercial terms agreed in writing before work starts',
                    'Progress visible through the client portal, with milestone review',
                    'Automated tests and verification before anything is handed over',
                    'Documentation and handover so you are never locked in',
                  ].map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>

              <div className="ag-glass" style={{ padding: '26px 24px' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
                  Not sure which line fits?
                </h3>
                <p style={{ margin: '0 0 20px', fontSize: '0.9rem', lineHeight: 1.6, color: '#A9B9D8' }}>
                  Describe the problem rather than the solution. We will tell you which of the twelve applies — or
                  that none does.
                </p>
                <ul className="ag-list ag-list-cool" style={{ marginBottom: 24 }}>
                  {['Reply within one business day', 'No obligation and no sales sequence', 'Technical answers, not brochures'].map(
                    (x) => (
                      <li key={x}>{x}</li>
                    ),
                  )}
                </ul>
                <Link href="/site/contact" className="ag-btn ag-btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                  Start a conversation <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <p style={{ margin: '14px 0 0', fontSize: '0.78rem', color: '#6E80A4', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Check size={13} aria-hidden="true" /> We reply to every enquiry.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

        <DarkFooter />
    </DarkPageShell>
  )
}
