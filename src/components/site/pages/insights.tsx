'use client'

/**
 * /site/insights — the notes & guides surface: articles about running AI
 * departments, grounded in the same material as the platform's own docs, brand
 * book and design system. Each note links to the living artefact it describes.
 */

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { BRAND, BRAND_FONTS } from '@/lib/brand/tokens'
import { ArrowRight, BookOpen, Clock } from 'lucide-react'
import { CtaBand, PageHero, Pill, Section } from '@/components/site/chrome'

interface Note {
  slug: string
  tag: string
  title: string
  excerpt: string
  read: string
  href: string
  hrefLabel: string
}

const NOTES: Note[] = [
  {
    slug: 'command-path',
    tag: 'Operations',
    title: 'The eight-hop command path — and why every hop is audited',
    excerpt:
      'How an owner command becomes an executed action: intent classification, master routing, department routing, agent selection, memory, hybrid retrieval, approval and execution — with the audit record each hop leaves behind.',
    read: '9 min read',
    href: '/site/platform#flow',
    hrefLabel: 'Read on the platform page',
  },
  {
    slug: 'approval-gate',
    tag: 'Governance',
    title: 'Designing an approval gate people do not route around',
    excerpt:
      'Approval gates fail when they are friction without information. Risk scoring, policy packs and staged approvals — the pattern that keeps 1020 agents productive and safe at the same time.',
    read: '7 min read',
    href: '/site/platform#approvals',
    hrefLabel: 'See the control stack',
  },
  {
    slug: 'hybrid-rag',
    tag: 'Retrieval',
    title: 'Classic, graph or agentic RAG? Choosing per question, not per project',
    excerpt:
      'Why the retrieval family should be a runtime decision: vector search for precision, graph traversal for relationships, agentic multi-hop for questions that need a plan — and how the three compose in one engine.',
    read: '11 min read',
    href: '/site/platform#rag',
    hrefLabel: 'Read on the platform page',
  },
  {
    slug: 'diagram-taste-gate',
    tag: 'Design',
    title: 'A taste gate that runs in CI: 45 diagram types, zero warnings',
    excerpt:
      'Editorial diagrams go wrong in predictable ways — diagonal connectors, label collisions, decoration bloat. Encoding those rules as an audit, and making every published figure pass it automatically.',
    read: '8 min read',
    href: '/site/diagrams',
    hrefLabel: 'Browse the diagram gallery',
  },
  {
    slug: 'marketing-playbooks',
    tag: 'Marketing',
    title: 'Turning 50 marketing playbooks into installable agents',
    excerpt:
      'The marketing kit is not a PDF folder: every playbook is a versioned skill with references, evaluations and an install path into the agent registry. What that architecture buys you on day 90.',
    read: '6 min read',
    href: '/site/press',
    hrefLabel: 'Open the marketing kit',
  },
  {
    slug: 'department-rollout',
    tag: 'Playbook',
    title: 'Department by department: a rollout pattern that survives contact',
    excerpt:
      'Prove one department end to end, keep the humans in command, then extend the same pattern. The assessment questions, the metrics that matter, and the mistakes that stall rollouts.',
    read: '10 min read',
    href: '/site/solutions#process',
    hrefLabel: 'See how we deliver',
  },
]

function NoteCard({ note, featured }: { note: Note; featured?: boolean }) {
  return (
    <article
      className={`flex flex-col rounded-2xl border border-slate-200 bg-white p-7 ${featured ? 'ring-2' : ''}`}
      style={featured ? ({ ['--tw-ring-color' as string]: BRAND.orange } as React.CSSProperties) : undefined}
    >
      <div className="flex items-center gap-2">
        <Pill tone={featured ? 'orange' : 'blue'}>{note.tag}</Pill>
        <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: BRAND.graySoft }}>
          <Clock className="size-3" /> {note.read}
        </span>
      </div>
      <h3 className="mt-3.5 text-[18px] font-semibold leading-snug" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
        {note.title}
      </h3>
      <p className="mt-2.5 text-[13px] leading-relaxed" style={{ color: BRAND.gray }}>
        {note.excerpt}
      </p>
      <div className="mt-5 flex-1" />
      <Link href={note.href} className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: BRAND.orange }}>
        {note.hrefLabel} <ArrowRight className="size-3.5" />
      </Link>
    </article>
  )
}

export function InsightsPage() {
  return (
    <>
      <PageHero
        crumbs={[{ href: '/site/insights', label: 'Insights' }]}
        eyebrow="Insights & guides"
        title={<>Notes from inside the agent factory.</>}
        lead="Field notes on running AI departments: governance, retrieval, rollout patterns and the design systems behind the product. Every note links to a living artefact — a diagram gallery, a platform page, the marketing kit."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" className="gap-2" style={{ background: BRAND.orange }} asChild>
            <Link href="/site/contact">
              Suggest a topic <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" className="gap-2" asChild>
            <Link href="/design">
              <BookOpen className="size-4" /> The design system
            </Link>
          </Button>
        </div>
      </PageHero>

      <Section eyebrow="Latest" title="Start here." lead="Three flagship notes, then the rest of the library.">
        <div className="grid gap-5 lg:grid-cols-3">
          {NOTES.slice(0, 3).map((note, i) => (
            <NoteCard key={note.slug} note={note} featured={i === 0} />
          ))}
        </div>
      </Section>

      <Section eyebrow="Library" title="More notes." ground="canvas">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {NOTES.slice(3).map((note) => (
            <NoteCard key={note.slug} note={note} />
          ))}
        </div>
      </Section>

      <Section eyebrow="From the brand book" title="The house view of the product, in one line each.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            'Secure. Smart. Scalable. Built for the Future.',
            '1 Command Center · 1020 AI Agents · 100+ Departments.',
            'Orange for action, blue for system.',
            'Nothing executes without passing the gate.',
          ].map((line) => (
            <div key={line} className="rounded-2xl border border-slate-200 bg-white p-6">
              <p className="text-[15px] font-semibold leading-snug" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
                “{line}”
              </p>
            </div>
          ))}
        </div>
      </Section>

      <CtaBand
        title="Want the field notes applied to your departments?"
        lead="The fastest way to learn the pattern is to run it once with us. We will bring the playbook."
      />
    </>
  )
}
