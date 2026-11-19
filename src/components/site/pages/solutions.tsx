'use client'

/**
 * /site/solutions — the nine solution areas ALO Labs delivers.
 *
 * Each area states the business problem, the solution we propose, the key
 * capabilities behind it and the value a client can expect — and is honestly
 * labelled: delivered today as a service, or available through project
 * engagement. No solution is presented as a finished product unless it is one.
 */

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { BRAND } from '@/lib/brand/public'
import {
  ArrowRight, Bot, Building2, Cloud, Code2, Globe, Layers3, MessageSquare,
  Smartphone, Workflow,
} from 'lucide-react'
import {
  CtaBand, FaqList, PageHero, Pill, Section, type FaqItem,
} from '@/components/site/chrome'

interface Solution {
  id: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties; size?: number }>
  title: string
  /** Honest availability label. */
  availability: 'Existing service' | 'Project engagement'
  problem: string
  solution: string
  capabilities: string[]
  value: string
}

const SOLUTIONS: Solution[] = [
  {
    id: 'ai-automation',
    icon: Bot,
    title: 'AI Solutions & Intelligent Automation',
    availability: 'Existing service',
    problem:
      'Skilled people spend hours on repetitive, rules-based work — data handling, follow-ups, reporting, document checks — that slows the business down and invites errors.',
    solution:
      'We identify the work worth automating, design AI-assisted workflows around your real processes and keep people in control: every automated step is scoped, reviewable and reversible.',
    capabilities: [
      'Process discovery and automation scoping',
      'AI-assisted data processing, research and reporting',
      'Human-in-the-loop review and approval steps',
      'Monitoring, logging and graceful failure handling',
    ],
    value:
      'Hours returned to your team each week, faster cycle times and fewer manual errors — with a clear audit trail of what was done.',
  },
  {
    id: 'custom-software',
    icon: Code2,
    title: 'Custom Software Development',
    availability: 'Project engagement',
    problem:
      'Off-the-shelf tools almost fit — but the last 20% forces your business to work around the software instead of the other way around.',
    solution:
      'We design and build software shaped around your operations: discovery and architecture first, then iterative engineering with reviews, tests and documentation throughout.',
    capabilities: [
      'Requirements discovery and solution architecture',
      'Web and service engineering with type-safe codebases',
      'Database design, migrations and data integrity',
      'Automated testing, code review and documentation',
    ],
    value:
      'Software that fits how your business actually works — owned by you, maintainable for years, and extensible as you grow.',
  },
  {
    id: 'web-platforms',
    icon: Globe,
    title: 'Web Applications & Digital Platforms',
    availability: 'Project engagement',
    problem:
      'Customer expectations for web products keep rising: fast, accessible, mobile-ready and trustworthy — while most business sites and tools lag behind.',
    solution:
      'We build modern web applications and digital platforms on proven foundations, with performance, accessibility and search visibility treated as release criteria.',
    capabilities: [
      'Marketing sites, product portals and web applications',
      'Design systems and responsive component libraries',
      'Performance, accessibility and SEO engineering',
      'Content workflows and analytics integration',
    ],
    value:
      'A web presence that loads fast, converts visitors and scales with your roadmap instead of being rebuilt every two years.',
  },
  {
    id: 'mobile',
    icon: Smartphone,
    title: 'Mobile Application Development',
    availability: 'Project engagement',
    problem:
      'Your customers and teams live on their phones — but your services stop at the desktop browser.',
    solution:
      'We extend your products and operations to mobile — planning the right approach for your case, from responsive web apps to native-quality mobile experiences connected to your existing systems.',
    capabilities: [
      'Mobile product planning and UX design',
      'Cross-platform application development',
      'API and system integration with your back office',
      'Release management and post-launch iteration',
    ],
    value:
      'Your services available wherever your users are — with one connected data model behind every screen.',
  },
  {
    id: 'business-systems',
    icon: Building2,
    title: 'Business Systems & CRM',
    availability: 'Existing service',
    problem:
      'Customer and operational data is scattered across spreadsheets, inboxes and disconnected tools — so nobody sees the whole picture.',
    solution:
      'We implement and customise CRM and business systems around your processes: clean data, clear pipelines, and the reporting your team needs to act with confidence.',
    capabilities: [
      'CRM implementation, migration and pipeline design',
      'Lead capture, enrichment and scoring workflows',
      'Operational dashboards and reporting',
      'Marketing automation and campaign tooling',
    ],
    value:
      'One source of truth for customers and operations — better follow-up, better forecasting and less time reconciling tools.',
  },
  {
    id: 'workflow-integrations',
    icon: Workflow,
    title: 'Workflow Automation & Integrations',
    availability: 'Existing service',
    problem:
      'The tools you use do not talk to each other, so people become the integration layer — copying data, chasing approvals and re-keying information.',
    solution:
      'We connect your systems and automate the hand-offs between them: scheduled jobs, event-driven workflows and integration layers designed for reliability and observability.',
    capabilities: [
      'System integration and API engineering',
      'Workflow automation with approvals and notifications',
      'Scheduled and event-driven job pipelines',
      'Error handling, retry logic and monitoring',
    ],
    value:
      'Fewer manual hand-offs, faster end-to-end processes and a technology stack that behaves like one system.',
  },
  {
    id: 'portals-saas',
    icon: Layers3,
    title: 'Client Portals & SaaS Platforms',
    availability: 'Project engagement',
    problem:
      'Serving clients well means giving them secure self-service — but building a multi-user platform is a serious engineering commitment.',
    solution:
      'We design and build portals and SaaS products end to end: onboarding, role-based access, dashboards, billing flows and the operational tooling behind them. Our own client portal is built and run on this foundation.',
    capabilities: [
      'Multi-tenant architecture and access control',
      'Onboarding, accounts and role-based permissions',
      'Dashboards, notifications and document delivery',
      'Billing, invoicing and support workflows',
    ],
    value:
      'A professional client experience that scales your service without scaling your admin — with security designed in from day one.',
  },
  {
    id: 'cloud-infrastructure',
    icon: Cloud,
    title: 'Cloud & Infrastructure Engineering',
    availability: 'Project engagement',
    problem:
      'Great software fails on weak foundations: brittle deployments, no monitoring, slow recovery and security bolted on afterwards.',
    solution:
      'We engineer the infrastructure around your software — repeatable deployments, environment parity, monitoring, backups and recovery plans that are tested, not assumed.',
    capabilities: [
      'Cloud architecture and containerised deployments',
      'CI/CD pipelines and environment management',
      'Monitoring, alerting and log aggregation',
      'Backups, disaster recovery and security hardening',
    ],
    value:
      'Systems that deploy safely, recover quickly and give your team — and your auditors — real confidence.',
  },
  {
    id: 'ai-customer-experience',
    icon: MessageSquare,
    title: 'AI-assisted Customer Experience',
    availability: 'Project engagement',
    problem:
      'Customer conversations multiply across channels while response quality drops — and generic chatbots frustrate more than they help.',
    solution:
      'We build AI-assisted support, voice and messaging experiences where the AI handles the routine and your team handles what matters — with clean hand-offs and full conversation context.',
    capabilities: [
      'AI-assisted support chat and knowledge search',
      'Voice and messaging automation with human hand-off',
      'Conversation logging into your CRM and helpdesk',
      'Quality monitoring and continuous improvement',
    ],
    value:
      'Faster, more consistent customer responses at any hour — without losing the human judgement your brand depends on.',
  },
]

