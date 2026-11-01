'use client'

/**
 * MarketingSite — the home page of alolabs.net.
 *
 * The full company front door: hero with the headline statistics and a live
 * command-centre panel, the system flow, the delivery process, the service
 * lines, the agent specification cards, the mobile command centre, the
 * departments and domains, the differentiators, a diagram teaser, insights,
 * the FAQ and the letterhead contact strip — every figure a live component
 * from the brand system, never a screenshot.
 */

import * as React from 'react'
import Link from 'next/link'
import {
  Badge,
  Mark,
} from '@/components/brand/alo-logo'
import { SystemFlow } from '@/components/brand/system-flow'
import { CommandCenterMobile } from '@/components/brand/command-center-mobile'
import { AgentSpecCard, SPEC_SAMPLE } from '@/components/brand/agent-spec-card'
import { EditorialDiagram } from '@/components/diagrams/editorial-diagram'
import { EXAMPLE_BY_SLUG } from '@/lib/diagram-design/examples'
import { Button } from '@/components/ui/button'
import {
  BRAND,
  BRAND_FONTS,
  COMPANY,
  GRADIENTS,
  HEADLINE_STATS,
  SYSTEM_FLOW,
} from '@/lib/brand/tokens'
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  Database,
  Gauge,
  Globe,
  Layers,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Workflow,
} from 'lucide-react'
import {
  CtaBand,
  FaqList,
  NumberedCard,
  Section,
  SiteFooter,
  SiteHeader,
  StatCard,
  type FaqItem,
} from '@/components/site/chrome'

const SECTIONS = [
  { id: 'system', label: 'System' },
  { id: 'process', label: 'Process' },
  { id: 'services', label: 'Services' },
  { id: 'agents', label: 'Agents' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'departments', label: 'Departments' },
  { id: 'contact', label: 'Contact' },
]

/** In-page section labels, reused by the section eyebrow numbering. */
export const HOME_SECTIONS = SECTIONS

export function MarketingSite() {
  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: BRAND_FONTS.primary.stack }}>
      <SiteHeader active="/site" />
      <Hero />
      <LogoStrip />
      <SystemSection />
      <ProcessSection />
      <ServicesSection />
      <AgentsSection />
      <MobileSection />
      <DepartmentsSection />
      <WhySection />
      <DiagramsTeaser />
      <InsightsSection />
      <FaqSection />
      <ContactSection />
      <CtaBand
        title="One command centre. 1020 agents. Your departments next."
        lead="Open the command centre and run a real command — or talk to the team about the first department we should automate together."
      />
      <SiteFooter />
    </div>
  )
}

// ─── Header ──────────────────────────────────────────────────────────────────

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-6 px-6 py-3.5">
        <Link href="/" className="flex items-center gap-3">
          <AloLabsLogo size={34} tagline={false} title="ALO Labs AgentOS" />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-md px-3 py-2 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              {s.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="hidden gap-1.5 sm:flex" asChild>
            <Link href="/brand">
              <Layers className="size-3.5" /> Brand book
            </Link>
          </Button>
          <Button size="sm" className="gap-1.5" style={{ background: BRAND.orange }} asChild>
            <Link href="/login">
              Open AgentOS <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  )
}

