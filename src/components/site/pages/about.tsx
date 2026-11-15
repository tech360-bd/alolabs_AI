'use client'

/**
 * /site/about — the company page: vision, mission, engineering philosophy,
 * approach to responsible AI, quality and security principles, and the
 * long-term partnership approach. Company facts come from the letterhead
 * tokens — no invented founding dates, headcounts or achievements.
 */

import * as React from 'react'
import Link from 'next/link'
import { Badge, BrandRule } from '@/components/brand/alo-logo'
import { Button } from '@/components/ui/button'
import { BRAND, BRAND_FONTS, COMPANY, HEADLINE_STATS, USAGE_RULES } from '@/lib/brand/tokens'
import {
  ArrowRight, Compass, Handshake, Lightbulb, Scale, Search, ShieldCheck, Sparkles, Users, Zap,
} from 'lucide-react'
import { CtaBand, CheckList, PageHero, Pill, Section } from '@/components/site/chrome'

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

export function AboutPage() {
  return (
    <>
      <PageHero
        crumbs={[{ href: '/site/about', label: 'About' }]}
        eyebrow="About ALO Labs"
        title={<>A global AI &amp; software technology company.</>}
        lead={`ALO Labs designs and builds software, AI-powered solutions and connected digital platforms for businesses that take technology seriously. Headquartered in Harrisonville, Missouri, working with clients wherever they operate. ${COMPANY.promise}`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" className="gap-2" style={{ background: BRAND.orange }} asChild>
            <Link href="/site/contact">
              Start a Project <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/site/careers">Join us</Link>
          </Button>
        </div>
      </PageHero>

      {/* Vision & mission */}
      <Section eyebrow="Vision & mission" title="Why we exist.">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-8">
            <Pill tone="orange">Vision</Pill>
            <p className="mt-4 text-[17px] leading-relaxed" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
              A world where businesses of any size can use intelligent technology with confidence —
              systems that are engineered properly, behave predictably and stay accountable to the
              people who depend on them.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-8">
            <Pill tone="blue">Mission</Pill>
            <p className="mt-4 text-[17px] leading-relaxed" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
              To design, build and evolve software, AI solutions and digital platforms that solve
              real business problems — delivered with engineering discipline, honest communication
              and a partnership mindset that lasts beyond launch.
            </p>
          </div>
        </div>
      </Section>

      {/* Engineering philosophy */}
      <Section
        eyebrow="Engineering philosophy"
        title="Six rules we do not bend."
        lead="The principles behind every architecture decision, every review and every delivery."
        ground="canvas"
      >
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {PHILOSOPHY.map((v) => (
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

      {/* Responsible AI */}
      <Section eyebrow="Responsible AI" title="Intelligent, with guardrails." ground="navy" narrow>
        <p className="text-[14px] leading-relaxed text-white/75">
          AI creates value when it is applied carefully and governed honestly. Our approach to
          responsible AI is practical, and it applies to everything we build:
        </p>
        <div className="mt-8">
          <CheckList tone="white" items={RESPONSIBLE_AI} />
        </div>
      </Section>

      {/* Quality & security */}
      <Section eyebrow="Quality & security" title="How we keep systems dependable.">
        <div className="grid gap-5 md:grid-cols-2">
          {QUALITY_SECURITY.map((item) => (
            <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-7">
              <span className="flex size-11 items-center justify-center rounded-xl" style={{ background: 'rgba(232,80,26,0.10)', color: BRAND.orange }}>
                <ShieldCheck className="size-5" />
              </span>
              <h3 className="mt-4 text-[16px] font-semibold" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
                {item.title}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed" style={{ color: BRAND.gray }}>
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* Partnership */}
      <Section
        eyebrow="Long-term partnership"
        title="We plan for the years after launch."
        lead="The measure of our work is not the demo — it is whether the system is still serving your business, reliably, years later. That is why documentation, maintenance and honest roadmap advice are part of how we deliver, and why many of our relationships grow with each project."
        ground="canvas"
        narrow
      >
        <div className="flex flex-wrap items-center gap-6 rounded-2xl border border-slate-200 bg-white p-6">
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

      {/* Facts & offices */}
      <Section
        id="offices"
        eyebrow="Where we are"
        title="A US company working across borders."
        lead="Head office in Harrisonville, Missouri, serving clients wherever they operate."
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
          <div>
            <div className="grid gap-4 sm:grid-cols-2">
              {HEADLINE_STATS.map((stat) => (
                <div key={stat.label} className="rounded-xl border border-white/10 bg-white/5 p-5">
                  <p className="text-[26px] font-bold text-white" style={{ fontFamily: BRAND_FONTS.secondary.stack }}>
                    {stat.value}
                  </p>
                  <p className="mt-1 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-white/55">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <CheckList
                tone="white"
                items={[
                  'The people who own the outcome stay in command — automation answers to them.',
                  'Specified work beats improvised work.',
                  'Every capability ships with its audit trail.',
                  'We build what we would want to operate ourselves.',
                ]}
              />
            </div>
          </div>
        </div>
      </Section>

      <CtaBand
        title="Let's build something that lasts."
        lead="If you are looking for a technology partner who takes quality as seriously as you do — we should talk."
      />
    </>
  )
}
