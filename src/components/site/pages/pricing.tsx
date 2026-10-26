'use client'

/**
 * /site/pricing — plans, deployment options and the questions procurement
 * asks. Tiers map to how the platform is actually sold: a managed starter for
 * one department, enterprise for the full workforce, and self-hosted for
 * regulated deployments.
 */

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { BRAND, BRAND_FONTS, COMPANY } from '@/lib/brand/tokens'
import { ArrowRight, Check, Cloud, Server, Sparkles } from 'lucide-react'
import {
  CtaBand,
  CheckList,
  FaqList,
  PageHero,
  Pill,
  Section,
  type FaqItem,
} from '@/components/site/chrome'

const TIERS = [
  {
    name: 'Starter',
    icon: Sparkles,
    price: 'From $1,500',
    unit: '/ month',
    note: 'One department, managed cloud',
    body: 'For a team that wants one department automated end to end — command centre, agents, workflows and approvals included.',
    features: [
      '1 department · up to 40 specified agents',
      'Command centre & run dashboards',
      'Hybrid RAG over your documents',
      'Approval engine with standard policy pack',
      'Email + chat support',
    ],
    cta: 'Start a pilot',
    featured: false,
  },
  {
    name: 'Enterprise',
    icon: Cloud,
    price: 'Custom',
    unit: 'annual agreement',
    note: 'The full AgentOS workforce',
    body: 'The complete operating system: 100+ departments, 1020 agents, SSO, dedicated environments, SLAs and a named delivery team.',
    features: [
      'Unlimited departments & agent workforce',
      'SSO, RBAC, API keys, custom policy packs',
      'CRM, marketing, voice/SMS, media pipelines',
      'Dedicated success engineer & SLA',
      'Quarterly business reviews and roadmap',
    ],
    cta: 'Talk to sales',
    featured: true,
  },
  {
    name: 'Self-hosted',
    icon: Server,
    price: 'Custom',
    unit: 'licence + support',
    note: 'Your cloud or your rack',
    body: 'For regulated and data-resident deployments: the full platform in your environment, with our delivery and support behind it.',
    features: [
      'Full platform in your VPC / data centre',
      'MySQL, Redis, S3-compatible storage of your choice',
      'Your identity provider and key management',
      'Air-gapped options with offline model runtimes',
      'Upgrade & security patch programme',
    ],
    cta: 'Discuss deployment',
    featured: false,
  },
]

const DEPLOYMENT_ROWS = [
  { label: 'Managed cloud (ALO)', starter: true, enterprise: true, selfhost: false },
  { label: 'Customer VPC / on-prem', starter: false, enterprise: true, selfhost: true },
  { label: 'SSO / SAML', starter: false, enterprise: true, selfhost: true },
  { label: 'Custom approval policies', starter: false, enterprise: true, selfhost: true },
  { label: 'Voice / SMS / media pipelines', starter: false, enterprise: true, selfhost: true },
  { label: 'SLA & named engineer', starter: false, enterprise: true, selfhost: true },
  { label: 'Air-gapped deployment', starter: false, enterprise: false, selfhost: true },
]

const FAQS: FaqItem[] = [
  {
    q: 'What counts as a department?',
    a: 'A department is the routing and ownership unit — Marketing, Finance, Student Ops, Website, CRM. Each department owns its agents, workflows and approval rules, and is priced and staffed independently.',
  },
  {
    q: 'Are there per-agent or per-token fees?',
    a: 'Plans include the agent workforce for the departments you deploy. Model usage is metered at cost through your own provider keys or ours, with budget caps and usage reporting per company.',
  },
  {
    q: 'What does implementation cost?',
    a: 'A first-department deployment is a fixed scope — typically 2–4 weeks — quoted after the assessment. Broader rollouts are planned department by department against a shared roadmap.',
  },
  {
    q: 'Can we move between plans?',
    a: 'Yes. Start with one department on Starter, expand into Enterprise when the second and third departments come online, or move to self-hosted when your compliance posture requires it.',
  },
  {
    q: 'Do you offer pilots?',
    a: 'Yes. A fixed-scope pilot proves one workflow end to end inside the approval gate — with your data, your tools and your team watching the dashboards.',
  },
]

function Tick({ on }: { on: boolean }) {
  return on ? (
    <Check className="size-4" style={{ color: BRAND.orange }} />
  ) : (
    <span className="block size-4 rounded-full border border-slate-300" aria-label="not included" />
  )
}

