'use client'

/**
 * /site/platform-overview — the public AgentOS product page.
 *
 * Why a second platform page exists: the existing /site/platform is registered
 * in INTERNAL_PAGE_PREFIXES (src/lib/access/surfaces.ts), so a visitor who is
 * not signed in is redirected to /login. It is an internal engineering reference
 * — diagrams, agent specification sheets, deployment internals — and was
 * deliberately made private. That decision is not reversed here.
 *
 * This page is the public statement instead. It describes the platform from the
 * outside: what it does, what runs today, and what does not. Capability states
 * come from AGENTOS_CAPABILITIES, the same source the homepage badges use, and
 * they are rendered rather than softened.
 *
 * There are no product screenshots here. The platform is behind authentication,
 * and a mocked-up screenshot of a real product would be a fabricated claim. The
 * architecture is drawn from the same facts the code enforces.
 */

import Link from 'next/link'
import { ArrowRight, Check, Cpu, Database, Info, KeyRound, Network, ShieldCheck, Workflow } from 'lucide-react'

import { AGENTOS_CAPABILITIES, agentosStyle } from '@/lib/brand/agentos-3d'
import { Breadcrumbs, DarkFooter, DarkPageShell } from '@/components/agentos/dark-chrome'

const CAP_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  chat: Workflow,
  orchestration: Network,
  providers: Cpu,
  local: Database,
  voice: ShieldCheck,
  coding: KeyRound,
}

const LAYERS = [
  {
    tone: 'warm',
    label: 'Conversation',
    body: (
      <>
        <strong>One surface for every request.</strong> A conversation is persisted per user and per company,
        searchable, and replayed with its full history. Failures are recorded as failures rather than being
        silently dropped, so a conversation shows what actually happened.
      </>
    ),
  },
  {
    tone: 'warm',
    label: 'Orchestration',
    body: (
      <>
        <strong>A request becomes a plan.</strong> Work is decomposed into steps, each step is assigned to the
        agent that owns it, independent steps run in parallel, and every step reports its own status through to
        completion.
      </>
    ),
  },
  {
    tone: 'cool',
    label: 'Agents and permissions',
    body: (
      <>
        <strong>Scoped by construction.</strong> An agent declares its tools and limits up front. Privileged
        actions — deployment, migration, deletion, permission change — stop at an approval gate. Agents may
        propose changes to themselves; only an authorised administrator can approve them.
      </>
    ),
  },
  {
    tone: 'cool',
    label: 'Inference',
    body: (
      <>
        <strong>One gateway, bounded failover.</strong> Requests route through a single AI gateway with a
        four-attempt ceiling across the configured provider chain. The provider that actually answered is
        recorded on the response, so usage and billing always attribute to a real call.
      </>
    ),
  },
  {
    tone: 'cool',
    label: 'Data, audit and tenancy',
    body: (
      <>
        <strong>Isolation enforced where the data lives.</strong> Company scoping is applied in the query, not
        filtered in the interface, and usage is metered inside the same transaction as the model call. Admin
        actions are written to an audit trail.
      </>
    ),
  },
] as const