// ─── Hero ────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-slate-200" style={{ background: BRAND.canvas }}>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
        style={{ background: GRADIENTS.orange.css }}
        aria-hidden="true"
      />
      <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-6 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
        <div>
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em]"
            style={{ background: 'rgba(255,106,0,0.10)', color: BRAND.orange }}
          >
            <Bot className="size-3.5" /> {COMPANY.tagline}
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-[56px]" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
            One command centre for <span style={{ color: BRAND.orange }}>1020 AI agents</span> across 100+ departments.
          </h1>
          <p className="mt-5 max-w-[62ch] text-[15px] leading-relaxed" style={{ color: BRAND.gray }}>
            ALO Labs {COMPANY.product} routes every command from the owner to the right department, agent and workflow —
            then runs it through memory, a hybrid RAG engine and an approval gate before anything executes. Secure,
            auditable, and built to scale.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button size="lg" className="gap-2" style={{ background: BRAND.orange }} asChild>
              <Link href="/login">
                Open the Command Center <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="gap-2" asChild>
              <Link href="/site/platform">
                Explore the platform
              </Link>
            </Button>
          </div>
          <dl className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-4">
            {HEADLINE_STATS.map((stat) => (
              <div key={stat.label}>
                <dt className="text-2xl font-bold" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
                  {stat.value}
                </dt>
                <dd className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: BRAND.gray }}>
                  {stat.label}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative">
          <div
            className="rounded-2xl p-6"
            style={{ background: BRAND.navy, boxShadow: '0 30px 70px -40px rgba(0,28,107,0.8)' }}
          >
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <span className="flex size-9 items-center justify-center rounded-full bg-white">
                <Mark size={22} />
              </span>
              <div>
                <p className="text-[13px] font-bold tracking-wide text-white">ALO COMMAND CENTER</p>
                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/60">
                  Live routing · approval gate armed
                </p>
              </div>
            </div>
            <ul className="mt-4 space-y-2.5">
              {[
                { icon: Workflow, text: 'Owner command received — intent detected', tint: BRAND.orange },
                { icon: Layers, text: 'Routed to Marketing Department · 34 agents eligible', tint: '#7BA7FF' },
                { icon: ShieldCheck, text: 'Risk assessment passed · no policy violations', tint: '#7BA7FF' },
                { icon: Database, text: 'Memory + hybrid RAG retrieved 128 sources', tint: '#7BA7FF' },
                { icon: BadgeCheck, text: 'Approval granted — execution queued at 09:41', tint: BRAND.orange },
              ].map((row) => (
                <li key={row.text} className="flex items-start gap-3 rounded-lg bg-white/5 px-3 py-2.5">
                  <row.icon className="mt-0.5 size-4 shrink-0" style={{ color: row.tint }} />
                  <span className="text-[12px] leading-snug text-white/90">{row.text}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between rounded-lg px-3 py-2.5" style={{ background: 'rgba(255,106,0,0.14)' }}>
              <span className="font-mono text-[9px] uppercase tracking-[0.16em]" style={{ color: '#FFB27A' }}>
                Result
              </span>
              <span className="text-[12px] font-semibold text-white">Report delivered · audit logged</span>
            </div>
          </div>

          {/* The circular badge, straight from the brand sheet */}
          <div className="mt-5 flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5">
            <Badge size={96} />
            <div>
              <p className="text-[13px] font-semibold" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
                {COMPANY.legalName} {COMPANY.product}
              </p>
              <p className="mt-1 text-[11px] leading-snug" style={{ color: BRAND.gray }}>
                {COMPANY.promise}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function LogoStrip() {
  const items = [
    { icon: Gauge, label: 'Command Center' },
    { icon: Workflow, label: 'Master Router' },
    { icon: Layers, label: 'Department Router' },
    { icon: Database, label: 'Hybrid RAG' },
    { icon: ShieldCheck, label: 'Approval Engine' },
    { icon: BadgeCheck, label: 'Audit System' },
  ]
  return (
    <section className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-6 px-6 py-7">
        {items.map((item) => (
          <span key={item.label} className="flex items-center gap-2">
            <item.icon className="size-4" style={{ color: BRAND.orange }} />
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: BRAND.gray }}>
              {item.label}
            </span>
          </span>
        ))}
      </div>
    </section>
  )
}

// ─── System flow ─────────────────────────────────────────────────────────────

function SystemSection() {
  const routeCount = SYSTEM_FLOW.filter((n) => !n.branch).length
  const departmentCount = SYSTEM_FLOW.filter((n) => n.branch && n.tone === 'blue').length
  return (
    <Section
      id="system"
      eyebrow="1 · System flow"
      title="Every command takes the same eight-hop path — and it is auditable at every hop."
      lead="Orange is the action path, blue is the system path. The owner's command travels from the Command Center through the routers, the agent pool, memory and the hybrid RAG engine, and stops at the approval gate before execution."
    >
      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-8">
          <SystemFlow />
        </div>
        <div className="space-y-4">
          <StatCard icon={Gauge} value={String(routeCount)} label="Routed hops" note="Command Center → result" />
          <StatCard icon={Layers} value={String(departmentCount)} label="Department branches" note="Website, CRM, Marketing, Student Ops, Finance" />
          <StatCard icon={Database} value="3" label="RAG families" note="Classic, graph and agentic retrieval" />
          <StatCard icon={ShieldCheck} value="1" label="Approval gate" note="Nothing executes without it" />
        </div>
      </div>
    </Section>
  )
}

// ─── Process ─────────────────────────────────────────────────────────────────

function ProcessSection() {
  const steps = [
    { step: '1', title: 'Assess', body: 'We map your departments, workflows, data and risk surface — and agree what the agents should and should not do.' },
    { step: '2', title: 'Design', body: 'Agent specifications, workflows, approval rules and integrations are designed as a system — documented in diagrams, not slideware.' },
    { step: '3', title: 'Deploy', body: 'We stand up the command centre, provision the agent workforce and integrate your tools — in your cloud or ours.' },
    { step: '4', title: 'Run', body: 'Agents work inside the approval gate while you watch the dashboards. We tune, report and extend department by department.' },
  ]
  return (
    <Section
      id="process"
      eyebrow="2 · How we deliver"
      title="Assess, design, deploy, run."
      lead="The same four steps on every engagement — one workflow or a hundred-department workforce."
      ground="canvas"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <div key={s.step} className="rounded-2xl border border-slate-200 bg-white p-6">
            <span
              className="flex size-10 items-center justify-center rounded-full text-[15px] font-bold text-white"
              style={{ background: BRAND.orange, fontFamily: BRAND_FONTS.secondary.stack }}
            >
              {s.step}
            </span>
            <h3 className="mt-4 text-[17px] font-semibold" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
              {s.title}
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed" style={{ color: BRAND.gray }}>
              {s.body}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-6">
        <Button variant="outline" className="gap-1.5" asChild>
          <Link href="/site/solutions#process">
            How engagements run <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>
    </Section>
  )
}

// ─── Services ────────────────────────────────────────────────────────────────

function ServicesSection() {
  return (
    <Section
      id="services"
      eyebrow="3 · Services"
      title="Six service lines. One accountable team."
      lead="Each line stands on its own — take one, combine them later, with the same command centre underneath."
    >
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <NumberedCard
          index="01"
          title="AI agents & workforce automation"
          body="Departments of specified AI agents that take real work off your team — reports, follow-ups, data entry, research — inside an approval gate."
          items={['Agent specification & registry', 'Workflow automation', 'Approval & audit built in']}
          href="/site/solutions#automation"
          ctaLabel="Explore"
        />
        <NumberedCard
          index="02"
          title="CRM & marketing automation"
          body="Lead capture, enrichment, scoring and nurture wired into your CRM — with campaigns and reporting running as scheduled agent work."
          items={['CRM implementation', 'Lead enrichment & scoring', 'Campaign automation']}
          href="/site/solutions#crm"
          ctaLabel="Explore"
        />
        <NumberedCard
          index="03"
          title="Education & student operations"
          body="Recruitment, applications, compliance and pastoral operations for consultancies and institutions — UKVI-aware workflows included."
          items={['Applicant pipelines', 'Document & compliance checks', 'Agent-led student support']}
          href="/site/solutions#education"
          ctaLabel="Explore"
        />
        <NumberedCard
          index="04"
          title="Voice, SMS & communications"
          body="AI call-centre and telephony integrations: inbound routing, call intelligence, SMS automation and VoIP — on the same agent workforce."
          items={['Call intelligence', 'SMS follow-up automation', 'Conversation logging into CRM']}
          href="/site/solutions#comms"
          ctaLabel="Explore"
        />
        <NumberedCard
          index="05"
          title="Knowledge, content & media"
          body="Hybrid RAG over your corpus, editorial diagrams, AI video and image pipelines — everything your teams publish, grounded in your data."
          items={['Hybrid RAG (classic · graph · agentic)', 'Diagram & report generation', 'AI media pipelines']}
          href="/site/solutions#knowledge"
          ctaLabel="Explore"
        />
        <NumberedCard
          index="06"
          title="Custom AI products & integrations"
          body="When the need is a product, not a service: multi-tenant SaaS, internal platforms and white-label AI assistants engineered to last."
          items={['SaaS product engineering', 'LLM applications & agents', 'Data pipelines & integrations']}
          href="/site/solutions#products"
          ctaLabel="Explore"
        />
      </div>
    </Section>
  )
}

// ─── Agents ──────────────────────────────────────────────────────────────────

function AgentsSection() {
  return (
    <Section
      id="agents"
      eyebrow="4 · Master 1020 agent specification"
      title="Every agent is specified before it runs: department, role, mission, work, input, output."
      lead="The specification list is the source of truth for the agent registry — 1020 agents across 100+ departments, each with a named role, a mission, an execution path, and QA and approval rules attached."
      ground="canvas"
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {SPEC_SAMPLE.map((spec) => (
          <AgentSpecCard key={spec.id} spec={spec} />
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button variant="outline" className="gap-1.5" asChild>
          <Link href="/brand">
            Open the specification layout <ArrowRight className="size-3.5" />
          </Link>
        </Button>
        <span className="text-[11px]" style={{ color: BRAND.gray }}>
          Cards are generated from data — the same component renders all 1020 in the registry.
        </span>
      </div>
    </Section>
  )
}

// ─── Mobile ──────────────────────────────────────────────────────────────────

function MobileSection() {
  const features = [
    { icon: Gauge, title: 'Command centre in the pocket', body: 'The same twelve tiles and four tabs as the desktop surface — Dashboard, Agents and Tasks first.' },
    { icon: Bot, title: 'Ask AgentOS anything', body: 'One search field routes natural-language requests to the right department and agent.' },
    { icon: ShieldCheck, title: 'Approvals on the move', body: 'Nothing executes until it is approved — push approvals arrive on the same screen.' },
    { icon: Globe, title: 'Blue theme, mobile-first', body: 'Blue for system and navigation, orange for action, per the brand guideline.' },
  ]
  return (
    <Section
      id="mobile"
      eyebrow="5 · Mobile view"
      title="Built mobile-first, so the command centre fits in a hand."
      lead="Departments, approvals, students, partners, finance — the whole operating surface, reconstructed here as a live component rather than a screenshot."
      ground="navy"
    >
      <div className="grid items-center gap-12 lg:grid-cols-[380px_1fr]">
        <CommandCenterMobile />
        <div className="grid gap-4 sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-white/10 bg-white/5 p-5">
              <f.icon className="size-4" style={{ color: BRAND.orange }} />
              <p className="mt-3 text-[14px] font-semibold text-white" style={{ fontFamily: BRAND_FONTS.secondary.stack }}>
                {f.title}
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-white/70">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

// ─── Departments & domains ───────────────────────────────────────────────────

function DepartmentsSection() {
  const departments = SYSTEM_FLOW.filter((n) => n.branch && n.tone === 'blue').map((n) => n.label)
  return (
    <Section
      id="departments"
      eyebrow="6 · Departments & deployment"
      title="Five departments on day one — and a subdomain for every surface."
      lead="Departments are the routing unit: each one owns its agents, workflows and approval rules. The platform is reachable on four branded domains."
      ground="white"
    >
      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          <div className="flex flex-wrap gap-2">
            {departments.map((d) => (
              <span
                key={d}
                className="rounded-md px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-white"
                style={{ background: BRAND.blue }}
              >
                {d}
              </span>
            ))}
            <span
              className="rounded-md border px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]"
              style={{ borderColor: BRAND.orange, color: BRAND.orange }}
            >
              + 95 more
            </span>
          </div>
          <ul className="mt-6 space-y-3">
            {[
              'Each department runs its own workflow library and QA rules.',
              'Agents are staffed per department and re-assigned without redeployment.',
              'Approval rules and audit logs are scoped to the department.',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2 text-[13px]" style={{ color: BRAND.gray }}>
                <BadgeCheck className="mt-0.5 size-4 shrink-0" style={{ color: BRAND.orange }} />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {COMPANY.domains.map((d) => (
            <div key={d.value} className="rounded-xl border border-slate-200 p-5">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: BRAND.graySoft }}>
                {d.label}
              </p>
              <p className="mt-1.5 font-mono text-[13px] font-semibold" style={{ color: BRAND.blue }}>
                {d.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

// ─── Why ALO ─────────────────────────────────────────────────────────────────

function WhySection() {
  const reasons = [
    { icon: ShieldCheck, title: 'Approval gate on everything', body: 'No agent side effect happens without risk scoring, policy checks and — where you configure it — a human yes.' },
    { icon: BadgeCheck, title: 'Auditable at every hop', body: 'Who commanded, which agent acted, what it read, what it wrote. Exportable evidence, per tenant.' },
    { icon: Layers, title: 'Specified, not improvised', body: 'Every agent has a department, a role, a mission and QA rules. If it cannot be specified, it does not ship.' },
    { icon: Database, title: 'Grounded in your data', body: 'Hybrid RAG over your own corpus with source-cited answers — your data stays in your tenant.' },
    { icon: Workflow, title: 'Department by department', body: 'Prove one department end to end, then extend the same pattern. Adoption is a delivery metric.' },
    { icon: Globe, title: 'Your cloud or ours', body: 'Managed service, your VPC or fully self-hosted — the same platform, the same audit trail.' },
  ]
  return (
    <Section
      eyebrow="Why ALO Labs"
      title="Automation with accountability."
      lead="We built the guardrails first — then the workforce that needs them."
      ground="canvas"
    >
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {reasons.map((r) => (
          <div key={r.title} className="rounded-2xl border border-slate-200 bg-white p-6">
            <r.icon className="size-4.5" style={{ color: BRAND.orange }} />
            <h3 className="mt-3 text-[16px] font-semibold" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
              {r.title}
            </h3>
            <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: BRAND.gray }}>
              {r.body}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="outline" className="gap-1.5" asChild>
          <Link href="/site/work">
            See the work <ArrowRight className="size-3.5" />
          </Link>
        </Button>
        <Button variant="outline" className="gap-1.5" asChild>
          <Link href="/site/pricing">
            Pricing & deployment <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>
    </Section>
  )
}

// ─── Diagram teaser ──────────────────────────────────────────────────────────

function DiagramsTeaser() {
  const figures = ['architecture-agentos', 'org-chart-ai-team', 'loop-growth-flywheel'] as const
  return (
    <Section
      eyebrow="Editorial diagram system"
      title="Your reports should look like this."
      lead="Every figure in our materials is generated from the editorial diagram library — 45 visual types, taste-gated in CI, exported as accessible SVG. It ships with every AgentOS deployment."
    >
      <div className="grid gap-5 lg:grid-cols-3">
        {figures.map((slug) => (
          <div key={slug} className="rounded-2xl border border-slate-200 bg-white p-5">
            <EditorialDiagram spec={EXAMPLE_BY_SLUG[slug]} />
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button className="gap-1.5" style={{ background: BRAND.orange }} asChild>
          <Link href="/site/diagrams">
            Open the diagram gallery <ArrowRight className="size-3.5" />
          </Link>
        </Button>
        <Button variant="outline" className="gap-1.5" asChild>
          <Link href="/design">Design system studio</Link>
        </Button>
      </div>
    </Section>
  )
}

// ─── Insights ────────────────────────────────────────────────────────────────

function InsightsSection() {
  const notes = [
    { tag: 'Operations', title: 'The eight-hop command path — and why every hop is audited', href: '/site/insights' },
    { tag: 'Governance', title: 'Designing an approval gate people do not route around', href: '/site/insights' },
    { tag: 'Marketing', title: 'Turning 50 marketing playbooks into installable agents', href: '/site/press' },
  ]
  return (
    <Section
      eyebrow="Insights"
      title="Notes from inside the agent factory."
      lead="Field notes on running AI departments — governance, retrieval, rollout patterns and the design systems behind the product."
      ground="canvas"
    >
      <div className="grid gap-5 lg:grid-cols-3">
        {notes.map((note) => (
          <Link
            key={note.title}
            href={note.href}
            className="group rounded-2xl border border-slate-200 bg-white p-6 transition-transform hover:-translate-y-1"
          >
            <span
              className="rounded-md px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.12em]"
              style={{ background: 'rgba(255,106,0,0.10)', color: BRAND.orange }}
            >
              {note.tag}
            </span>
            <h3 className="mt-3 text-[15px] font-semibold leading-snug" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
              {note.title}
            </h3>
            <span className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: BRAND.orange }}>
              Read the note <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </Section>
  )
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────

const HOME_FAQS: FaqItem[] = [
  {
    q: 'What exactly is AgentOS?',
    a: 'An enterprise AI operating system: one command centre routes every owner command to a specified workforce of AI agents — through memory, hybrid retrieval and an approval gate — with a complete audit trail. It is a platform you run departments on, not a chatbot.',
  },
  {
    q: 'How is this different from hiring an automation agency?',
    a: 'Agencies deliver workflows; AgentOS delivers the operating system those workflows run on — the registry, the routers, the approvals, the audit and the command centre — and our services team deploys the first departments on it.',
  },
  {
    q: 'Can we start small?',
    a: 'Yes. One department, 10–40 agents, 2–4 workflows — typically live in 2–4 weeks. Prove it end to end, then extend the same pattern to the next department.',
  },
  {
    q: 'Where does our data live?',
    a: 'In your tenant — managed cloud, your VPC or self-hosted. Retrieval runs against your own corpus and nothing is used to train third-party models.',
  },
]

function FaqSection() {
  return (
    <Section
      id="faq"
      eyebrow="FAQ"
      title="Questions we often hear."
      lead="Can't find your answer? Our team replies within one business day."
    >
      <FaqList items={HOME_FAQS} />
    </Section>
  )
}

// ─── Contact (letterhead strip) ──────────────────────────────────────────────

function ContactSection() {
  return (
    <Section
      id="contact"
      eyebrow="Contact"
      title="Talk to the team behind AgentOS."
      lead="The same four details printed on every ALO Labs letterhead — address, phone, website and email."
      ground="canvas"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ContactCard icon={MapPin} label="Address" lines={[COMPANY.entity, ...COMPANY.address]} />
        <ContactCard icon={Phone} label="Phone" lines={[COMPANY.phone]} href={COMPANY.phoneHref} />
        <ContactCard icon={Globe} label="Website" lines={[COMPANY.website]} href={COMPANY.websiteHref} />
        <ContactCard icon={Mail} label="Email" lines={[COMPANY.email]} href={COMPANY.emailHref} />
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button size="lg" className="gap-2" style={{ background: BRAND.orange }} asChild>
          <Link href="/site/contact">
            <Mail className="size-4" /> Contact form
          </Link>
        </Button>
        <Button size="lg" variant="outline" className="gap-2" asChild>
          <Link href="/invoice">
            View an invoice on the letterhead <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </Section>
  )
}

function ContactCard({
  icon: Icon,
  label,
  lines,
  href,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  lines: string[]
  href?: string
}) {
  const inner = (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ background: BRAND.blue }}>
        <Icon className="size-4.5 text-white" style={{ color: '#FFFFFF' }} />
      </span>
      <div className="min-w-0">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: BRAND.blue }}>
          {label}
        </p>
        {lines.map((line) => (
          <p key={line} className="mt-1 text-[11px] leading-snug" style={{ color: BRAND.ink }}>
            {line}
          </p>
        ))}
      </div>
    </div>
  )
  return href ? (
    <a href={href} className="block transition-transform hover:-translate-y-0.5">
      {inner}
    </a>
  ) : (
    inner
  )
}

// ─── Footer ──────────────────────────────────────────────────────────────────

function SiteFooter() {
  return (
    <footer style={{ background: BRAND.navy }}>
      <div className="mx-auto max-w-[1200px] px-6 py-12">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div className="max-w-[420px]">
            <AloLabsLogo size={40} tagline theme="dark" />
            <BrandRule width={150} className="mt-4 opacity-90" />
            <p className="mt-3 text-[12px] leading-relaxed text-white/70">
              {COMPANY.promise}
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-white/50">Platform</p>
              <ul className="mt-2 space-y-1.5">
                {SECTIONS.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="text-[12px] text-white/80 hover:text-white">
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-white/50">Company</p>
              <ul className="mt-2 space-y-1.5">
                <li>
                  <Link href="/brand" className="text-[12px] text-white/80 hover:text-white">
                    Brand &amp; system guideline
                  </Link>
                </li>
                <li>
                  <Link href="/invoice" className="text-[12px] text-white/80 hover:text-white">
                    Invoice on the letterhead
                  </Link>
                </li>
                <li>
                  <Link href="/design" className="text-[12px] text-white/80 hover:text-white">
                    Editorial design system
                  </Link>
                </li>
                <li>
                  <Link href="/login" className="text-[12px] text-white/80 hover:text-white">
                    Open AgentOS
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="max-w-[280px]">
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-white/50">Head office</p>
            <p className="mt-2 text-[12px] leading-relaxed text-white/80">
              {COMPANY.legalName} · {COMPANY.entity}
              <br />
              {COMPANY.address[0]}
              <br />
              {COMPANY.address[1]}
            </p>
            <p className="mt-2 font-mono text-[11px] text-white/80">
              {COMPANY.phone}
              <br />
              {COMPANY.email}
            </p>
          </div>
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/50">
            © {new Date().getFullYear()} {COMPANY.legalName} · {COMPANY.product} · {COMPANY.tagline}
          </p>
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/50">
            {COMPANY.domains.map((d) => d.value).join(' · ')}
          </p>
        </div>
      </div>
    </footer>
  )
}
