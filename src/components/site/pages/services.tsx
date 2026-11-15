'use client'

/**
 * /site/services — how ALO Labs delivers: the service experience, what you
 * receive, the engagement models we work in and how pricing conversations
 * start. Complements /site/solutions (what we solve) and /site/how-we-work
 * (the delivery process).
 */

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { BRAND } from '@/lib/brand/tokens'
import { ArrowRight, Check, FileText, Handshake, Layers3, Repeat, Settings2 } from 'lucide-react'
import {
  CtaBand, CheckList, FaqList, NumberedCard, PageHero, Section, type FaqItem,
} from '@/components/site/chrome'

const DELIVERABLES = [
  {
    icon: FileText,
    title: 'Written scope & architecture',
    body: 'Every engagement starts with a scope you can hold us to: objectives, deliverables, assumptions and the architecture behind them.',
  },
  {
    icon: Settings2,
    title: 'Built, tested software',
    body: 'Working software — code, configuration, integrations — with automated tests and verification before anything reaches you.',
  },
  {
    icon: Layers3,
    title: 'Documentation & handover',
    body: 'System documentation, admin guides and a structured handover so your team is never locked in or left guessing.',
  },
  {
    icon: Repeat,
    title: 'Ongoing improvement',
    body: 'Maintenance, monitoring and enhancement after launch — agreed at the level your business needs, not oversold.',
  },
]

const MODELS = [
  {
    index: '01',
    title: 'Project engagement',
    body: 'A defined outcome delivered against an agreed scope, timeline and budget. Best for builds with clear boundaries — platforms, applications, integrations.',
    items: ['Fixed scope with milestones', 'Quotation before work starts', 'Progress visible in your client portal', 'Formal delivery and handover'],
  },
  {
    index: '02',
    title: 'Service retainer',
    body: 'Ongoing capacity for work that keeps coming — automation, content, CRM operations, support. You request, we deliver, monthly.',
    items: ['Monthly service capacity', 'Requests scoped as they arrive', 'Reviewed deliverables every time', 'Cancel or scale with notice'],
  },
  {
    index: '03',
    title: 'Continuous partnership',
    body: 'A long-term technology partnership: roadmap, architecture stewardship and priority delivery for businesses that rely on us as their engineering team.',
    items: ['Shared roadmap and planning', 'Priority delivery capacity', 'Architecture and security review', 'Direct access to the delivery team'],
  },
]

const FAQS: FaqItem[] = [
  {
    q: 'How quickly can work start?',
    a: 'Small service requests can start within days of approval. Larger projects begin with a discovery phase — typically the first thing scheduled after you approve the scope.',
  },
  {
    q: 'How is pricing structured?',
    a: 'Projects are quoted per scope with milestone billing. Retainers are monthly. Where work needs scoping first, we say so and propose the discovery step before quoting.',
  },
  {
    q: 'What is included in every engagement?',
    a: 'A named point of contact, written scope, reviewed deliverables, documentation and a client portal where you follow every request, milestone and deliverable.',
  },
  {
    q: 'Do you work with internal IT teams?',
    a: 'Often. We can lead delivery or work alongside your team and vendors. Responsibilities are spelled out in the scope so nothing falls between teams.',
  },
]

export function ServicesPage() {
  return (
    <>
      <PageHero
        crumbs={[{ href: '/site/services', label: 'Services' }]}
        eyebrow="Services"
        title={<>A service experience built around delivery.</>}
        lead="What you receive when you work with ALO Labs: clear scopes, engineered deliverables, honest commercial models and a team that stays accountable from first request to continuous improvement."
      />

      <Section
        eyebrow="What you receive"
        title="Deliverables, not promises."
        lead="Every engagement produces tangible outputs — here is what that means in practice."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {DELIVERABLES.map(({ icon: Icon, ...d }) => (
            <div key={d.title} className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-6">
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-xl"
                style={{ background: BRAND.tint, color: BRAND.blue }}
              >
                <Icon size={20} />
              </span>
              <div>
                <h3 className="text-[16px] font-semibold" style={{ color: BRAND.blue }}>{d.title}</h3>
                <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: BRAND.gray }}>{d.body}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Engagement models"
        title="Three ways to work with us."
        lead="Choose the model that fits the work — many clients move between them as their needs mature."
        ground="canvas"
      >
        <div className="grid gap-5 lg:grid-cols-3">
          {MODELS.map((model) => (
            <NumberedCard
              key={model.index}
              index={model.index}
              title={model.title}
              body={model.body}
              items={model.items}
              href="/site/contact"
              ctaLabel="Discuss this model"
            />
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Working standards"
        title="What every client can expect."
        ground="navy"
        narrow
      >
        <div className="grid gap-10 sm:grid-cols-2">
          <CheckList
            tone="white"
            items={[
              'A named point of contact for every engagement',
              'Written scope before any billable work begins',
              'Reviewed deliverables — nothing ships unchecked',
              'Clear, honest status communication throughout',
            ]}
          />
          <CheckList
            tone="white"
            items={[
              'Your data stays private to your account',
              'Documentation and handover included in delivery',
              'Security and access control designed in from day one',
              'No lock-in: deliverables and documentation are yours',
            ]}
          />
        </div>
        <div className="mt-10">
          <Button size="lg" className="gap-2" style={{ background: BRAND.orange }} asChild>
            <Link href="/site/how-we-work">
              See how we work <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </Section>

      <Section eyebrow="Service questions" title="Before you ask." narrow>
        <FaqList items={FAQS} />
      </Section>

      <CtaBand />
    </>
  )
}