const ENGAGEMENT_STEPS = [
  { n: '01', title: 'Tell us the problem', body: 'A short conversation about your business, the outcome you want and the constraints we should design around.' },
  { n: '02', title: 'Receive a clear scope', body: 'We propose the approach, deliverables and commercial model — fixed scope, retainer or phased project.' },
  { n: '03', title: 'Approve and start', body: 'Work begins once you approve the scope. You follow progress in your client portal at every step.' },
]

const FAQS: FaqItem[] = [
  {
    q: 'How do I know which solution area fits my situation?',
    a: 'You do not need to. Describe the business problem in your own words and we will propose the right combination of solution areas — most engagements span two or three.',
  },
  {
    q: 'Are these finished products or custom work?',
    a: 'Both exist. Business automation, CRM and workflow work are delivered as established services. Portals, custom software and mobile applications are delivered as scoped projects built for you. Every page label states which is which.',
  },
  {
    q: 'Can you work with our existing systems and vendors?',
    a: 'Yes. Most of our work integrates with tools you already run. We document every integration point and keep your existing vendors in the loop where needed.',
  },
  {
    q: 'What does an engagement cost?',
    a: 'It depends on scope. Small automation work can start in the low thousands; platform builds are phased with clear milestones. You receive a quotation before anything starts — and budget guidance is welcome in the first conversation.',
  },
  {
    q: 'Who owns what you build?',
    a: 'You do. Deliverables, code and documentation produced for your project are yours on delivery, as defined in the agreed scope and our terms.',
  },
]

