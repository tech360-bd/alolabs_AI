'use client'

/**
 * /site/projects — the premium, verified showcase.
 *
 * Every project on this page is something a visitor can point at in this
 * repository or this deployment. There are no client logos, no testimonials and
 * no outcome metrics, because none exist in a publishable form — and the page
 * says so out loud instead of leaving a suspicious gap.
 *
 * The honest-labelling block at the bottom is not a disclaimer bolted on at the
 * end; it is the point of the page. A company that will show you the projects it
 * is *not* ready to present is a company whose other claims are worth reading.
 */

import Link from 'next/link'
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Layers3,
  Lock,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'

import { agentosStyle } from '@/lib/brand/agentos-3d'
import {
  PROJECT_STATE_LABEL,
  SHOWCASE_PROJECTS,
  UNPUBLISHED_CANDIDATES,
  type ShowcaseProject,
} from '@/lib/brand/projects'
import { Breadcrumbs, DarkFooter, DarkPageShell } from '@/components/agentos/dark-chrome'

/**
 * A schematic of the product surface, drawn from the real structure (rails,
 * panels, state lines) rather than a photograph of someone else's dashboard.
 * Captioned as a schematic so it is never mistaken for a screenshot.
 */
function SurfaceSchematic({ project }: { project: ShowcaseProject }) {
  const primary = project.surfaces[0]
  return (
    <div>
      <div className="ag-schematic">
        <div className="ag-schematic-bar">
          <span className="ag-schematic-dot" />
          <span className="ag-schematic-dot" />
          <span className="ag-schematic-dot" />
          <span className="ag-schematic-title">{primary?.detail.split(' — ')[0] ?? project.slug}</span>
        </div>
        <div className="ag-schematic-body">
          <div className="ag-schematic-rail" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className="ag-schematic-chip" data-active={i === 0 ? 'true' : 'false'} />
            ))}
          </div>
          <div className="ag-schematic-main" aria-hidden="true">
            <span className="ag-schematic-line" data-w="86" />
            <span className="ag-schematic-line" data-w="72" data-blue="true" />
            <span className="ag-schematic-line" data-w="54" />
            <span className="ag-schematic-line" data-w="86" />
            <span className="ag-schematic-line" data-w="72" />
            <span className="ag-schematic-line" data-w="54" data-blue="true" />
          </div>
        </div>
      </div>
      <span className="ag-schematic-caption">
        Structural schematic, not a screenshot. The live surface is behind authentication, and a staged
        screenshot of a real product would be a fabricated claim.
      </span>
    </div>
  )
}

function StatePill({ state }: { state: ShowcaseProject['state'] }) {
  const cls = state === 'live' ? 'delivered' : state === 'partial' ? 'available' : 'project'
  return <span className={`ag-pill-state ag-pill-${cls}`}>{PROJECT_STATE_LABEL[state]}</span>
}

