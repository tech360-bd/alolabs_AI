'use client'

/**
 * /site/about — the company page, on the dark AgentOS design system.
 *
 * WHY THIS REPLACED THE LIGHT PAGE
 * --------------------------------
 * The public site had drifted into two visual identities. The homepage, the
 * solutions hub, the case studies, the services index, the platform overview and
 * every conversion route are dark (`.ag-*`, #00186C navy, AgentOS wordmark). The
 * About, How-we-work and Careers pages were still the old light system (slate
 * canvas, #00309C blue, "AI & SOFTWARE" wordmark, a completely different nav).
 *
 * A visitor clicking "About" from the dark header landed on what looked like a
 * different company's website — different logo lockup, different palette,
 * different navigation. That is the single most expensive remaining defect on a
 * site whose whole argument is "we are a real, credible engineering firm".
 *
 * The content below is migrated, not rewritten: every claim from the previous
 * page is preserved verbatim where it was already accurate. Nothing was invented
 * to fill the new layout.
 *
 * HONESTY NOTE ON THE ADDRESS
 * ---------------------------
 * The brief flagged "Harrisonville, Missouri" vs "Built in Bangladesh" as a
 * possible inconsistency. They are not necessarily in conflict — a company can
 * be registered in one jurisdiction and develop in another — so this page states
 * both facts plainly as they appear in the source material, and the legal
 * question is flagged for the owner rather than silently resolved here.
 */

import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight,
  Check,
  Compass,
  FileCheck2,
  Globe,
  Handshake,
  HeartHandshake,
  Laptop,
  LifeBuoy,
  Lightbulb,
  MapPin,
  PenTool,
  Rocket,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react'

import { Breadcrumbs, DarkFooter, DarkPageShell } from '@/components/agentos/dark-chrome'
import { TrustSection } from '@/components/agentos/trust-section'
import { COMPANY, HEADLINE_STATS, USAGE_RULES } from '@/lib/brand/public'

const PHILOSOPHY = [
  {
    icon: Search,
    title: 'Understand before building',
    body: 'Every engagement starts with the business, its people and its constraints. Technology choices follow understanding — never the other way around.',
  },
  {
    icon: Scale,
    title: 'Automation with accountability',
    body: 'Every piece of work has a written scope and a review step. If we cannot say what will be delivered and how it is checked, it does not ship.',
  },
  {
    icon: Lightbulb,
    title: 'Intelligence where it earns its place',
    body: 'AI is measured, never bolted on. If a workflow is better as plain, reliable software, we build plain, reliable software.',
  },
  {
    icon: Users,
    title: 'Built with the operators',
    body: 'The people who will use the result help shape it. Adoption is a delivery metric, not an afterthought.',
  },
  {
    icon: Zap,
    title: 'Ship, then evolve',
    body: 'First value delivered early, then compound: we extend system by system on a shared roadmap instead of boiling the ocean.',
  },
  {
    icon: Compass,
    title: 'Long-horizon engineering',
    body: 'Architecture, data and infrastructure designed to hold up over years — with backups, monitoring and recovery designed in from day one.',
  },
]

const RESPONSIBLE_AI = [
  'AI assists people; it does not replace judgement where judgement matters.',
  'Automated actions are scoped, logged and reversible — sensitive steps require human approval.',
  'Client data is tenant-isolated and never used to train shared models.',
  'We are honest about what AI can and cannot do — no inflated capability claims.',
  'Outputs that matter are reviewed before they reach customers, regulators or auditors.',
]

const QUALITY_SECURITY = [
  {
    title: 'Quality is a release criterion',
    body: 'Automated tests, code review and verification are part of every delivery — not a phase squeezed in at the end. Deliverables are reviewed before handover and documented so they can be operated without us.',
  },
  {
    title: 'Security is a design constraint',
    body: 'Access control, tenant isolation, session security and auditability are designed in from the first architecture decision. Security is never a feature ticket bolted on after launch.',
  },
  {
    title: 'Privacy by default',
    body: 'Client data stays private to the client account, is used only to deliver their work, and is never exposed to other clients or published without permission.',
  },
  {
    title: 'Operated responsibly',
    body: 'Backups, monitoring, disaster recovery and dependency hygiene are part of how we run what we build — for our own platform and for client systems.',
  },
]

