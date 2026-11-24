'use client'

/**
 * /site/contact — the conversion page.
 *
 * The form is a thin client over POST /api/public/contact, which already does
 * validation, honeypot detection, per-IP rate limiting and CRM persistence.
 * Nothing about success is faked: the message shown is the server's, including
 * the case where the lead was recorded but the notification email failed.
 */

import Link from 'next/link'
import { ArrowRight, Clock, Mail, ShieldCheck } from 'lucide-react'

import { PUBLIC_COMPANY, agentosStyle } from '@/lib/brand/agentos-3d'
import { EnquiryForm, Breadcrumbs, DarkFooter, DarkPageShell } from '@/components/agentos/dark-chrome'

const PATHS = [
  {
    title: 'A defined project',
    body: 'You know what you need built and want a scope, a timeline and a price.',
    meta: 'Best for: new builds, platforms, integrations',
  },
  {
    title: 'An extension of your team',
    body: 'You need engineering capacity on an ongoing basis rather than a one-off deliverable.',
    meta: 'Best for: retained delivery, ongoing automation',
  },
  {
    title: 'Not sure yet',
    body: 'You have a problem and suspect software or AI is part of the answer. That is enough to start.',
    meta: 'Best for: an honest first conversation',
  },
]

export function ContactDarkPage() {
  return (
    <DarkPageShell>

      <main id="main">
        <section className="ag-page-hero">
          <div className="ag-shell">
            <Breadcrumbs crumbs={[{ href: '/site/contact', label: 'Contact' }]} />
            <div className="ag-split">
              <div>
                <p className="ag-eyebrow">Start a project</p>
                <h1 className="ag-h1" style={{ fontSize: 'clamp(2.1rem, 4.4vw, 3.3rem)', maxWidth: '18ch' }}>
                  Tell us what you are <span className="ag-h1-warm">trying to build</span>.
                </h1>
                <p className="ag-lead">
                  A few sentences about the problem is enough. We reply within one business day with a real
                  response — a technical opinion, a question, or an honest “this is not what we do”.
                </p>

                <div style={{ display: 'grid', gap: 12, marginTop: 30 }}>
                  {[
                    { icon: Clock, label: 'Reply within one business day' },
                    { icon: Mail, label: PUBLIC_COMPANY.email },
                    { icon: ShieldCheck, label: 'Your details are used only to answer this enquiry' },
                  ].map(({ icon: Icon, label }) => (
                    <span
                      key={label}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: '0.9rem', color: '#B7C5E0' }}
                    >
                      <Icon size={16} aria-hidden="true" style={{ color: '#9DBBFF', flexShrink: 0 }} />
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="ag-glass" style={{ padding: '26px 24px' }}>
                <h2 style={{ margin: '0 0 6px', fontSize: '1.1rem', fontWeight: 720, color: '#fff' }}>
                  Project enquiry
                </h2>
                <p style={{ margin: '0 0 20px', fontSize: '0.84rem', color: '#8194B8' }}>
                  Fields marked * are required. No account needed.
                </p>
                <EnquiryForm subject="Website enquiry" />
              </div>
            </div>
          </div>
        </section>

        <section className="ag-section" aria-labelledby="contact-paths">
          <div className="ag-shell">
            <p className="ag-eyebrow">Where this usually starts</p>
            <h2 id="contact-paths" className="ag-h2" style={{ fontSize: 'clamp(1.4rem, 2.6vw, 2rem)', marginBottom: 22 }}>
              Three ways people come to us
            </h2>
            <div className="ag-svc-grid">
              {PATHS.map((p) => (
                <div key={p.title} className="ag-svc-card" style={{ cursor: 'default' }}>
                  <h3 className="ag-svc-name" style={{ fontSize: '1rem' }}>
                    {p.title}
                  </h3>
                  <p className="ag-svc-tagline">{p.body}</p>
                  <span style={{ fontSize: '0.78rem', color: '#6E80A4', paddingTop: 12, borderTop: '1px solid rgba(160,195,255,0.10)' }}>
                    {p.meta}
                  </span>
                </div>
              ))}
            </div>

            <div className="ag-note" style={{ marginTop: 26 }}>
              <ShieldCheck size={17} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                Please do not send passwords, API keys, private keys or client data in this form. It is not an
                encrypted channel. For anything sensitive we will arrange a secure handover after the first
                conversation.
              </span>
            </div>
          </div>
        </section>

        <section className="ag-section">
          <div className="ag-shell">
            <div className="ag-cta">
              <h2 className="ag-h2" style={{ marginBottom: 14 }}>
                Looking for the services instead?
              </h2>
              <p className="ag-lead" style={{ margin: '0 auto 28px', maxWidth: '50ch' }}>
                Each of the twelve service lines has its own page with deliverables, technology and an honest
                delivery state.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link href="/site/services" className="ag-btn ag-btn-primary">
                  Browse services <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link href="/site/platform-overview" className="ag-btn ag-btn-ghost">
                  About the platform
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