export function PricingPage() {
  return (
    <>
      <PageHero
        crumbs={[{ href: '/site/pricing', label: 'Pricing' }]}
        eyebrow="Pricing & deployment"
        title={<>Start with one department. Scale to the whole workforce.</>}
        lead="Transparent tiers for the way AgentOS is actually bought: a managed pilot to prove value, an enterprise agreement for the full workforce, and a self-hosted licence for regulated environments."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" className="gap-2" style={{ background: BRAND.orange }} asChild>
            <Link href="/site/contact">
              Get a department-sized quote <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Pill tone="plain">No per-seat fees for your human team</Pill>
        </div>
      </PageHero>

      <Section eyebrow="Plans" title="Three ways to run AgentOS.">
        <div className="grid gap-5 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`flex flex-col rounded-2xl border p-7 ${
                tier.featured ? 'border-transparent shadow-xl ring-2' : 'border-slate-200 bg-white'
              }`}
              style={tier.featured ? { background: BRAND.navy, ['--tw-ring-color' as string]: BRAND.orange } : undefined}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex size-10 items-center justify-center rounded-xl"
                    style={{ background: tier.featured ? 'rgba(255,106,0,0.18)' : BRAND.tint }}
                  >
                    <tier.icon className="size-5" style={{ color: tier.featured ? '#FF8A2B' : BRAND.blue }} />
                  </span>
                  <h3
                    className="text-[18px] font-semibold"
                    style={{ color: tier.featured ? '#FFFFFF' : BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}
                  >
                    {tier.name}
                  </h3>
                </div>
                {tier.featured ? <Pill tone="orange">Most capable</Pill> : null}
              </div>
              <p className="mt-5 text-[26px] font-bold" style={{ color: tier.featured ? '#FFFFFF' : BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
                {tier.price}{' '}
                <span className="text-[12px] font-medium" style={{ color: tier.featured ? 'rgba(255,255,255,0.6)' : BRAND.graySoft }}>
                  {tier.unit}
                </span>
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: tier.featured ? 'rgba(255,255,255,0.6)' : BRAND.gray }}>
                {tier.note}
              </p>
              <p className="mt-4 text-[13px] leading-relaxed" style={{ color: tier.featured ? 'rgba(255,255,255,0.75)' : BRAND.gray }}>
                {tier.body}
              </p>
              <div className="mt-5">
                <CheckList tone={tier.featured ? 'white' : 'orange'} items={tier.features} />
              </div>
              <div className="mt-7 flex-1" />
              <Button
                size="lg"
                className="gap-2"
                style={tier.featured ? { background: BRAND.orange } : undefined}
                variant={tier.featured ? 'default' : 'outline'}
                asChild
              >
                <Link href="/site/contact">
                  {tier.cta} <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Deployment matrix"
        title="What each option includes."
        lead="Every plan runs the same AgentOS core. The difference is where it runs, who operates it and how deep the integrations go."
        ground="canvas"
      >
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-6 py-4 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: BRAND.gray }}>
                  Capability
                </th>
                {['Starter', 'Enterprise', 'Self-hosted'].map((h) => (
                  <th key={h} className="px-6 py-4 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: BRAND.blue }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DEPLOYMENT_ROWS.map((row) => (
                <tr key={row.label} className="border-b border-slate-100 last:border-0">
                  <td className="px-6 py-3.5 text-[13px]" style={{ color: BRAND.ink }}>
                    {row.label}
                  </td>
                  <td className="px-6 py-3.5">
                    <Tick on={row.starter} />
                  </td>
                  <td className="px-6 py-3.5">
                    <Tick on={row.enterprise} />
                  </td>
                  <td className="px-6 py-3.5">
                    <Tick on={row.selfhost} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-[11px]" style={{ color: BRAND.graySoft }}>
          Model usage is metered at cost through your own provider keys or ours. Every plan includes the approval
          engine, the audit trail and tenant isolation — {COMPANY.promise}
        </p>
      </Section>

      <Section id="faq" eyebrow="FAQ" title="Procurement questions, answered." ground="white">
        <FaqList items={FAQS} />
      </Section>

      <CtaBand
        title="Get a quote shaped like your organisation."
        lead="Tell us your departments and volumes; we will come back with a fixed pilot scope and a rollout plan."
      />
    </>
  )
}
