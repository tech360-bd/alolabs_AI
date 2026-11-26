'use client'

/**
 * /site/services/[slug] — one page per service line.
 *
 * ── Why this page is long ───────────────────────────────────────────────────
 * The pages we are measured against give a buyer enough to decide on one page:
 * what it is, who it is for, what the work looks like week by week, what it
 * costs, and the answers to the objections that stop people enquiring. A short
 * page forces a sales call just to get the basics, and most people leave
 * instead.
 *
 * ── What it deliberately does NOT say ───────────────────────────────────────
 * Nothing about how ALO Labs staffs, sources, assembles or supplies the work,
 * and no internal agent count. `SERVICE_DEPTH` has no field for those, so they
 * cannot appear here by accident. Every section describes what the CLIENT
 * receives and how the engagement runs.
 */

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Check, Clock, Info, Minus, Plus } from 'lucide-react'
import { useState } from 'react'

import { SERVICE_STATE_LABEL, SERVICE_LINES, type EnrichedServiceLine } from '@/lib/brand/service-lines'
import { Breadcrumbs, DarkFooter, DarkPageShell, EnquiryForm } from '@/components/agentos/dark-chrome'

/** The service's own two-colour accent, used for rules, pills and numerals. */
function accent(service: EnrichedServiceLine) {
  return service.visual?.gradient[0] ?? '#FC5400'
}

