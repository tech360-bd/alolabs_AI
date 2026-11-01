'use client'

/**
 * /site/solutions — the services catalogue: six numbered service lines, the
 * delivery process, the industries served and the questions buyers ask.
 * Structured after the reference agency sites: numbered cards with concrete
 * deliverables and a per-line call to action.
 */

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { BRAND, BRAND_FONTS } from '@/lib/brand/tokens'
import {
  ArrowRight,
  Bot,
  GraduationCap,
  MessageSquare,
  PenTool,
  PhoneCall,
  Workflow,
} from 'lucide-react'
import {
  CtaBand,
  FaqList,
  NumberedCard,
  PageHero,
  Pill,
  Section,
  type FaqItem,
} from '@/components/site/chrome'

const SERVICES = [
  {
    icon: Bot,
    title: 'AI agents & workforce automation',
    body: 'Departments of specified AI agents that take real work off your team: reports, follow-ups, data entry, research and operations — inside an approval gate.',
    items: [
      'Agent specification & registry build-out',
      'Workflow automation with human approvals',
      'Command centre & operations dashboards',
      'Audit trails and QA rules per department',
    ],
    anchor: 'automation',
  },
  {
    icon: Workflow,
    title: 'CRM & marketing automation',
    body: 'Lead capture, enrichment, scoring and nurture wired into your CRM — with AI marketing campaigns, SEO content and reporting running as scheduled agent work.',
    items: [
      'CRM implementation & pipeline design',
      'Lead enrichment & scoring (n8n / AgentOS)',
      'Email, SMS and social campaign automation',
      'Attribution dashboards and weekly reports',
    ],
    anchor: 'crm',
  },
  {
    icon: GraduationCap,
    title: 'Education & student operations',
    body: 'Student recruitment, applications, compliance and pastoral operations for consultancies and institutions — UKVI-aware workflows included.',
    items: [
      'Applicant pipelines & document checks',
      'UKVI / compliance workflow automation',
      'Agent-led student support & enquiries',
      'Partner and institution portals',
    ],
    anchor: 'education',
  },
  {
    icon: PhoneCall,
    title: 'Voice, SMS & communications',
    body: 'AI call-centre and telephony integrations: inbound routing, call intelligence, SMS automation and VoIP — connected to the same agent workforce.',
    items: [
      'AI call-centre intelligence',
      'SMS gateways & automated follow-up',
      'VoIP / SIP integration',
      'Conversation logging into the CRM',
    ],
    anchor: 'comms',
  },
  {
    icon: PenTool,
    title: 'Knowledge, content & media',
    body: 'Hybrid RAG over your own corpus, editorial diagram generation, AI video and image pipelines — everything your teams publish, grounded in your data.',
    items: [
      'Hybrid RAG (classic · graph · agentic)',
      'Editorial diagram & report generation',
      'AI image / video / caption pipelines',
      'Marketing kit & brand system production',
    ],
    anchor: 'knowledge',
  },
  {
    icon: MessageSquare,
    title: 'Custom AI products & integrations',
    body: 'When the need is a product, not a service: multi-tenant SaaS, internal platforms, API integrations and white-label AI assistants engineered to last.',
    items: [
      'SaaS & multi-tenant product engineering',
      'LLM applications & tool-calling agents',
      'Data pipelines & system integrations',
      'Long-term support and evolution',
    ],
    anchor: 'products',
  },
]

const PROCESS = [
  {
    step: '1',
    title: 'Assess',
    body: 'We map your departments, workflows, data and risk surface — and agree what the agents should and should not do.',
  },
  {
    step: '2',
    title: 'Design',
    body: 'Agent specifications, workflows, approval rules and integrations are designed as a system, with diagrams and a rollout plan.',
  },
  {
    step: '3',
    title: 'Deploy',
    body: 'We stand up the command centre, provision the agent workforce and integrate your tools — in your cloud or ours.',
  },
  {
    step: '4',
    title: 'Run',
    body: 'Agents work inside the approval gate while you watch the dashboards. We tune, report and extend department by department.',
  },
]

const INDUSTRIES = [
  { title: 'Education & study abroad', note: 'Recruitment, applications, compliance, student success' },
  { title: 'Professional services', note: 'Proposals, research, reporting, client operations' },
  { title: 'Trading & distribution', note: 'Orders, collections, inventory, supplier follow-up' },
  { title: 'SaaS & technology', note: 'Support, onboarding, growth marketing, product ops' },
  { title: 'Real estate & construction', note: 'Lead handling, site reporting, document workflows' },
  { title: 'Healthcare & clinics', note: 'Scheduling, patient follow-up, admin automation' },
  { title: 'Retail & e-commerce', note: 'Campaigns, catalogue ops, customer service' },
  { title: 'Finance & accounting', note: 'Bookkeeping workflows, reconciliation, reporting' },
]

