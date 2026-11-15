'use client'

/**
 * /site/how-we-work — the ALO Labs delivery process: five stages from discovery
 * to continuous improvement, the principles behind them, and what clients see
 * at each step. No promised timelines we cannot stand behind.
 */

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { BRAND } from '@/lib/brand/tokens'
import { ArrowRight, Compass, FileCheck2, LifeBuoy, PenTool, Rocket } from 'lucide-react'
import { CtaBand, FaqList, PageHero, Section, type FaqItem } from '@/components/site/chrome'

const STAGES = [
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

const PRINCIPLES = [
  { title: 'Scope before billing', body: 'You approve what will be delivered, and what it costs, before billable work starts.' },
  { title: 'Review before delivery', body: 'Every deliverable is checked internally before it reaches you — and nothing is final until you approve it.' },
  { title: 'Communication is part of the work', body: 'Clear status, early warnings and honest answers are delivery requirements, not extras.' },
  { title: 'No unrealistic promises', body: 'We plan timelines from real capacity and evidence. If something is uncertain, we say so.' },
]

const FAQS: FaqItem[] = [
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

export function HowWeWorkPage() {
  return (
    <>
      <PageHero
        crumbs={[{ href: '/site/how-we-work', label: 'How we work' }]}
        eyebrow="How we work"
        title={<>A delivery process built for accountability.</>}
        lead="Five stages, repeated with discipline on every engagement — from the first discovery conversation to continuous improvement after launch. Here is exactly what happens, and what you see at each step."
      />

      <Section
        eyebrow="The process"
        title="Five stages, start to finish."
        lead="Every project is different; the discipline behind delivery is not."
      >
        <div className="space-y-6">
          {STAGES.map((stage) => {
            const Icon = stage.icon
            return (
              <article key={stage.n} className="grid gap-8 rounded-2xl border border-slate-200 bg-white p-8 lg:grid-cols-[0.85fr_1.15fr]">
                <div>
                  <div className="flex items-center gap-3">
                    <span
                      className="flex size-11 items-center justify-center rounded-xl"
                      style={{ background: 'rgba(232,80,26,0.10)', color: BRAND.orange }}
                    >
                      <Icon size={20} />
                    </span>
                    <span className="font-mono text-[13px] font-bold tracking-[0.2em]" style={{ color: BRAND.orange }}>
                      {stage.n}
                    </span>
                  </div>
                  <h3 className="mt-4 text-[21px] font-bold" style={{ color: BRAND.blue }}>{stage.title}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed italic" style={{ color: BRAND.gray }}>{stage.lead}</p>
                </div>
                <div>
                  <p className="text-[13.5px] leading-relaxed" style={{ color: BRAND.gray }}>{stage.body}</p>
                  <p className="mt-5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: BRAND.orange }}>
                    What you see
                  </p>
                  <ul className="mt-2.5 grid gap-1.5">
                    {stage.youSee.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-[12px]" style={{ color: BRAND.ink }}>
                        <span className="mt-[7px] size-[5px] shrink-0 rounded-full" style={{ background: BRAND.blue }} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            )
          })}
        </div>
      </Section>

      <Section eyebrow="Delivery principles" title="The rules we hold ourselves to." ground="navy" narrow>
        <div className="grid gap-10 sm:grid-cols-2">
          {PRINCIPLES.map((p) => (
            <div key={p.title}>
              <h3 className="text-[16px] font-semibold text-white">{p.title}</h3>
              <p className="mt-2 text-[12.5px] leading-relaxed text-white/70">{p.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-10">
          <Button size="lg" className="gap-2" style={{ background: BRAND.orange }} asChild>
            <Link href="/site/contact">
              Start a Project <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </Section>

      <Section eyebrow="Process questions" title="Asked before signing." narrow>
        <FaqList items={FAQS} />
      </Section>

      <CtaBand />
    </>
  )
}
