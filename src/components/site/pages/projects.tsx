'use client'

/**
 * /site/projects — the public project showcase.
 *
 * Only what we can stand behind: our own products with honest status labels,
 * and the kinds of systems we deliver through project engagement. No invented
 * clients, logos, testimonials or outcome metrics. Client work is published
 * only with explicit permission.
 */

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { BRAND } from '@/lib/brand/tokens'
import { ArrowRight, Layers3, PhoneCall, Code2, ShieldCheck } from 'lucide-react'
import { CtaBand, PageHero, Pill, Section } from '@/components/site/chrome'

const PROJECTS = [
  {
    icon: Layers3,
    name: 'ALO Labs Client Portal',
    status: 'Live' as const,
    tone: 'blue' as const,
    category: 'Own product · Client service platform',
    body: 'Our client service platform — the same one our clients use every day. Service requests, project progress, deliverables, invoices and support in one secure, tenant-isolated place.',
    facts: [
      'Secure accounts with role-based access',
      'Project milestones and deliverable review',
      'Billing and support workflows built in',
    ],
  },
  {
    icon: PhoneCall,
    name: 'Voice Contact Center',
    status: 'In development' as const,
    tone: 'orange' as const,
    category: 'Own product · AI-assisted customer contact',
    body: 'AI-assisted voice and messaging for customer contact — inbound handling, campaigns and clean hand-off to human teams. We are building it in the open, and it is not yet a delivered product.',
    facts: [
      'AI-assisted call handling with human escalation',
      'Campaign and messaging automation',
      'Conversation logging into CRM systems',
    ],
  },
  {
    icon: Code2,
    name: 'Custom Client Systems',
    status: 'Project engagement' as const,
    tone: 'plain' as const,
    category: 'Client delivery · Bespoke engineering',
    body: 'The majority of our work: bespoke software, portals, automations and integrations built for individual clients. These systems belong to our clients, and we publish details only with their permission.',
    facts: [
      'Scoped projects with agreed deliverables',
      'Published as case studies only with client consent',
      'Covering the nine solution areas on our solutions page',
    ],
  },
]

function StatusPill({ status, tone }: { status: string; tone: 'blue' | 'orange' | 'plain' }) {
  return <Pill tone={tone}>{status}</Pill>
}

export function ProjectsPage() {
  return (
    <>
      <PageHero
        crumbs={[{ href: '/site/projects', label: 'Projects' }]}
        eyebrow="Projects"
        title={<>What we're building, honestly labelled.</>}
        lead="What is live, what is in development and what is delivered through project engagement — stated exactly as it is. We publish no invented clients, no vanity logos and no unverified outcome metrics."
      >
        <div className="flex flex-wrap gap-2">
          <Pill tone="blue">Live</Pill>
          <Pill tone="orange">In development</Pill>
          <Pill tone="plain">Project engagement</Pill>
        </div>
      </PageHero>

      <Section
        eyebrow="The showcase"
        title="Products and projects."
        lead="Our own products carry honest status labels. Client systems are described only in general terms until a client gives permission to say more."
      >
        <div className="grid gap-5 lg:grid-cols-3">
          {PROJECTS.map(({ icon: Icon, facts, ...project }) => (
            <article key={project.name} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-7">
              <div className="flex items-center justify-between">
                <span
                  className="flex size-11 items-center justify-center rounded-xl"
                  style={{ background: BRAND.tint, color: BRAND.blue }}
                >
                  <Icon size={20} />
                </span>
                <StatusPill status={project.status} tone={project.tone} />
              </div>
              <p className="mt-5 font-mono text-[9px] font-semibold uppercase tracking-[0.16em]" style={{ color: BRAND.graySoft }}>
                {project.category}
              </p>
              <h3 className="mt-2 text-[19px] font-semibold leading-snug" style={{ color: BRAND.blue }}>
                {project.name}
              </h3>
              <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: BRAND.gray }}>
                {project.body}
              </p>
              <ul className="mt-4 space-y-1.5">
                {facts.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[11.5px]" style={{ color: BRAND.ink }}>
                    <span className="mt-[7px] size-[5px] shrink-0 rounded-full" style={{ background: BRAND.orange }} />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Case studies"
        title="Verified work, only."
        lead="We publish a case study only when the client has approved it and the facts can be verified. Until then, this page stays honest — an elegant showcase of what we build, without borrowed logos or invented results."
        ground="canvas"
        narrow
      >
        <div className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-6">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgba(232,80,26,0.10)', color: BRAND.orange }}>
            <ShieldCheck size={20} />
          </span>
          <div>
            <h3 className="text-[15px] font-semibold" style={{ color: BRAND.blue }}>
              Interested in references?
            </h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: BRAND.gray }}>
              Ask us directly. Where a client has given permission, we are glad to share relevant experience and connect you with references during the conversation.
            </p>
            <Link href="/site/contact" className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: BRAND.orange }}>
              Talk to us <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </Section>

      <CtaBand />
    </>
  )
}