const PRINCIPLES = [
  'The people who own the outcome stay in command — automation answers to them.',
  'Specified work beats improvised work.',
  'Every capability ships with its audit trail.',
  'We build what we would want to operate ourselves.',
]

export function AboutDarkPage() {
  return (
    <DarkPageShell>
      <main id="main">
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="ag-page-hero">
          <div className="ag-shell">
            <Breadcrumbs crumbs={[{ href: '/site/about', label: 'About' }]} />

            <div className="ag-case-head">
              <div>
                <p className="ag-eyebrow">About ALO Labs</p>
                <h1 className="ag-h1" style={{ fontSize: 'clamp(2.2rem, 4.8vw, 3.7rem)', maxWidth: '20ch' }}>
                  A global AI &amp; software <span className="ag-h1-warm">technology company</span>.
                </h1>
                <p className="ag-lead">
                  ALO Labs designs and builds software, AI-powered solutions and connected digital platforms
                  for businesses that take technology seriously. We work with clients wherever they operate.
                  Secure. Smart. Scalable. Built for the future.
                </p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 30 }}>
                  <Link href="/site/start-a-project" className="ag-btn ag-btn-primary">
                    Start a project <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                  <Link href="/site/careers" className="ag-btn ag-btn-ghost">
                    Join us
                  </Link>
                </div>
              </div>

              <div className="ag-glass" style={{ padding: '22px 20px' }}>
                <p className="ag-eyebrow" style={{ marginBottom: 14 }}>
                  At a glance
                </p>
                <div style={{ display: 'grid', gap: 12 }}>
                  {HEADLINE_STATS.map((stat) => (
                    <div key={stat.label} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
                      <span style={{ fontSize: '0.82rem', color: '#A9B9D8' }}>{stat.label}</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 750, color: '#EAF0FF' }}>{stat.value}</span>
                    </div>
                  ))}
                </div>
                <p
                  style={{
                    margin: '16px 0 0',
                    paddingTop: 14,
                    borderTop: '1px solid rgba(160,195,255,0.14)',
                    fontSize: '0.74rem',
                    lineHeight: 1.6,
                    color: '#7E90A4',
                  }}
                >
                  Stated as they appear on our letterhead and platform — no invented founding dates,
                  headcounts or client numbers.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Vision & mission ──────────────────────────────────────────── */}
        <section className="ag-section" aria-labelledby="ag-vm">
          <div className="ag-shell">
            <div className="ag-section-head ag-reveal">
              <div className="ag-section-lead">
                <p className="ag-eyebrow">Vision &amp; mission</p>
                <h2 id="ag-vm" className="ag-h2">
                  Why we exist.
                </h2>
              </div>
            </div>
            <div className="ag-assure-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
              <div className="ag-assure">
                <div className="ag-assure-icon">
                  <Sparkles size={18} />
                </div>
                <h3 className="ag-assure-title">Vision</h3>
                <p className="ag-assure-body">
                  A world where businesses of any size can use intelligent technology with confidence —
                  systems that are engineered properly, behave predictably and stay accountable to the
                  people who depend on them.
                </p>
              </div>
              <div className="ag-assure">
                <div className="ag-assure-icon">
                  <Handshake size={18} />
                </div>
                <h3 className="ag-assure-title">Mission</h3>
                <p className="ag-assure-body">
                  To design, build and evolve software, AI solutions and digital platforms that solve real
                  business problems — delivered with engineering discipline, honest communication and a
                  partnership mindset that lasts beyond launch.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Engineering philosophy ────────────────────────────────────── */}
        <section className="ag-section" aria-labelledby="ag-phil">
          <div className="ag-shell">
            <div className="ag-section-head ag-reveal">
              <div className="ag-section-lead">
                <p className="ag-eyebrow">Engineering philosophy</p>
                <h2 id="ag-phil" className="ag-h2">
                  Six rules we do not bend.
                </h2>
                <p className="ag-lead">
                  The principles behind every architecture decision, every review and every delivery.
                </p>
              </div>
            </div>
            <div className="ag-assure-grid">
              {PHILOSOPHY.map(({ icon: Icon, title, body }) => (
                <div key={title} className="ag-assure">
                  <div className="ag-assure-icon">
                    <Icon size={18} />
                  </div>
                  <h3 className="ag-assure-title">{title}</h3>
                  <p className="ag-assure-body">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Responsible AI ────────────────────────────────────────────── */}
        <section className="ag-section" aria-labelledby="ag-rai">
          <div className="ag-shell">
            <div className="ag-section-head ag-reveal">
              <div className="ag-section-lead">
                <p className="ag-eyebrow">Responsible AI</p>
                <h2 id="ag-rai" className="ag-h2">
                  Intelligent, with guardrails.
                </h2>
                <p className="ag-lead">
                  AI creates value when it is applied carefully and governed honestly. Our approach to
                  responsible AI is practical, and it applies to everything we build:
                </p>
              </div>
            </div>
            <ul className="ag-evidence">
              {RESPONSIBLE_AI.map((item) => (
                <li key={item}>
                  <ShieldCheck size={15} aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Quality & security ────────────────────────────────────────── */}
        <section className="ag-section" aria-labelledby="ag-qs">
          <div className="ag-shell">
            <div className="ag-section-head ag-reveal">
              <div className="ag-section-lead">
                <p className="ag-eyebrow">Quality &amp; security</p>
                <h2 id="ag-qs" className="ag-h2">
                  How we keep systems dependable.
                </h2>
              </div>
            </div>
            <div className="ag-assure-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
              {QUALITY_SECURITY.map((item) => (
                <div key={item.title} className="ag-assure">
                  <div className="ag-assure-icon">
                    <ShieldCheck size={18} />
                  </div>
                  <h3 className="ag-assure-title">{item.title}</h3>
                  <p className="ag-assure-body">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Partnership ───────────────────────────────────────────────── */}
        <section className="ag-section" aria-labelledby="ag-partner">
          <div className="ag-shell">
            <div className="ag-section-head ag-reveal">
              <div className="ag-section-lead">
                <p className="ag-eyebrow">Long-term partnership</p>
                <h2 id="ag-partner" className="ag-h2">
                  We plan for the years after launch.
                </h2>
                <p className="ag-lead">
                  The measure of our work is not the demo — it is whether the system is still serving your
                  business, reliably, years later. That is why documentation, maintenance and honest roadmap
                  advice are part of how we deliver, and why many of our relationships grow with each project.
                </p>
              </div>
            </div>

            <div className="ag-glass" style={{ padding: '22px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <Image unoptimized src="/studio/alo-symbol.webp" alt="" width={56} height={64} />
                <div style={{ minWidth: 240, flex: 1 }}>
                  <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#EAF0FF' }}>
                    {COMPANY.legalName} · {COMPANY.product}
                  </p>
                  <p style={{ margin: '6px 0 0', fontSize: '0.84rem', lineHeight: 1.6, color: '#A9B9D8' }}>
                    {COMPANY.promise}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
                    {USAGE_RULES.map((rule) => (
                      <span key={rule.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            width: 11,
                            height: 11,
                            borderRadius: 99,
                            border: '1px solid rgba(160,195,255,0.3)',
                            background: rule.swatch,
                          }}
                        />
                        <span
                          style={{
                            fontSize: '0.62rem',
                            fontWeight: 700,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            color: '#7E90B4',
                          }}
                        >
                          {rule.label}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Where we are ──────────────────────────────────────────────── */}
        <section className="ag-section" id="offices" aria-labelledby="ag-where">
          <div className="ag-shell">
            <div className="ag-section-head ag-reveal">
              <div className="ag-section-lead">
                <p className="ag-eyebrow">Where we are</p>
                <h2 id="ag-where" className="ag-h2">
                  A US company working across borders.
                </h2>
                <p className="ag-lead">
                  Registered in Harrisonville, Missouri, with delivery built in Bangladesh. Registration and
                  delivery are different facts, and we state both rather than implying one.
                </p>
              </div>
            </div>

            <div className="ag-assure-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
              <div className="ag-glass" style={{ padding: '22px 20px' }}>
                <p className="ag-eyebrow" style={{ marginBottom: 12 }}>
                  <MapPin size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />
                  Registered office
                </p>
                <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#EAF0FF' }}>
                  {COMPANY.legalName} · {COMPANY.entity}
                </p>
                <p style={{ margin: '6px 0 0', fontSize: '0.86rem', lineHeight: 1.6, color: '#A9B9D8' }}>
                  {COMPANY.addressOneLine}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 14 }}>
                  <a href={COMPANY.phoneHref} className="ag-footer-link" style={{ fontSize: '0.8rem' }}>
                    {COMPANY.phone}
                  </a>
                  <a href={COMPANY.emailHref} className="ag-footer-link" style={{ fontSize: '0.8rem' }}>
                    {COMPANY.email}
                  </a>
                </div>
              </div>

              <div className="ag-glass" style={{ padding: '22px 20px' }}>
                <p className="ag-eyebrow" style={{ marginBottom: 12 }}>
                  <Globe size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />
                  Delivery &amp; domains
                </p>
                <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#EAF0FF' }}>
                  Built in Bangladesh
                </p>
                <p style={{ margin: '6px 0 0', fontSize: '0.86rem', lineHeight: 1.6, color: '#A9B9D8' }}>
                  Engineering and delivery teams work from Bangladesh, in the client&apos;s time zone where it
                  matters. The registered office above is the legal contact.
                </p>
                <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
                  {COMPANY.domains.map((d) => (
                    // `flex-wrap` + `minWidth: 0` on the value: at 390px the
                    // domain string ("alolabs.net/portal") is wider than the
                    // space left beside the label, and without wrapping it
                    // overhung the viewport by 2px and clipped.
                    <div key={d.value} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.64rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7E90B4', flexShrink: 0 }}>
                        {d.label}
                      </span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 650, color: '#D7E2F7', minWidth: 0, overflowWrap: 'anywhere' }}>
                        {d.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <ul className="ag-evidence" style={{ marginTop: 20 }}>
              {PRINCIPLES.map((item) => (
                <li key={item}>
                  <ShieldCheck size={15} aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Engineering you can trust (shared component) ───────────────── */}
        <TrustSection />

        {/* ── CTA ───────────────────────────────────────────────────────── */}
        <section className="ag-section" aria-labelledby="ag-about-cta">
          <div className="ag-shell">
            <div className="ag-cta ag-reveal">
              <h2 id="ag-about-cta" className="ag-h2" style={{ marginBottom: 14 }}>
                Let&apos;s build something that lasts.
              </h2>
              <p className="ag-lead" style={{ marginInline: 'auto', textAlign: 'center', maxWidth: '58ch' }}>
                If you are looking for a technology partner who takes quality as seriously as you do — we
                should talk.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 26 }}>
                <Link href="/site/start-a-project" className="ag-btn ag-btn-primary">
                  Start a Project <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link href="/site/projects" className="ag-btn ag-btn-ghost">
                  See the work
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

/* ════════════════════════════════════════════════════════════════════════════
 * /site/careers
 * ════════════════════════════════════════════════════════════════════════════ */

const BENEFITS = [
  {
    icon: Laptop,
    title: 'Remote-first, async-native',
    body: 'Work from wherever you do your best thinking. Overlap hours matter more than office hours.',
  },
  {
    icon: Rocket,
    title: 'Ship real systems',
    body: 'Your work lands in production inside the same week — in front of operators who use it every day.',
  },
  {
    icon: Sparkles,
    title: 'Frontier tooling',
    body: 'Applied AI, automation and real client work — you ship things people use.',
  },
  {
    icon: HeartHandshake,
    title: 'Ownership & growth',
    body: 'Small teams, direct customer contact, and a budget for the courses, conferences and kit you need.',
  },
]

/**
 * Honest vacancy policy: only real openings are ever published here. The
 * profile areas below describe the kinds of people we hire for — they are not
 * vacancies. When a real opening exists it is listed first with its details.
 */
const PROFILE_AREAS = [
  {
    title: 'Software engineering',
    body: 'Full-stack and backend engineers who ship tested, maintainable systems — Next.js, TypeScript and the services behind them.',
  },
  {
    title: 'AI & automation',
    body: 'Engineers who design AI-assisted workflows that behave predictably, respect guardrails and pass human review.',
  },
  {
    title: 'Solutions & implementation',
    body: 'People who can run client assessments, design workflows with the teams who use them and take first projects live.',
  },
  {
    title: 'Product design',
    body: 'Designers who keep products and public surfaces at the standard of the brand — systems thinking and editorial care.',
  },
]

const HIRING_STEPS = [
  { step: '01', title: 'Write to us', body: 'A short note about what you have shipped and what you want to work on. CV or portfolio link welcome.' },
  { step: '02', title: 'Conversation', body: 'A 45-minute call with the people you would work with — about the work, not brain teasers.' },
  { step: '03', title: 'Paid work session', body: 'A scoped, paid exercise on a real problem from our backlog. Nothing speculative.' },
  { step: '04', title: 'Offer & start', body: 'References, terms, a clear 30-60-90 plan — and your first ship date in the calendar.' },
]

const HIRING_CRITERIA = [
  'You have shipped things real people use — and can tell the story of what broke and what you learned.',
  'You write clearly. Most of this company runs on written specifications.',
  'You care about the boring parts: tests, audits, backups, handovers.',
  'You are comfortable with AI tooling and honest about where it fails.',
]

export function CareersDarkPage() {
  const applyHref = `${COMPANY.emailHref}?subject=${encodeURIComponent('Open application — ALO Labs')}`
  return (
    <DarkPageShell>
      <main id="main">
        <section className="ag-page-hero">
          <div className="ag-shell">
            <Breadcrumbs crumbs={[{ href: '/site/careers', label: 'Careers' }]} />
            <div className="ag-case-head">
              <div>
                <p className="ag-eyebrow">Careers</p>
                <h1 className="ag-h1" style={{ fontSize: 'clamp(2.2rem, 4.8vw, 3.7rem)', maxWidth: '20ch' }}>
                  Build intelligent systems that <span className="ag-h1-warm">matter</span>.
                </h1>
                <p className="ag-lead">
                  We are a senior team designing and building software and AI solutions for real businesses.
                  If that is the kind of problem you want to spend years on, come talk to us.
                </p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 30 }}>
                  <a href={applyHref} className="ag-btn ag-btn-primary">
                    Send your application <ArrowRight size={16} aria-hidden="true" />
                  </a>
                  <Link href="/site/how-we-work" className="ag-btn ag-btn-ghost">
                    How we work
                  </Link>
                </div>
              </div>

              <div className="ag-glass" style={{ padding: '22px 20px' }}>
                <p className="ag-eyebrow" style={{ marginBottom: 14 }}>
                  Hiring policy
                </p>
                <p style={{ margin: 0, fontSize: '0.86rem', lineHeight: 1.65, color: '#A9B9D8' }}>
                  Specific vacancies are published here only when they are real — we never post speculative
                  listings. Open applications are always welcome.
                </p>
                <p
                  style={{
                    margin: '14px 0 0',
                    paddingTop: 14,
                    borderTop: '1px solid rgba(160,195,255,0.14)',
                    fontSize: '0.74rem',
                    color: '#7E90A4',
                    lineHeight: 1.6,
                  }}
                >
                  We reply to every application.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="ag-section" aria-labelledby="ag-life">
          <div className="ag-shell">
            <div className="ag-section-head ag-reveal">
              <div className="ag-section-lead">
                <p className="ag-eyebrow">Life at ALO Labs</p>
                <h2 id="ag-life" className="ag-h2">
                  What working here is like.
                </h2>
              </div>
            </div>
            <div className="ag-assure-grid">
              {BENEFITS.map(({ icon: Icon, title, body }) => (
                <div key={title} className="ag-assure">
                  <div className="ag-assure-icon">
                    <Icon size={18} />
                  </div>
                  <h3 className="ag-assure-title">{title}</h3>
                  <p className="ag-assure-body">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="ag-section" id="roles" aria-labelledby="ag-roles">
          <div className="ag-shell">
            <div className="ag-section-head ag-reveal">
              <div className="ag-section-lead">
                <p className="ag-eyebrow">Openings &amp; applications</p>
                <h2 id="ag-roles" className="ag-h2">
                  Real openings, published honestly.
                </h2>
              </div>
            </div>

            <div className="ag-glass" style={{ padding: '24px 22px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ maxWidth: 620 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className="ag-pill-state ag-pill-live">Open application</span>
                    <span className="ag-tag">Remote</span>
                  </div>
                  <h3 style={{ margin: '12px 0 0', fontSize: '1.05rem', fontWeight: 750, color: '#EAF0FF' }}>
                    We would like to meet you.
                  </h3>
                  <p style={{ margin: '8px 0 0', fontSize: '0.86rem', lineHeight: 1.65, color: '#A9B9D8' }}>
                    Specific vacancies are published on this page only when they are real — we never post
                    speculative listings. Open applications are always welcome: tell us what you have shipped
                    and what you want to work on.
                  </p>
                </div>
                <a href={applyHref} className="ag-btn ag-btn-primary">
                  Apply <ArrowRight size={15} aria-hidden="true" />
                </a>
              </div>
            </div>

            <div className="ag-assure-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', marginTop: 16 }}>
              {PROFILE_AREAS.map((area) => (
                <div key={area.title} className="ag-assure">
                  <h3 className="ag-assure-title">{area.title}</h3>
                  <p className="ag-assure-body">{area.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="ag-section" aria-labelledby="ag-hiring">
          <div className="ag-shell">
            <div className="ag-section-head ag-reveal">
              <div className="ag-section-lead">
                <p className="ag-eyebrow">How we hire</p>
                <h2 id="ag-hiring" className="ag-h2">
                  Four steps, no homework marathons.
                </h2>
              </div>
            </div>
            <div className="ag-flow" style={{ marginBottom: 22 }}>
              {HIRING_STEPS.map((item) => (
                <div className="ag-flow-step" key={item.step}>
                  <span className="ag-flow-n">{item.step}</span>
                  <span className="ag-flow-label">{item.title}</span>
                </div>
              ))}
            </div>
            <div className="ag-assure-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
              {HIRING_STEPS.map((item) => (
                <div key={item.step} className="ag-assure">
                  <p className="ag-assure-body" style={{ marginTop: 0 }}>
                    {item.body}
                  </p>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 22 }}>
              <p className="ag-eyebrow" style={{ marginBottom: 14 }}>
                What we look for, in every role
              </p>
              <ul className="ag-evidence">
                {HIRING_CRITERIA.map((item) => (
                  <li key={item}>
                    <Check size={15} aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="ag-section" aria-labelledby="ag-careers-cta">
          <div className="ag-shell">
            <div className="ag-cta ag-reveal">
              <h2 id="ag-careers-cta" className="ag-h2" style={{ marginBottom: 14 }}>
                Engineer looking for your next mission?
              </h2>
              <p className="ag-lead" style={{ marginInline: 'auto', maxWidth: '54ch', textAlign: 'center' }}>
                Send your CV and a few lines about what you want to build to {COMPANY.email} — we reply to
                every application.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 26 }}>
                <a href={applyHref} className="ag-btn ag-btn-primary">
                  Send your application <ArrowRight size={16} aria-hidden="true" />
                </a>
                <Link href="/site/about" className="ag-btn ag-btn-ghost">
                  About ALO Labs
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

/* ════════════════════════════════════════════════════════════════════════════
 * /site/how-we-work
 *
 * NOTE ON THE PREVIOUS VERSION OF THIS PAGE: it rendered two <h1> elements —
 * one from PageHero and one from the following Section — which is an
 * accessibility defect (a document should have a single h1). The rebuilt page
 * has exactly one h1 in the hero and h2/h3 below it.
 * ════════════════════════════════════════════════════════════════════════════ */

const DELIVERY_STAGES = [
  {
    n: '01',
    icon: Compass,
    title: 'Discovery',
    lead: 'Understand the business, requirements, stakeholders and existing systems.',
    body: 'We start by listening. Discovery workshops and interviews map how your business runs today, where the friction is, what success looks like and which constraints matter — technical, commercial and human. Nothing is proposed until the problem is properly understood.',
    youSee: ['A shared understanding of the problem', 'Stakeholder and system map', 'Initial risks and assumptions, written down'],
  },
  {
    n: '02',
    icon: PenTool,
    title: 'Strategy & Architecture',
    lead: 'Define the solution, architecture, scope, priorities and delivery plan.',
    body: 'We turn understanding into a plan: the solution shape, the architecture behind it, what is in scope, what is not, and the order work will be delivered in. You approve the scope and commercial model before engineering begins.',
    youSee: ['Solution and architecture proposal', 'Scoped deliverables and milestones', 'Quotation for your approval'],
  },
  {
    n: '03',
    icon: FileCheck2,
    title: 'Design & Engineering',
    lead: 'Build, review, test and refine the solution.',
    body: 'Design and engineering run in disciplined iterations. Work is reviewed, tested and demonstrated as it develops — not revealed at the end. Feedback is folded in continuously, and quality gates (tests, reviews, verification) are part of the process, not an afterthought.',
    youSee: ['Regular progress and demos', 'Reviewed, tested increments', 'Decisions and trade-offs documented'],
  },
  {
    n: '04',
    icon: Rocket,
    title: 'Launch & Delivery',
    lead: 'Prepare deployment, verification, documentation and handover.',
    body: 'Launch is engineered, not improvised: deployment planning, verification against the agreed scope, operational documentation and a structured handover to the people who will run the system. We stay close through go-live.',
    youSee: ['Deployment and verification plan', 'Documentation and admin guides', 'Formal handover and sign-off'],
  },
  {
    n: '05',
    icon: LifeBuoy,
    title: 'Continuous Improvement',
    lead: 'Provide agreed maintenance, enhancements and support.',
    body: 'Software is a living system. After launch we agree the maintenance, monitoring and enhancement cadence your business needs — fixing, refining and extending the product as your requirements evolve.',
    youSee: ['Agreed maintenance and support scope', 'Monitoring and issue response', 'A roadmap for what comes next'],
  },
]

const DELIVERY_PRINCIPLES = [
  { title: 'Scope before billing', body: 'You approve what will be delivered, and what it costs, before billable work starts.' },
  { title: 'Review before delivery', body: 'Every deliverable is checked internally before it reaches you — and nothing is final until you approve it.' },
  { title: 'Communication is part of the work', body: 'Clear status, early warnings and honest answers are delivery requirements, not extras.' },
  { title: 'No unrealistic promises', body: 'We plan timelines from real capacity and evidence. If something is uncertain, we say so.' },
]

const PROCESS_FAQS = [
  {
    q: 'How long does a typical project take?',
    a: 'It depends on scope — a focused automation can be delivered in weeks; a platform build is phased over months. We commit to timelines only after discovery, and then we hold them.',
  },
  {
    q: 'What do you need from our side?',
    a: 'Access to the people who know the process, timely decisions at review points and a named counterpart on your side. Clear input from clients is the single biggest factor in smooth delivery.',
  },
  {
    q: 'What if requirements change mid-project?',
    a: 'They often do. Changes are scoped, priced and scheduled transparently — small adjustments are absorbed, larger shifts are re-planned together so the project stays honest.',
  },
  {
    q: 'Who owns the deliverables?',
    a: 'You do. Everything produced for your project — code, designs, documentation — is yours on delivery, as defined in the agreed scope and our terms.',
  },
]

export function HowWeWorkDarkPage() {
  return (
    <DarkPageShell>
      <main id="main">
        <section className="ag-page-hero">
          <div className="ag-shell">
            <Breadcrumbs crumbs={[{ href: '/site/how-we-work', label: 'How we work' }]} />
            <div className="ag-case-head">
              <div>
                <p className="ag-eyebrow">How we work</p>
                <h1 className="ag-h1" style={{ fontSize: 'clamp(2.1rem, 4.6vw, 3.5rem)', maxWidth: '22ch' }}>
                  A delivery process built for <span className="ag-h1-warm">accountability</span>.
                </h1>
                <p className="ag-lead">
                  Five stages, repeated with discipline on every engagement — from the first discovery
                  conversation to continuous improvement after launch. Here is exactly what happens, and
                  what you see at each step.
                </p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 30 }}>
                  <Link href="/site/start-a-project" className="ag-btn ag-btn-primary">
                    Start a project <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                  <Link href="/site/projects" className="ag-btn ag-btn-ghost">
                    See the work
                  </Link>
                </div>
              </div>

              <div className="ag-glass" style={{ padding: '22px 20px' }}>
                <p className="ag-eyebrow" style={{ marginBottom: 14 }}>
                  The shape of an engagement
                </p>
                <div className="ag-flow" style={{ marginTop: 0 }}>
                  {DELIVERY_STAGES.map((s) => (
                    <div className="ag-flow-step" key={s.n}>
                      <span className="ag-flow-n">{s.n}</span>
                      <span className="ag-flow-label">{s.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="ag-section" aria-labelledby="ag-stages">
          <div className="ag-shell">
            <div className="ag-section-head ag-reveal">
              <div className="ag-section-lead">
                <p className="ag-eyebrow">The process</p>
                <h2 id="ag-stages" className="ag-h2">
                  Five stages, start to finish.
                </h2>
                <p className="ag-lead">Every project is different; the discipline behind delivery is not.</p>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 16 }}>
              {DELIVERY_STAGES.map((stage) => {
                const Icon = stage.icon
                return (
                  <article key={stage.n} className="ag-qa">
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="ag-assure-icon" style={{ marginBottom: 0 }}>
                          <Icon size={17} />
                        </span>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            letterSpacing: '0.18em',
                            color: 'var(--ag-orange)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {stage.n}
                        </span>
                      </div>
                      <h3 style={{ margin: '12px 0 0', fontSize: '1.05rem', fontWeight: 750, color: '#EAF0FF' }}>
                        {stage.title}
                      </h3>
                      <p style={{ margin: '6px 0 0', fontSize: '0.84rem', lineHeight: 1.6, color: '#8FA6CE' }}>
                        {stage.lead}
                      </p>
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.7, color: '#C3D0E8' }}>{stage.body}</p>
                      <p
                        style={{
                          margin: '18px 0 8px',
                          fontSize: '0.62rem',
                          fontWeight: 800,
                          letterSpacing: '0.14em',
                          textTransform: 'uppercase',
                          color: '#7E90B4',
                        }}
                      >
                        What you see
                      </p>
                      <ul className="ag-evidence" style={{ marginTop: 0 }}>
                        {stage.youSee.map((item) => (
                          <li key={item}>
                            <Check size={14} aria-hidden="true" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section className="ag-section" aria-labelledby="ag-principles">
          <div className="ag-shell">
            <div className="ag-section-head ag-reveal">
              <div className="ag-section-lead">
                <p className="ag-eyebrow">Delivery principles</p>
                <h2 id="ag-principles" className="ag-h2">
                  The rules we hold ourselves to.
                </h2>
              </div>
            </div>
            <div className="ag-assure-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
              {DELIVERY_PRINCIPLES.map((p) => (
                <div key={p.title} className="ag-assure">
                  <h3 className="ag-assure-title">{p.title}</h3>
                  <p className="ag-assure-body">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="ag-section" aria-labelledby="ag-faq">
          <div className="ag-shell">
            <div className="ag-section-head ag-reveal">
              <div className="ag-section-lead">
                <p className="ag-eyebrow">Process questions</p>
                <h2 id="ag-faq" className="ag-h2">
                  Asked before signing.
                </h2>
              </div>
            </div>
            <div className="ag-faq">
              {PROCESS_FAQS.map((item) => (
                <details key={item.q}>
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="ag-section" aria-labelledby="ag-hww-cta">
          <div className="ag-shell">
            <div className="ag-cta ag-reveal">
              <h2 id="ag-hww-cta" className="ag-h2" style={{ marginBottom: 14 }}>
                Start with discovery.
              </h2>
              <p className="ag-lead" style={{ marginInline: 'auto', maxWidth: '52ch', textAlign: 'center' }}>
                Tell us how the business runs today. The first conversation is free, and it ends with a
                written next step — not a sales sequence.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 26 }}>
                <Link href="/site/start-a-project" className="ag-btn ag-btn-primary">
                  Start a Project <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link href="/site/book-a-consultation" className="ag-btn ag-btn-ghost">
                  Book a consultation
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
