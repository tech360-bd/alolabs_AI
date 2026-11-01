'use client'

/**
 * /site/about — the company page: what ALO Labs is, how it works, the numbers
 * on the letterhead, and where to find the team.
 */

import * as React from 'react'
import Link from 'next/link'
import { AloLabsLogo, Badge, BrandRule } from '@/components/brand/alo-logo'
import { Button } from '@/components/ui/button'
import { BRAND, BRAND_FONTS, COMPANY, HEADLINE_STATS, USAGE_RULES } from '@/lib/brand/tokens'
import { ArrowRight, Compass, Lightbulb, Scale, ShieldCheck, Users, Zap } from 'lucide-react'
import { CtaBand, CheckList, PageHero, Pill, Section } from '@/components/site/chrome'

const VALUES = [
  {
    icon: ShieldCheck,
    title: 'Secure by protocol',
    body: 'Approval before execution, tenant isolation, full audit trails. Security is a design constraint here, never a feature ticket.',
  },
  {
    icon: Scale,
    title: 'Automation with accountability',
    body: 'Every agent has a specification, a department and QA rules. If we cannot say what an agent does and how it is checked, it does not ship.',
  },
  {
    icon: Lightbulb,
    title: 'Intelligence where it earns its place',
    body: 'AI is measured, never bolted on. If a workflow is better as plain software, we build plain software.',
  },
  {
    icon: Users,
    title: 'Built with the operators',
    body: 'The people who run the department help design the agents. Adoption is a delivery metric, not an afterthought.',
  },
  {
    icon: Zap,
    title: 'Ship, then evolve',
    body: 'First department live in weeks, then compound: the workforce grows department by department on a shared roadmap.',
  },
  {
    icon: Compass,
    title: 'Long-horizon engineering',
    body: 'Architecture, data and infrastructure designed to hold up over years — with backups, monitoring and disaster recovery from day one.',
  },
]

const MILESTONES = [
  { year: '2023', title: 'The thesis', body: 'An operating system for AI agents — specified, routed, approved and audited — rather than another chatbot.' },
  { year: '2024', title: 'AgentOS core', body: 'Command centre, master router, agent registry, memory and the hybrid RAG engine running as one platform.' },
  { year: '2025', title: 'The workforce', body: '1020 agents across 100+ departments provisioned, verified and put to work inside the approval gate.' },
  { year: '2026', title: 'Open surfaces', body: 'The marketing kit, the editorial diagram system and the department playbooks published as part of the product.' },
]

export function AboutPage() {
  return (
    <>
      <PageHero
        crumbs={[{ href: '/site/about', label: 'About' }]}
        eyebrow="About ALO Labs"
        title={<>We build the operating system for AI work.</>}
        lead={`ALO Labs is a technology company headquartered in Harrisonville, Missouri. We build ${COMPANY.product} — ${COMPANY.tagline} — and we run AI departments for the teams who use it. ${COMPANY.promise}`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" className="gap-2" style={{ background: BRAND.orange }} asChild>
            <Link href="/site/contact">
              Talk to the team <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/site/careers">Join us</Link>
          </Button>
        </div>
      </PageHero>

      {/* Numbers on the letterhead */}
      <Section eyebrow="By the numbers" title="1 Command Center · 1020 AI Agents · 100+ Departments · Unlimited Possibilities.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HEADLINE_STATS.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-6">
              <p className="text-[32px] font-bold" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
                {stat.value}
              </p>
              <p className="mt-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: BRAND.gray }}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-6 rounded-2xl border border-slate-200 bg-white p-6">
          <Badge size={104} />
          <div className="max-w-[520px]">
            <p className="text-[15px] font-semibold" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
              {COMPANY.legalName} · {COMPANY.product}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: BRAND.gray }}>
              {COMPANY.promise} The badge is the mark we sign our work with — from the letterhead to the approval gate.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {USAGE_RULES.map((rule) => (
                <span key={rule.label} className="flex items-center gap-1.5">
                  <span className="size-3 rounded-full border border-slate-200" style={{ background: rule.swatch }} />
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: BRAND.gray }}>
                    {rule.label}
                  </span>
                </span>
              ))}
            </div>
          </div>
          <BrandRule width={140} className="hidden xl:block" />
        </div>
      </Section>

      {/* Story */}
      <Section
        eyebrow="Our story"
        title="From one command centre to a whole workforce."
        lead="The company was founded on a simple observation: teams do not need more AI demos, they need AI that does specified work, is checked before it acts, and can be audited after it does."
        ground="canvas"
      >
        <div className="grid gap-4 lg:grid-cols-4">
          {MILESTONES.map((m) => (
            <div key={m.year} className="rounded-2xl border border-slate-200 bg-white p-6">
              <p className="font-mono text-[11px] font-bold tracking-[0.2em]" style={{ color: BRAND.orange }}>
                {m.year}
              </p>
              <h3 className="mt-2.5 text-[16px] font-semibold" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
                {m.title}
              </h3>
              <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: BRAND.gray }}>
                {m.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* Values */}
      <Section id="values" eyebrow="How we work" title="Six rules we do not bend.">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {VALUES.map((v) => (
            <div key={v.title} className="rounded-2xl border border-slate-200 bg-white p-7">
              <span className="flex size-11 items-center justify-center rounded-xl" style={{ background: BRAND.tint }}>
                <v.icon className="size-5" style={{ color: BRAND.blue }} />
              </span>
              <h3 className="mt-4 text-[17px] font-semibold" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
                {v.title}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed" style={{ color: BRAND.gray }}>
                {v.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* Where we are */}
      <Section
        id="offices"
        eyebrow="Where we are"
        title="A US company with a global delivery bench."
        lead="Head office in Harrisonville, Missouri, with delivery teams working across time zones — and the four branded domains that carry the platform."
        ground="navy"
      >
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">Head office</p>
              <p className="mt-3 text-[15px] font-semibold text-white" style={{ fontFamily: BRAND_FONTS.secondary.stack }}>
                {COMPANY.legalName} · {COMPANY.entity}
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-white/75">
                {COMPANY.addressOneLine}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <a href={COMPANY.phoneHref} className="font-mono text-[12px] text-white/85 hover:text-white">
                  {COMPANY.phone}
                </a>
                <a href={COMPANY.emailHref} className="font-mono text-[12px] text-white/85 hover:text-white">
                  {COMPANY.email}
                </a>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {COMPANY.domains.map((d) => (
                <div key={d.value} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/50">{d.label}</p>
                  <p className="mt-1 font-mono text-[12px] font-semibold text-white/90">{d.value}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">What we believe</p>
            <div className="mt-4 space-y-2">
              <Pill tone="orange">Secure · Smart · Scalable</Pill>
            </div>
            <div className="mt-5">
              <CheckList
                tone="white"
                items={[
                  'The owner stays in command — automation answers to people.',
                  'Specified work beats improvised work, for agents as for humans.',
                  'Every capability ships with its audit trail.',
                  'Open surfaces — the brand kit, the diagram system, the playbooks — are part of the product.',
                  'We build what we would want to operate ourselves.',
                ]}
              />
            </div>
          </div>
        </div>
      </Section>

      <CtaBand
        title="Come build the operating system for AI work."
        lead="Whether you want to deploy it or help build it — we should talk."
      />
    </>
  )
}