export function PlatformOverviewPage() {
  return (
    <DarkPageShell>

      <main id="main">
        <section className="ag-page-hero">
          <div className="ag-shell">
            <Breadcrumbs crumbs={[{ href: '/site/platform-overview', label: 'Platform' }]} />
            <p className="ag-eyebrow">The platform</p>
            <h1 className="ag-h1" style={{ fontSize: 'clamp(2.2rem, 4.6vw, 3.6rem)', maxWidth: '22ch' }}>
              AgentOS — the system the work runs on.
            </h1>
            <p className="ag-lead">
              ALO Labs builds client systems, and runs them on a platform of its own: one conversational surface,
              a governed agent registry, and an inference gateway with a real failover chain. This page describes
              what that platform does today and what it deliberately does not do yet.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 30 }}>
              <Link href="/site/contact" className="ag-btn ag-btn-primary">
                Build on the platform <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link href="/login" className="ag-btn ag-btn-ghost">
                Client login
              </Link>
            </div>
          </div>
        </section>

        {/* ── Capability states ───────────────────────────────────────────── */}
        <section className="ag-section" id="capabilities" style={{ scrollMarginTop: 90 }}>
          <div className="ag-shell">
            <div className="ag-section-head">
              <div>
                <p className="ag-eyebrow">Capabilities</p>
                <h2 className="ag-h2">What is running, what is partial, what is not built.</h2>
              </div>
              <p className="ag-muted" style={{ maxWidth: '34ch', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
                Stated plainly, because a capability list that only ever says “available” is not information.
              </p>
            </div>

            <div className="ag-cards">
              {AGENTOS_CAPABILITIES.map((cap) => {
                const Icon = CAP_ICON[cap.id] ?? Workflow
                return (
                  <div key={cap.id} className="ag-card">
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
          </div>
        </section>

        {/* ── Architecture ────────────────────────────────────────────────── */}
        <section className="ag-section" id="architecture" style={{ scrollMarginTop: 90 }}>
          <div className="ag-shell">
            <div className="ag-section-head">
              <div>
                <p className="ag-eyebrow">Architecture</p>
                <h2 className="ag-h2">Five layers, one gateway, no duplicated routing.</h2>
              </div>
            </div>

            <div className="ag-stack">
              {LAYERS.map((layer, i) => (
                <div className="ag-plane" data-tone={layer.tone} key={layer.label}>
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
          </div>
        </section>

        {/* ── Governance ──────────────────────────────────────────────────── */}
        <section className="ag-section">
          <div className="ag-shell">
            <div className="ag-split">
              <div>
                <p className="ag-eyebrow">Governance</p>
                <h2 className="ag-h2">The controls are the product.</h2>
                <p className="ag-lead">
                  An agent that can act is only useful if you can bound what it may do. The platform treats
                  permission, approval and audit as structural, not as configuration added later.
                </p>
              </div>
              <div className="ag-glass" style={{ padding: '24px 22px' }}>
                <ul className="ag-list">
                  {[
                    'Agents never approve their own changes',
                    'High-risk operations require explicit admin approval',
                    'Every administrative action is recorded',
                    'Usage is metered in the same transaction as the model call',
                    'Tenant scoping is enforced at the query layer',
                    'Hosted providers are never an unauthorised fallback',
                  ].map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ── Honest limitations ──────────────────────────────────────────── */}
        <section className="ag-section" aria-labelledby="plat-limits">
          <div className="ag-shell">
            <div className="ag-note ag-note-warm" style={{ marginBottom: 28 }}>
              <Info size={17} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                <strong style={{ color: '#fff' }}>What this page does not claim. </strong>
                There is no self-serve signup, and the platform is not sold as a standalone SaaS product. It runs
                ALO Labs systems and client builds. The public site shows no application screenshots because the
                application is behind authentication — a staged screenshot of a real product would be a
                fabricated claim.
              </span>
            </div>

            <h2 id="plat-limits" className="ag-h2" style={{ fontSize: 'clamp(1.4rem, 2.6vw, 2rem)', marginBottom: 18 }}>
              Known limitations
            </h2>
            <div className="ag-svc-grid ag-svc-grid-3">
              {[
                {
                  title: 'No local runtime here',
                  body: 'Provider routing and fallback rules are implemented. No local inference runtime is provisioned in this deployment, so local-first is labelled partial rather than live.',
                },
                {
                  title: 'Coding worker not enabled',
                  body: 'Automated repository work needs container isolation. It is not enabled, and is marked planned rather than offered as a capability.',
                },
                {
                  title: 'Telephony needs a provider',
                  body: 'The conversation layer is verified in tests. Placing real calls requires a configured PSTN/SIP provider; simulated calls are never described as real telephony.',
                },
              ].map((c) => (
                <div key={c.title} className="ag-svc-card" style={{ cursor: 'default' }}>
                  <h3 className="ag-svc-name" style={{ fontSize: '0.98rem' }}>
                    {c.title}
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.87rem', lineHeight: 1.6, color: '#A9B9D8' }}>{c.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="ag-section">
          <div className="ag-shell">
            <div className="ag-cta">
              <h2 className="ag-h2" style={{ marginBottom: 14 }}>
                Need something built on this?
              </h2>
              <p className="ag-lead" style={{ margin: '0 auto 28px', maxWidth: '52ch' }}>
                Most of our work is applying these foundations to a specific business problem. Tell us the problem
                and we will tell you whether the platform is the right answer.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link href="/site/contact" className="ag-btn ag-btn-primary">
                  Start your project <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link href="/site/services" className="ag-btn ag-btn-ghost">
                  See the services
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
