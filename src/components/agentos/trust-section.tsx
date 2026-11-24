'use client'

/**
 * "Engineering You Can Trust" — the trust section required by the brief.
 *
 * The hard constraint was *verified information only*. Every assurance below is
 * something this repository can be inspected for, and each one names what it
 * rests on in `basis`. Nothing here is a certification, an audit badge or a
 * compliance logo, because we hold none of those and printing one would be
 * fraud rather than marketing.
 *
 * The action verb is deliberate throughout: "isolated", "requires", "recorded",
 * "tested". A trust section made of adjectives ("enterprise-grade", "bank-level
 * security") tells a reader nothing they can check.
 */

import Link from 'next/link'
import {
  ArrowRight,
  ClipboardCheck,
  FileCode2,
  GitBranch,
  KeyRound,
  ScrollText,
  ServerCog,
  ShieldCheck,
  TestTube2,
  Users,
} from 'lucide-react'

import { SITE_DARK } from '@/lib/brand/agentos-3d'

export interface Assurance {
  icon: React.ComponentType<{ size?: number }>
  title: string
  body: string
  /** What the claim rests on — the part that makes it checkable. */
  basis: string
}

export const ASSURANCES: Assurance[] = [
  {
    icon: Users,
    title: 'Secure project isolation',
    body: 'Client data is scoped to the client’s account at the query layer, not filtered in the interface. Two clients sharing a system never share a row.',
    basis: 'Company scoping applied in queries; cross-tenant access returns 404 and writes a security event.',
  },
  {
    icon: KeyRound,
    title: 'Controlled agent permissions',
    body: 'An agent declares its tools and limits before it runs. Consequential actions stop at an approval gate, and agents cannot approve their own changes.',
    basis: 'Agent registry with versioned definitions; approval required for privileged operations.',
  },
  {
    icon: ScrollText,
    title: 'Auditable administrative actions',
    body: 'Privileged changes are written to an audit trail with who, what and when — so “who changed this?” has an answer months later.',
    basis: 'Audit records on administrative operations; high-risk actions gated on explicit approval.',
  },
  {
    icon: TestTube2,
    title: 'Automated testing',
    body: 'Work is not called done because it renders. Deployment is gated on the automated suite, so a regression stops the release rather than the customer.',
    basis: 'Typecheck, lint, the full test suite and a production build run in CI before release.',
  },
  {
    icon: GitBranch,
    title: 'Versioned development',
    body: 'Every change is a reviewable commit against a branch, with the reasoning attached. Nothing is edited live on a server.',
    basis: 'Git history, reviewable diffs and CI checks per change; deployments built from a commit.',
  },
  {
    icon: ClipboardCheck,
    title: 'Transparent capability status',
    body: 'Capabilities carry Live, Partial or Planned — and the page says what is missing. A client can plan around a gap because the gap is written down.',
    basis: 'State labels rendered from the same data the sitemap and structured data use.',
  },
  {
    icon: ServerCog,
    title: 'Secure deployment practices',
    body: 'Secrets stay out of the repository, sessions are bounded, and access to internal surfaces is denied by default rather than allowed by exception.',
    basis: 'Deny-by-default route groups; secret scanning in CI; rate limits on public endpoints.',
  },
  {
    icon: FileCode2,
    title: 'Tested restore, not assumed backup',
    body: 'A backup is only a backup once it has been restored. The restore is performed and documented, not inferred from a green backup job.',
    basis: 'Documented restore procedure exercised against a clean database.',
  },
]

/** The eight stages the brief specifies, in order. */
export const DELIVERY_STAGES = [
  { n: '01', label: 'Discovery' },
  { n: '02', label: 'Planning' },
  { n: '03', label: 'Architecture' },
  { n: '04', label: 'Development' },
  { n: '05', label: 'Testing' },
  { n: '06', label: 'Review' },
  { n: '07', label: 'Deployment' },
  { n: '08', label: 'Support' },
] as const

/**
 * The trust band.
 *
 * `compact` renders the four strongest assurances in one row, for pages where
 * the full section would be a second page's worth of content; the full section
 * (used on the homepage and the process page) shows all eight with their basis.
 */
export function TrustSection({
  compact = false,
  headingLevel = 'h2',
}: {
  compact?: boolean
  headingLevel?: 'h2' | 'h3'
}) {
  const Heading = headingLevel
  const items = compact ? ASSURANCES.slice(0, 4) : ASSURANCES

  return (
    <section className="ag-section" id="trust" style={{ scrollMarginTop: 90 }} aria-labelledby="trust-title">
      <div className="ag-shell">
        <div className="ag-section-head">
          <div className="ag-section-lead">
            <p className="ag-eyebrow">Trust</p>
            <Heading id="trust-title" className="ag-h2">
              Engineering you can trust.
            </Heading>
            <p className="ag-lead">
              Trust is not a badge on a website; it is a set of controls a reader can inspect. Each claim below
              names the mechanism behind it — and where we hold no certification, we have not printed one.
            </p>
          </div>
          <Link href="/site/how-we-work" className="ag-btn ag-btn-ghost" style={{ flexShrink: 0 }}>
            The full delivery process <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>

        <div className="ag-assure-grid">
          {items.map(({ icon: Icon, title, body }) => (
            <div key={title} className="ag-assure">
              <div className="ag-assure-icon">
                <Icon size={18} />
              </div>
              <h4 className="ag-assure-title">{title}</h4>
              <p className="ag-assure-body">{body}</p>
            </div>
          ))}
        </div>

        {!compact ? (
          <div style={{ marginTop: 30 }}>
            <p className="ag-eyebrow ag-eyebrow-cool" style={{ marginBottom: 16 }}>
              What each assurance rests on
            </p>
            <ul className="ag-evidence">
              {ASSURANCES.map(({ title, basis }) => (
                <li key={title}>
                  <ShieldCheck size={15} aria-hidden="true" style={{ color: SITE_DARK.live, marginTop: 2, flexShrink: 0 }} />
                  <span>
                    <strong>{title}</strong>
                    <span>{basis}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* ── Delivery workflow ──────────────────────────────────────────── */}
        <div style={{ marginTop: 40 }}>
          <div className="ag-group-head">
            <h4 className="ag-group-name" data-warm="true">
              How work actually runs
            </h4>
            <p className="ag-group-blurb">Eight stages, every engagement, in this order.</p>
          </div>
          <div className="ag-flow">
            {DELIVERY_STAGES.map((stage) => (
              <div className="ag-flow-step" key={stage.n}>
                <span className="ag-flow-n">{stage.n}</span>
                <span className="ag-flow-label">{stage.label}</span>
              </div>
            ))}
          </div>
          <p className="ag-muted" style={{ margin: '14px 0 0', fontSize: '0.8rem', lineHeight: 1.6 }}>
            Scope and price are agreed before development starts. Testing and review are stages with their own
            exit criteria, not a step squeezed in before launch.
          </p>
        </div>
      </div>
    </section>
  )
}

export default TrustSection