export function ProjectsShowcasePage() {
  return (
    <DarkPageShell>
      <main id="main">
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="ag-page-hero">
          <div className="ag-shell">
            <Breadcrumbs crumbs={[{ href: '/site/projects', label: 'Projects' }]} />

            <div className="ag-case-head">
              <div>
                <p className="ag-eyebrow">Work</p>
                <h1 className="ag-h1" style={{ fontSize: 'clamp(2.2rem, 4.6vw, 3.6rem)', maxWidth: '20ch' }}>
                  Work you can <span className="ag-h1-grad">verify</span>, not just{' '}
                  <span className="ag-h1-warm">admire</span>.
                </h1>
                <p className="ag-lead">
                  Three things ALO Labs has actually shipped, described with their architecture, their real
                  limits and the evidence behind each claim. No borrowed logos, no invented clients, no
                  performance numbers we cannot attribute.
                </p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 30 }}>
                  <Link href="/site/contact" className="ag-btn ag-btn-primary">
                    Discuss a build like these <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                  <Link href="/site/solutions" className="ag-btn ag-btn-ghost">
                    The solutions behind them
                  </Link>
                </div>
              </div>

              <div className="ag-glass" style={{ padding: '22px 20px' }}>
                <p className="ag-eyebrow" style={{ marginBottom: 14 }}>
                  What this page will not do
                </p>
                <ul className="ag-list ag-list-cool" style={{ fontSize: '0.86rem' }}>
                  <li>Publish a client name without written permission</li>
                  <li>Show a testimonial nobody gave</li>
                  <li>Quote a metric we cannot measure</li>
                  <li>Present a partial capability as a finished product</li>
                </ul>
                <p style={{ margin: '16px 0 0', paddingTop: 14, borderTop: '1px solid rgba(160,195,255,0.1)', fontSize: '0.76rem', lineHeight: 1.55, color: '#6E80A4' }}>
                  Where a project is incomplete, the block labelled “Not yet” says so on the card. That block is
                  the reason the rest of the page can be trusted.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── The showcase ──────────────────────────────────────────────── */}
        <section className="ag-section" aria-labelledby="showcase-title">
          <div className="ag-shell">
            <div className="ag-section-head">
              <div className="ag-section-lead">
                <p className="ag-eyebrow">Showcase</p>
                <h2 id="showcase-title" className="ag-h2">
                  Three builds, each auditable.
                </h2>
              </div>
              <p className="ag-muted" style={{ maxWidth: '36ch', fontSize: '0.9rem', lineHeight: 1.62, margin: 0 }}>
                Every project below runs something real — the platform, the client portal, this website. Each
                links onward to the detail page where the architecture and the evidence live.
              </p>
            </div>

            <div style={{ display: 'grid', gap: 26 }}>
              {SHOWCASE_PROJECTS.map((project, index) => (
                <article
                  key={project.slug}
                  className="ag-glass"
                  style={{ padding: 'clamp(22px, 3vw, 36px)' }}
                  aria-labelledby={`proj-${project.slug}`}
                >
                  <div className="ag-case-head">
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.68rem', letterSpacing: '0.14em', color: '#6E80A4' }}>
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <StatePill state={project.state} />
                        <span style={{ fontSize: '0.76rem', color: '#8194B8' }}>{project.kind}</span>
                      </div>

                      <h3
                        id={`proj-${project.slug}`}
                        className="ag-h2"
                        style={{ fontSize: 'clamp(1.4rem, 2.6vw, 1.95rem)', marginBottom: 12 }}
                      >
                        {project.name}
                      </h3>
                      <p style={{ margin: '0 0 18px', fontSize: '0.98rem', lineHeight: 1.68, color: '#B7C5E0' }}>
                        {project.summary}
                      </p>

                      <div className="ag-sol-tags" style={{ marginBottom: 20 }}>
                        {project.stack.slice(0, 6).map((t) => (
                          <span key={t} className="ag-tag">
                            {t}
                          </span>
                        ))}
                      </div>

                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <Link href={`/site/projects/${project.slug}`} className="ag-btn ag-btn-primary" style={{ padding: '11px 20px' }}>
                          Read the case study <ArrowRight size={15} aria-hidden="true" />
                        </Link>
                      </div>
                    </div>

                    <SurfaceSchematic project={project} />
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
                      gap: 20,
                      marginTop: 26,
                      paddingTop: 24,
                      borderTop: '1px solid rgba(160,195,255,0.1)',
                    }}
                  >
                    <div>
                      <p className="ag-eyebrow" style={{ marginBottom: 12 }}>
                        Verified
                      </p>
                      <ul className="ag-evidence">
                        {project.verified.slice(0, 2).map((v) => (
                          <li key={v.claim}>
                            <CheckCircle2 size={16} aria-hidden="true" style={{ color: '#6EE7B7', marginTop: 1 }} />
                            <span>
                              <strong>{v.claim}</strong>
                              <span>{v.basis}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <p className="ag-eyebrow ag-eyebrow-quiet" style={{ marginBottom: 12 }}>
                        Not yet
                      </p>
                      <ul className="ag-limits">
                        {project.notYet.slice(0, 2).map((n) => (
                          <li key={n}>
                            <TriangleAlert size={15} aria-hidden="true" style={{ marginTop: 1, flexShrink: 0 }} />
                            <span>{n}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Honest audit table ────────────────────────────────────────── */}
        <section className="ag-section" aria-labelledby="audit-title">
          <div className="ag-shell">
            <div className="ag-section-lead" style={{ marginBottom: 26 }}>
              <p className="ag-eyebrow">The audit</p>
              <h2 id="audit-title" className="ag-h2">
                What we looked at, and what we will not show.
              </h2>
              <p className="ag-lead">
                The brief asked us to evaluate every ALO Labs and TECH360 project as a potential case study. Some
                did not pass. Listing them with the reason is more useful to a buyer than a logo wall — and it is
                the only honest way to publish a showcase.
              </p>
            </div>

            <div className="ag-table-wrap">
              <table className="ag-audit-table">
                <caption className="ag-sr">
                  Projects considered for the showcase that are not published, with the reason for each
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Project</th>
                    <th scope="col">Status</th>
                    <th scope="col">Why it is not shown as a case study</th>
                  </tr>
                </thead>
                <tbody>
                  {UNPUBLISHED_CANDIDATES.map((c) => (
                    <tr key={c.name}>
                      <td>{c.name}</td>
                      <td>
                        <span className="ag-pill-state ag-pill-project" style={{ whiteSpace: 'nowrap' }}>
                          {c.status}
                        </span>
                      </td>
                      <td>{c.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ag-note" style={{ marginTop: 22 }}>
              <Lock size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                Client work stays private by default. Where a client has granted written permission, we will walk
                you through relevant experience and references during a conversation — just not on this page.
              </span>
            </div>
          </div>
        </section>

        {/* ── CTA ───────────────────────────────────────────────────────── */}
        <section className="ag-section">
          <div className="ag-shell">
            <div className="ag-cta">
              <h2 className="ag-h2" style={{ marginBottom: 14 }}>
                Want to see how yours would work?
              </h2>
              <p className="ag-lead" style={{ margin: '0 auto 28px', maxWidth: '50ch' }}>
                Bring the problem and the constraints. We will sketch the architecture, name the risks and tell
                you what we would not build.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link href="/site/start-a-project" className="ag-btn ag-btn-primary">
                  Start a project <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link href="/site/book-a-consultation" className="ag-btn ag-btn-ghost">
                  Book a consultation
                </Link>
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 26,
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                  marginTop: 34,
                  paddingTop: 24,
                  borderTop: '1px solid rgba(160,195,255,0.12)',
                }}
              >
                {[
                  { icon: ShieldCheck, label: 'Secure project isolation' },
                  { icon: Layers3, label: 'Versioned development' },
                  { icon: ExternalLink, label: 'Transparent capability status' },
                ].map(({ icon: Icon, label }) => (
                  <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#9DBBFF' }}>
                    <Icon size={15} aria-hidden="true" /> {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <DarkFooter />
      <span className="ag-sr" style={agentosStyle}>
        Projects
      </span>
    </DarkPageShell>
  )
}

export default ProjectsShowcasePage
