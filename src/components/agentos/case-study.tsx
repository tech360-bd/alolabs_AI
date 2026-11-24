'use client'

/**
 * /site/projects/[slug] — one case study, in full.
 *
 * Structure follows the brief exactly: overview, business problem, solution
 * architecture, actual implementation, surfaces, verified capabilities,
 * technology, and a demo or inquiry link. Two blocks are added on purpose:
 *
 *   • "Not yet" — what the project explicitly does not do. A case study without
 *     this is marketing, and a reader has no way to test the rest of the claims.
 *   • "How to see it" — the route a visitor can actually reach for each surface,
 *     since the authenticated product cannot be screenshotted honestly.
 */

import Link from 'next/link'
import { ArrowRight, CheckCircle2, Info, Layers3, ShieldCheck, TriangleAlert } from 'lucide-react'

import { PROJECT_STATE_LABEL, SHOWCASE_PROJECTS, type ShowcaseProject } from '@/lib/brand/projects'
import { SITE_DARK } from '@/lib/brand/agentos-3d'
import { Breadcrumbs, DarkFooter, DarkPageShell, EnquiryForm } from '@/components/agentos/dark-chrome'

export function CaseStudyPage({ project }: { project: ShowcaseProject }) {
  const others = SHOWCASE_PROJECTS.filter((p) => p.slug !== project.slug)
  const stateCls = project.state === 'live' ? 'delivered' : project.state === 'partial' ? 'available' : 'project'

  return (
    <DarkPageShell>
      <main id="main">
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="ag-page-hero">
          <div className="ag-shell">
            <Breadcrumbs
              crumbs={[
                { href: '/site/projects', label: 'Projects' },
                { href: `/site/projects/${project.slug}`, label: project.name },
              ]}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
              <span className={`ag-pill-state ag-pill-${stateCls}`}>{PROJECT_STATE_LABEL[project.state]}</span>
              <span style={{ fontSize: '0.78rem', color: '#8194B8', letterSpacing: '0.04em' }}>{project.kind}</span>
            </div>

            <h1 className="ag-h1" style={{ fontSize: 'clamp(2.1rem, 4.4vw, 3.3rem)', maxWidth: '22ch' }}>
              {project.name}
            </h1>
            <p className="ag-lead" style={{ fontSize: 'clamp(1rem, 1.5vw, 1.18rem)', maxWidth: '60ch' }}>
              {project.summary}
            </p>

            <div className="ag-chips-row" style={{ marginTop: 24 }}>
              {project.stack.map((t) => (
                <span key={t} className="ag-chip-tech">
                  {t}
                </span>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 28 }}>
              {project.links.map((l) =>
                l.external ? (
                  <a key={l.href} href={l.href} className="ag-btn ag-btn-ghost" target="_blank" rel="noopener noreferrer">
                    {l.label} <ArrowRight size={15} aria-hidden="true" />
                  </a>
                ) : (
                  <Link key={l.href} href={l.href} className={l.href === '/site/contact' ? 'ag-btn ag-btn-primary' : 'ag-btn ag-btn-ghost'}>
                    {l.label} <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                ),
              )}
            </div>
          </div>
        </section>

        <section className="ag-section" style={{ paddingTop: 20 }}>
          <div className="ag-shell">
            {/* ── Problem + architecture ──────────────────────────────────── */}
            <div className="ag-qa" style={{ marginBottom: 44 }}>
              <div className="ag-qa-block" data-tone="warm">
                <p className="ag-qa-q">The business problem</p>
                <p className="ag-qa-a">{project.problem}</p>
              </div>
              <div className="ag-qa-block">
                <p className="ag-qa-q">Solution architecture</p>
                <ul className="ag-list ag-list-cool" style={{ fontSize: '0.9rem' }}>
                  {project.architecture.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* ── Implementation ──────────────────────────────────────────── */}
            <div className="ag-case-head" style={{ marginBottom: 44 }}>
              <div>
                <p className="ag-eyebrow">Actual implementation</p>
                <h2 className="ag-h2" style={{ fontSize: 'clamp(1.4rem, 2.6vw, 2rem)', marginBottom: 18 }}>
                  What was built, in countable terms.
                </h2>
                <ul className="ag-list">
                  {project.implementation.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>

              <div className="ag-glass" style={{ padding: '24px 22px' }}>
                <p className="ag-eyebrow" style={{ marginBottom: 16 }}>
                  Where you can see it
                </p>
                <ul className="ag-channels">
                  {project.surfaces.map((s) => (
                    <li key={s.label} className="ag-channel" style={{ gridTemplateColumns: '34px minmax(0,1fr)' }}>
                      <span className="ag-channel-icon" aria-hidden="true">
                        <Layers3 size={15} />
                      </span>
                      <span>
                        <span className="ag-channel-label">{s.label}</span>
                        <span className="ag-channel-value">{s.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p style={{ margin: '16px 0 0', paddingTop: 14, borderTop: '1px solid rgba(160,195,255,0.1)', fontSize: '0.75rem', lineHeight: 1.55, color: '#6E80A4' }}>
                  Authenticated surfaces are shown by route rather than screenshot. A staged image of a real
                  product would be a fabricated claim.
                </p>
              </div>
            </div>

            {/* ── Verified + limits ───────────────────────────────────────── */}
            <div className="ag-split" style={{ marginBottom: 48 }}>
              <div>
                <p className="ag-eyebrow">Verified capabilities</p>
                <h2 className="ag-h2" style={{ fontSize: 'clamp(1.3rem, 2.4vw, 1.8rem)', marginBottom: 18 }}>
                  Each claim, with what it rests on.
                </h2>
                <ul className="ag-evidence">
                  {project.verified.map((v) => (
                    <li key={v.claim}>
                      <CheckCircle2 size={16} aria-hidden="true" style={{ color: SITE_DARK.live, marginTop: 1 }} />
                      <span>
                        <strong>{v.claim}</strong>
                        <span>{v.basis}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="ag-eyebrow ag-eyebrow-quiet">Not yet</p>
                <h2 className="ag-h2" style={{ fontSize: 'clamp(1.3rem, 2.4vw, 1.8rem)', marginBottom: 18 }}>
                  What this project does not do.
                </h2>
                <ul className="ag-limits">
                  {project.notYet.map((n) => (
                    <li key={n}>
                      <TriangleAlert size={15} aria-hidden="true" style={{ marginTop: 1, flexShrink: 0 }} />
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
                <div className="ag-note" style={{ marginTop: 18 }}>
                  <Info size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: '0.8rem' }}>
                    Publishing this block is a deliberate choice. A showcase that only lists strengths gives a
                    reader nothing to test.
                  </span>
                </div>
              </div>
            </div>

            {/* ── Enquire ────────────────────────────────────────────────── */}
            <div id="enquire" style={{ scrollMarginTop: 90 }} className="ag-split">
              <div>
                <p className="ag-eyebrow">Next step</p>
                <h2 className="ag-h2" style={{ fontSize: 'clamp(1.5rem, 2.8vw, 2.1rem)', marginBottom: 16 }}>
                  Build something like this.
                </h2>
                <p className="ag-lead" style={{ marginTop: 0 }}>
                  Describe the problem and we will tell you which parts of this project apply, which do not, and
                  what we would change for your constraints.
                </p>
                <ul className="ag-list" style={{ marginTop: 22 }}>
                  {[
                    'Reply within one business day',
                    'A technical opinion first, not a proposal',
                    'Nothing sensitive in this form — we arrange a secure channel after the first call',
                  ].map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>

              <div className="ag-glass" style={{ padding: '26px 24px' }}>
                <h3 style={{ margin: '0 0 6px', fontSize: '1.05rem', fontWeight: 720, color: '#fff' }}>
                  Enquire about this work
                </h3>
                <p style={{ margin: '0 0 20px', fontSize: '0.82rem', color: '#8194B8' }}>
                  Fields marked * are required.
                </p>
                <EnquiryForm subject={`Project enquiry — ${project.name}`} defaultTopic="AI Software Development" />
              </div>
            </div>

            {/* ── Other projects ─────────────────────────────────────────── */}
            <div style={{ marginTop: 56 }}>
              <p className="ag-eyebrow">Other work</p>
              <div className="ag-svc-grid">
                {others.map((p) => (
                  <Link key={p.slug} href={`/site/projects/${p.slug}`} className="ag-svc-card">
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                      <span className={`ag-pill-state ag-pill-${p.state === 'live' ? 'delivered' : p.state === 'partial' ? 'available' : 'project'}`}>
                        {PROJECT_STATE_LABEL[p.state]}
                      </span>
                    </div>
                    <h3 className="ag-svc-name">{p.name}</h3>
                    <p className="ag-svc-tagline">{p.summary.slice(0, 130)}…</p>
                    <span className="ag-svc-foot">
                      Read the case study <ArrowRight size={14} aria-hidden="true" />
                    </span>
                  </Link>
                ))}
                <div className="ag-svc-card" style={{ cursor: 'default' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                    <span className="ag-pill-state ag-pill-project">Permission required</span>
                  </div>
                  <h3 className="ag-svc-name">Client engagements</h3>
                  <p className="ag-svc-tagline">
                    Most of our work belongs to clients, and is published only with their written approval.
                  </p>
                  <Link href="/site/contact" className="ag-svc-foot" style={{ textDecoration: 'none' }}>
                    Ask about relevant experience <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>

            <div className="ag-note" style={{ marginTop: 32 }}>
              <ShieldCheck size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: '0.82rem' }}>
                {PROJECT_STATE_LABEL[project.state]} — {project.state === 'live'
                  ? 'running in production today.'
                  : project.state === 'partial'
                    ? 'partly running; the missing component is named above.'
                    : 'not enabled yet, and not offered as a capability.'}
              </span>
            </div>
          </div>
        </section>
      </main>

      <DarkFooter />
    </DarkPageShell>
  )
}

export default CaseStudyPage