export function ServiceDetailPage({ service }: { service: EnrichedServiceLine }) {
  const others = SERVICE_LINES.filter((s) => s.slug !== service.slug).slice(0, 3)
  const line = accent(service)
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  return (
    <DarkPageShell>
      <main id="main">
        {/* ── Hero: artwork is the first thing a reader sees ─────────────── */}
        <section className="ag-page-hero" style={{ paddingBottom: 0 }}>
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
            <p className="ag-lead" style={{ fontSize: 'clamp(1rem, 1.5vw, 1.2rem)', maxWidth: '58ch' }}>
              {service.tagline}
            </p>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 30, marginBottom: 42 }}>
              <Link href="#enquire" className="ag-btn ag-btn-primary">
                Discuss this project <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link href="#process" className="ag-btn ag-btn-ghost">
                See how it runs
              </Link>
            </div>

            {/* The generated artwork. `priority` because it is above the fold —
                a lazy hero is a blank hero on a slow connection. */}
            <figure className="svc-art">
              <Image
                src={`/services/${service.slug}.webp`}
                alt={service.visual?.alt ?? `${service.name} visual`}
                width={1600}
                height={900}
                priority
                sizes="(max-width: 900px) 100vw, 1240px"
              />
              <figcaption>
                <span style={{ color: line, fontWeight: 700 }}>{service.category}</span>
                <span> · {service.name}</span>
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="ag-section" style={{ paddingTop: 44 }}>
          <div className="ag-shell">
            {/* Honest state note, always visible rather than buried in a footnote. */}
            <div
              className={`ag-note ag-reveal ${service.state === 'delivered' ? '' : 'ag-note-warm'}`}
              style={{ marginBottom: 44 }}
            >
              <Info size={17} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, opacity: 0.85 }} />
              <span>
                <strong style={{ color: '#fff' }}>{SERVICE_STATE_LABEL[service.state]} — </strong>
                {service.stateNote}
              </span>
            </div>

            {/* ── Problem / what we build ─────────────────────────────────── */}
            <div className="ag-split" style={{ marginBottom: 58 }}>
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

            {/* ── Who it is for ──────────────────────────────────────────── */}
            {service.audience && (
              <div style={{ marginBottom: 58 }}>
                <p className="ag-eyebrow">Fit</p>
                <h2 className="ag-h2" style={{ fontSize: 'clamp(1.4rem, 2.6vw, 2rem)', marginBottom: 22 }}>
                  Who this is for — and who it is not.
                </h2>
                <div className="svc-fit">
                  <div className="svc-fit-col svc-fit-yes">
                    <p className="svc-fit-head">
                      <Check size={15} aria-hidden="true" /> A good fit if
                    </p>
                    <ul>
                      {service.audience.fit.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="svc-fit-col svc-fit-no">
                    <p className="svc-fit-head">
                      <Minus size={15} aria-hidden="true" /> Not the right service if
                    </p>
                    <ul>
                      {service.audience.notFit.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* ── Process ────────────────────────────────────────────────── */}
            {service.process && (
              <div id="process" style={{ marginBottom: 58, scrollMarginTop: 90 }}>
                <p className="ag-eyebrow">How it runs</p>
                <h2 className="ag-h2" style={{ fontSize: 'clamp(1.4rem, 2.6vw, 2rem)', marginBottom: 8 }}>
                  From first conversation to handover.
                </h2>
                <p className="ag-lead" style={{ marginTop: 0, marginBottom: 26 }}>
                  The sequence below is how the engagement actually runs, with a realistic duration for each stage. It is
                  a sequence, not a promise of a date — scope decides the calendar.
                </p>
                <ol className="svc-timeline" style={{ ['--svc-accent' as string]: line }}>
                  {service.process.map((step, i) => (
                    <li key={step.title}>
                      <span className="svc-step-num">{String(i + 1).padStart(2, '0')}</span>
                      <div>
                        <h3 className="svc-step-title">
                          {step.title}
                          <span className="svc-step-dur">
                            <Clock size={12} aria-hidden="true" /> {step.duration}
                          </span>
                        </h3>
                        <p className="svc-step-detail">{step.detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* ── Deliverables ───────────────────────────────────────────── */}
            <div style={{ marginBottom: 58 }}>
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

            {/* ── Commercial shape ───────────────────────────────────────── */}
            {service.engagement && (
              <div style={{ marginBottom: 58 }}>
                <p className="ag-eyebrow">Commercial</p>
                <h2 className="ag-h2" style={{ fontSize: 'clamp(1.4rem, 2.6vw, 2rem)', marginBottom: 22 }}>
                  How it is priced
                </h2>
                <div className="svc-price-grid">
                  {[
                    ['Starting point', service.engagement.startingPoint],
                    ['Typical range', service.engagement.typicalRange],
                    ['Commercial model', service.engagement.commercialModel],
                  ].map(([label, value]) => (
                    <div key={label} className="svc-price-card" style={{ borderTopColor: line }}>
                      <p className="ag-eyebrow" style={{ marginBottom: 8 }}>
                        {label}
                      </p>
                      <p style={{ margin: 0, fontSize: '0.94rem', lineHeight: 1.6, color: '#C3D1EA' }}>{value}</p>
                    </div>
                  ))}
                </div>
                <p className="ag-muted" style={{ margin: '14px 0 0', fontSize: '0.78rem', lineHeight: 1.55 }}>
                  A range is not a quote. The number is fixed after scope is agreed, and it does not move while we build.
                </p>
              </div>
            )}

            {/* ── FAQ ────────────────────────────────────────────────────── */}
            {service.faq && (
              <div style={{ marginBottom: 58 }}>
                <p className="ag-eyebrow">Questions</p>
                <h2 className="ag-h2" style={{ fontSize: 'clamp(1.4rem, 2.6vw, 2rem)', marginBottom: 22 }}>
                  What buyers ask before committing.
                </h2>
                <div className="svc-faq">
                  {service.faq.map((item, i) => {
                    const open = openFaq === i
                    return (
                      <div key={item.q} className={`svc-faq-item ${open ? 'is-open' : ''}`}>
                        <button
                          type="button"
                          onClick={() => setOpenFaq(open ? null : i)}
                          aria-expanded={open}
                          className="svc-faq-q"
                        >
                          <span>{item.q}</span>
                          {open ? <Minus size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
                        </button>
                        {open && <div className="svc-faq-a">{item.a}</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

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
        .svc-art {
          margin: 0 0 0;
          border-radius: 20px;
          overflow: hidden;
          border: 1px solid rgba(160,195,255,0.18);
          box-shadow: 0 30px 80px -30px rgba(0,0,0,0.9);
          background: #050B16;
          line-height: 0;
        }
        .svc-art img { width: 100%; height: auto; display: block; }
        .svc-art figcaption {
          line-height: 1.4;
          padding: 12px 18px;
          font-size: 0.76rem;
          color: #8194B8;
          border-top: 1px solid rgba(160,195,255,0.12);
          background: rgba(255,255,255,0.02);
        }

        .svc-fit { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .svc-fit-col {
          padding: 20px 20px 18px; border-radius: 15px;
          background: rgba(255,255,255,0.035);
          border: 1px solid rgba(160,195,255,0.13);
        }
        .svc-fit-yes { border-color: rgba(16,185,129,0.28); }
        .svc-fit-no  { border-color: rgba(148,163,184,0.22); }
        .svc-fit-head {
          display: flex; align-items: center; gap: 8px;
          margin: 0 0 14px; font-size: 0.78rem; font-weight: 700;
          letter-spacing: 0.06em; text-transform: uppercase;
        }
        .svc-fit-yes .svc-fit-head { color: #6EE7B7; }
        .svc-fit-no  .svc-fit-head { color: #94A3B8; }
        .svc-fit-col ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 11px; }
        .svc-fit-col li {
          position: relative; padding-left: 18px;
          font-size: 0.9rem; line-height: 1.6; color: #C3D1EA;
        }
        .svc-fit-col li::before {
          content: ''; position: absolute; left: 0; top: 0.6em;
          width: 6px; height: 6px; border-radius: 50%;
        }
        .svc-fit-yes li::before { background: #10B981; }
        .svc-fit-no  li::before { background: #64748B; }

        .svc-timeline { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; }
        .svc-timeline li {
          display: grid; grid-template-columns: 62px 1fr; gap: 20px;
          padding: 22px 0; position: relative;
          border-top: 1px solid rgba(160,195,255,0.12);
        }
        .svc-timeline li::before {
          content: ''; position: absolute; left: 25px; top: 0;
          width: 2px; height: 100%;
          background: linear-gradient(180deg, var(--svc-accent, #FC5400), transparent);
          opacity: 0.35;
        }
        .svc-step-num {
          position: relative; z-index: 1;
          display: grid; place-items: center;
          width: 52px; height: 52px; border-radius: 14px;
          font-size: 0.86rem; font-weight: 800; font-variant-numeric: tabular-nums;
          color: #fff; background: rgba(255,255,255,0.06);
          border: 1px solid var(--svc-accent, #FC5400);
          box-shadow: 0 0 24px -8px var(--svc-accent, #FC5400);
        }
        .svc-step-title {
          margin: 0 0 6px; font-size: 1.05rem; font-weight: 700; color: #fff;
          display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
        }
        .svc-step-dur {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 0.72rem; font-weight: 600; letter-spacing: 0.04em;
          color: #8194B8; padding: 3px 9px; border-radius: 999px;
          border: 1px solid rgba(160,195,255,0.16); background: rgba(255,255,255,0.03);
        }
        .svc-step-detail { margin: 0; font-size: 0.92rem; line-height: 1.65; color: #A9B8D4; }

        .svc-price-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .svc-price-card {
          padding: 20px 20px 18px; border-radius: 15px;
          background: rgba(255,255,255,0.035);
          border: 1px solid rgba(160,195,255,0.13);
          border-top-width: 3px; border-top-style: solid;
        }

        .svc-faq { display: grid; gap: 10px; }
        .svc-faq-item {
          border-radius: 13px; overflow: hidden;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(160,195,255,0.13);
        }
        .svc-faq-item.is-open { border-color: rgba(160,195,255,0.26); background: rgba(255,255,255,0.05); }
        .svc-faq-q {
          width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 16px;
          padding: 17px 20px; background: none; border: 0; cursor: pointer;
          font-size: 0.95rem; font-weight: 650; color: #E6EDF8; text-align: left;
          font-family: inherit;
        }
        .svc-faq-q:hover { color: #fff; }
        .svc-faq-a {
          padding: 0 20px 19px; font-size: 0.92rem; line-height: 1.7; color: #A9B8D4;
          max-width: 78ch;
        }

        @media (max-width: 900px) {
          .svc-fit, .svc-price-grid { grid-template-columns: 1fr; }
          .svc-timeline li { grid-template-columns: 52px 1fr; gap: 14px; }
          .svc-step-num { width: 44px; height: 44px; font-size: 0.78rem; }
          .svc-timeline li::before { left: 21px; }
        }
        @media (max-width: 760px) {
          .ag-svc-grid[style] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </DarkPageShell>
  )
}