function SolutionBlock({ solution, index }: { solution: Solution; index: number }) {
  const Icon = solution.icon
  const even = index % 2 === 0
  return (
    <article
      id={solution.id}
      className="grid scroll-mt-24 gap-8 rounded-2xl border border-slate-200 bg-white p-8 lg:grid-cols-[0.9fr_1.1fr] lg:p-10"
    >
      <div>
        <div className="flex items-center gap-3">
          <span
            className="flex size-11 items-center justify-center rounded-xl"
            style={{ background: even ? 'rgba(255,106,0,0.10)' : BRAND.tint, color: even ? BRAND.orange : BRAND.blue }}
          >
            <Icon size={20} />
          </span>
          <span className="font-mono text-[11px] font-bold tracking-[0.18em]" style={{ color: BRAND.graySoft }}>
            {String(index + 1).padStart(2, '0')} / 09
          </span>
        </div>
        <h3 className="mt-5 text-[22px] font-bold leading-snug" style={{ color: BRAND.blue }}>
          {solution.title}
        </h3>
        <div className="mt-3">
          <Pill tone={solution.availability === 'Existing service' ? 'blue' : 'orange'}>{solution.availability}</Pill>
        </div>
        <div className="mt-6">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: BRAND.orangeInk }}>
            The business problem
          </p>
          <p className="mt-2 text-[13px] leading-relaxed" style={{ color: BRAND.gray }}>
            {solution.problem}
          </p>
        </div>
        <div className="mt-6">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: BRAND.orangeInk }}>
            Expected business value
          </p>
          <p className="mt-2 text-[13px] leading-relaxed" style={{ color: BRAND.ink }}>
            {solution.value}
          </p>
        </div>
      </div>
      <div className="flex flex-col">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: BRAND.blue }}>
            Our proposed solution
          </p>
          <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: BRAND.gray }}>
            {solution.solution}
          </p>
        </div>
        <div className="mt-6">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: BRAND.blue }}>
            Key capabilities
          </p>
          <ul className="mt-3 grid gap-2">
            {solution.capabilities.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-[12.5px] leading-relaxed" style={{ color: BRAND.ink }}>
                <span className="mt-[7px] size-[5px] shrink-0 rounded-full" style={{ background: BRAND.orange }} />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-6 flex-1" />
        <Link
          href="/site/contact"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold"
          style={{ color: BRAND.orange }}
        >
          Discuss this solution <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </article>
  )
}

export function SolutionsPage() {
  return (
    <>
      <PageHero
        crumbs={[{ href: '/site/solutions', label: 'Solutions' }]}
        eyebrow="Solutions"
        title={<>Nine ways we solve real business problems.</>}
        lead="Every ALO Labs solution starts with a business problem and ends with measurable value — delivered as an established service or as a project built for you. Here is exactly what each one covers."
      >
        <div className="flex flex-wrap gap-2">
          <Pill tone="blue">Existing service</Pill>
          <Pill tone="orange">Project engagement</Pill>
          <Pill tone="plain">Honest labels, always</Pill>
        </div>
      </PageHero>

      <Section
        eyebrow="The solution areas"
        title="Problem → solution → capabilities → value."
        lead="Each block below follows the same structure, so you can compare offers like a buyer should — on substance."
      >
        <div className="space-y-6">
          {SOLUTIONS.map((solution, index) => (
            <SolutionBlock key={solution.id} solution={solution} index={index} />
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Project engagement"
        title="How a project starts."
        lead="Whether it is an established service or a custom build, the way in is the same: a conversation, a clear scope and your approval before anything begins."
        ground="canvas"
      >
        <div className="grid gap-4 md:grid-cols-3">
          {ENGAGEMENT_STEPS.map((step) => (
            <div key={step.n} className="rounded-2xl border border-slate-200 bg-white p-6">
              <span className="font-mono text-[12px] font-bold tracking-[0.18em]" style={{ color: BRAND.orange }}>
                {step.n}
              </span>
              <h3 className="mt-3 text-[16px] font-semibold" style={{ color: BRAND.blue }}>
                {step.title}
              </h3>
              <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: BRAND.gray }}>
                {step.body}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-8">
          <Button size="lg" className="gap-2" style={{ background: BRAND.orange }} asChild>
            <Link href="/site/contact">
              Start a Project <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </Section>

      <Section eyebrow="Buyer questions" title="Straight answers." narrow>
        <FaqList items={FAQS} />
      </Section>

      <CtaBand />
    </>
  )
}
