'use client'

/**
 * /site/careers — how we work, the open roles and how to apply. The reference
 * sites keep careers short, honest and one mailto away; so do we.
 */

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { BRAND, BRAND_FONTS, COMPANY } from '@/lib/brand/tokens'
import { ArrowRight, HeartHandshake, Laptop, Rocket, Sparkles } from 'lucide-react'
import { CtaBand, CheckList, PageHero, Pill, Section } from '@/components/site/chrome'

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
    body: 'Agents, RAG, automation and an internal platform that is itself built with the AI systems we sell.',
  },
  {
    icon: HeartHandshake,
    title: 'Ownership & growth',
    body: 'Small teams, direct customer contact, and a budget for the courses, conferences and kit you need.',
  },
]

const ROLES = [
  {
    title: 'Senior Full-Stack Engineer (Next.js / TypeScript)',
    location: 'Remote · UTC−6 to UTC+3',
    type: 'Full-time',
    body: 'Own features end to end across the AgentOS surface: command centre, agent registry, approval flows and the APIs underneath.',
  },
  {
    title: 'AI Automation Engineer (LLM apps & agents)',
    location: 'Remote',
    type: 'Full-time',
    body: 'Design agent specifications, tool-calling loops and RAG pipelines that behave predictably inside the approval gate.',
  },
  {
    title: 'Solutions Engineer / Implementation Lead',
    location: 'Remote · travel optional',
    type: 'Full-time',
    body: 'Run department assessments, design workflows with operators and take first deployments live with the customer watching.',
  },
  {
    title: 'Product Designer (systems & editorial)',
    location: 'Remote',
    type: 'Full-time / contract',
    body: 'Keep the command centre, the marketing surfaces and the editorial diagram system at the standard of the brand book.',
  },
  {
    title: 'Open application',
    location: 'Remote',
    type: 'Any',
    body: 'Do not see your role? If you can help us build the operating system for AI work, write to us anyway.',
  },
]

export function CareersPage() {
  return (
    <>
      <PageHero
        crumbs={[{ href: '/site/careers', label: 'Careers' }]}
        eyebrow="Careers"
        title={<>Build the operating system for AI work.</>}
        lead="We are a small, senior team shipping a platform that puts 1020 AI agents to work inside real companies. If that sounds like the kind of problem you want to spend years on, come talk to us."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" className="gap-2" style={{ background: BRAND.orange }} asChild>
            <a href={`${COMPANY.emailHref}?subject=Application%20—%20ALO%20Labs`}>
              Send your application <ArrowRight className="size-4" />
            </a>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/site/about">How we work</Link>
          </Button>
        </div>
      </PageHero>

      <Section eyebrow="Life at ALO Labs" title="What working here is like." ground="canvas">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {BENEFITS.map((b) => (
            <div key={b.title} className="rounded-2xl border border-slate-200 bg-white p-6">
              <span className="flex size-11 items-center justify-center rounded-xl" style={{ background: BRAND.tint }}>
                <b.icon className="size-5" style={{ color: BRAND.blue }} />
              </span>
              <h3 className="mt-4 text-[16px] font-semibold" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
                {b.title}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed" style={{ color: BRAND.gray }}>
                {b.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="roles" eyebrow="Open roles" title="Where we need people now.">
        <div className="space-y-4">
          {ROLES.map((role) => (
            <div key={role.title} className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-[640px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone="orange">{role.type}</Pill>
                    <Pill>{role.location}</Pill>
                  </div>
                  <h3 className="mt-3 text-[17px] font-semibold" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
                    {role.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed" style={{ color: BRAND.gray }}>
                    {role.body}
                  </p>
                </div>
                <Button className="gap-2" style={{ background: BRAND.orange }} asChild>
                  <a href={`${COMPANY.emailHref}?subject=${encodeURIComponent('Application — ' + role.title)}`}>
                    Apply <ArrowRight className="size-4" />
                  </a>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="How we hire"
        title="Four steps, no homework marathons."
        ground="canvas"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { step: '1', title: 'Write to us', body: 'A short note about what you have shipped and what you want to work on. CV or portfolio link welcome.' },
            { step: '2', title: 'Conversation', body: 'A 45-minute call with the people you would work with — about the work, not brain teasers.' },
            { step: '3', title: 'Paid work session', body: 'A scoped, paid exercise on a real problem from our backlog. Nothing speculative.' },
            { step: '4', title: 'Offer & start', body: 'References, terms, a clear 30-60-90 plan — and your first ship date in the calendar.' },
          ].map((item) => (
            <div key={item.step} className="rounded-2xl border border-slate-200 bg-white p-6">
              <span
                className="flex size-10 items-center justify-center rounded-full text-[15px] font-bold text-white"
                style={{ background: BRAND.orange, fontFamily: BRAND_FONTS.secondary.stack }}
              >
                {item.step}
              </span>
              <h3 className="mt-4 text-[16px] font-semibold" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
                {item.title}
              </h3>
              <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: BRAND.gray }}>
                {item.body}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-[13px] font-semibold" style={{ color: BRAND.ink }}>
            What we look for, in every role:
          </p>
          <div className="mt-3">
            <CheckList
              items={[
                'You have shipped things real people use — and can tell the story of what broke and what you learned.',
                'You write clearly. Most of this company runs on written specifications.',
                'You care about the boring parts: tests, audits, backups, handovers.',
                'You are comfortable with AI tooling and honest about where it fails.',
              ]}
            />
          </div>
        </div>
      </Section>

      <CtaBand
        title="Engineer looking for your next mission?"
        lead={`Send your CV and a few lines about what you want to build to ${COMPANY.email} — we reply to every application.`}
      />
    </>
  )
}