const FAQS: FaqItem[] = [
  {
    q: 'Do we need to replace our existing tools?',
    a: 'No. AgentOS sits between your team and the tools they already use — CRM, email, sheets, telephony, storage — and automates the work across them. Integrations are the starting point, not a rip-and-replace.',
  },
  {
    q: 'What stops an agent from doing something harmful?',
    a: 'Every action passes the approval engine: risk scoring, policy checks and, for anything with an external side effect — spend, outbound messages, production changes — a human approval. Every hop is recorded in a tamper-evident audit log.',
  },
  {
    q: 'How long does a first deployment take?',
    a: 'A focused first department — one command centre, 10–40 agents, 2–4 workflows — typically goes live in 2–4 weeks. Broader workforce rollouts run department by department on a shared roadmap.',
  },
  {
    q: 'Can we start with a single department?',
    a: 'Yes, and that is the recommended path. Prove one department end to end — its agents, workflows, approvals and reporting — then extend the same pattern to the next.',
  },
  {
    q: 'Is our data used to train models?',
    a: 'No. Your data stays in your tenant: retrieval runs against your own corpus, model calls are routed through configured providers with your keys, and nothing is used to train third-party models.',
  },
  {
    q: 'How is this priced?',
    a: 'Platform subscription plus a deployment/implementation scope. Managed cloud and self-hosted options are both available — see the pricing page, or talk to us for a department-sized quote.',
  },
]

export function SolutionsPage() {
  return (
    <>
      <PageHero
        crumbs={[{ href: '/site/solutions', label: 'Solutions' }]}
        eyebrow="Services & automation"
        title={<>Six service lines. One accountable team.</>}
        lead="AI agents, CRM and marketing automation, education operations, communications, knowledge systems and custom AI products — designed, deployed and run by the people who build AgentOS."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" className="gap-2" style={{ background: BRAND.orange }} asChild>
            <Link href="/site/contact">
              Talk to an expert <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/site/work">See the work</Link>
          </Button>
        </div>
      </PageHero>

      <Section
        id="services"
        eyebrow="What we do"
        title="Services first, automation where it earns its place."
        lead="Each line stands on its own — take one, combine them later, with the same team and the same command centre underneath."
      >
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {SERVICES.map((service, i) => (
            <div key={service.title} id={service.anchor} className="scroll-mt-20">
              <NumberedCard
                index={String(i + 1).padStart(2, '0')}
                title={service.title}
                body={service.body}
                items={service.items}
                href="/site/contact"
                ctaLabel="Talk to an expert"
              />
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="process"
        eyebrow="How we deliver"
        title="Assess, design, deploy, run."
        lead="The same four steps on every engagement, whether it is one workflow or a hundred-department workforce."
        ground="canvas"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PROCESS.map((p) => (
            <div key={p.step} className="rounded-2xl border border-slate-200 bg-white p-6">
              <span
                className="flex size-10 items-center justify-center rounded-full text-[15px] font-bold text-white"
                style={{ background: BRAND.orange, fontFamily: BRAND_FONTS.secondary.stack }}
              >
                {p.step}
              </span>
              <h3 className="mt-4 text-[17px] font-semibold" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
                {p.title}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed" style={{ color: BRAND.gray }}>
                {p.body}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-2">
          {['Fixed-scope pilots', 'Department rollouts', 'Managed operations', 'Training & handover'].map((tag) => (
            <Pill key={tag} tone="orange">
              {tag}
            </Pill>
          ))}
        </div>
      </Section>

      <Section
        id="industries"
        eyebrow="Industries"
        title="Where the agents work today."
        lead="The platform is horizontal; the workflows are not. We bring industry-specific workflow libraries and tune the rest with you."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {INDUSTRIES.map((ind) => (
            <div key={ind.title} className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="text-[14px] font-semibold" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
                {ind.title}
              </h3>
              <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: BRAND.gray }}>
                {ind.note}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="faq" eyebrow="FAQ" title="Questions we often hear." lead="Can't find your answer? Our team replies within one business day." ground="canvas">
        <FaqList items={FAQS} />
      </Section>

      <CtaBand
        title="Tell us which department hurts most."
        lead="We will map it, propose the first agents to deploy against it, and show you the command centre running your workflow."
      />
    </>
  )
}
