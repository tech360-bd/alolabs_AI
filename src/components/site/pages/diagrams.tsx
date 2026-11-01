'use client'

/**
 * /site/diagrams — the public diagram gallery. Twelve figures from the
 * editorial diagram library, each generated from its spec at request time and
 * gated by the taste audit — the public face of the same system the design
 * studio exposes in full.
 */

import * as React from 'react'
import Link from 'next/link'
import { EditorialDiagram } from '@/components/diagrams/editorial-diagram'
import { EXAMPLE_BY_SLUG } from '@/lib/diagram-design/examples'
import type { DiagramSpec } from '@/lib/diagram-design/spec'
import { KINDS } from '@/lib/diagram-design/tokens'
import { Button } from '@/components/ui/button'
import { BRAND, BRAND_FONTS } from '@/lib/brand/tokens'
import { ArrowRight, Ruler, ShieldCheck, Sparkles, Workflow } from 'lucide-react'
import { CtaBand, PageHero, Pill, Section } from '@/components/site/chrome'

const GALLERY: { slug: string; note: string }[] = [
  { slug: 'architecture-agentos', note: 'The platform request path, with one focal policy gate.' },
  { slug: 'org-chart-ai-team', note: 'How 1020 agents report through departments to the command centre.' },
  { slug: 'sequence-tool-loop', note: 'A tool-calling loop, drawn as a sequence with one combined fragment.' },
  { slug: 'loop-growth-flywheel', note: 'The growth flywheel a marketing department runs every week.' },
  { slug: 'kanban-content-board', note: 'Content operations on a board — the shape of every workflow view.' },
  { slug: 'gantt-rollout', note: 'A department-by-department rollout on a timeline.' },
  { slug: 'sankey-content-funnel', note: 'Where attention leaks out of the content funnel.' },
  { slug: 'quadrant-build-order', note: 'Build-order prioritisation: impact against effort.' },
  { slug: 'radar-readiness', note: 'AI readiness scored across five criteria.' },
  { slug: 'db-schema-skills', note: 'The skill registry schema, as an ER figure.' },
  { slug: 'bar-hours-saved', note: 'Hours saved per workflow — the number operators care about.' },
  { slug: 'wardley-agentos', note: 'AgentOS mapped as a value chain on the Wardley plane.' },
]

function GalleryCard({ slug, note }: { slug: string; note: string }) {
  const spec = EXAMPLE_BY_SLUG[slug] as DiagramSpec | undefined
  if (!spec) return null
  return (
    <figure className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="orange">{spec.kind}</Pill>
        <span className="font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: BRAND.graySoft }}>
          {spec.eyebrow}
        </span>
      </div>
      <h3 className="mt-3 text-[15px] font-semibold leading-snug" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
        {spec.title}
      </h3>
      <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: BRAND.gray }}>
        {note}
      </p>
      <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
        <EditorialDiagram spec={spec} />
      </div>
    </figure>
  )
}

export function DiagramsPage() {
  return (
    <>
      <PageHero
        crumbs={[{ href: '/site/diagrams', label: 'Diagram gallery' }]}
        eyebrow="Editorial diagram system"
        title={<>Forty-five visual types. One design language.</>}
        lead="Every figure below is generated from a typed spec at request time — orthogonal connectors, one accent per figure, a 4px grid and a legend that shows every treatment used and nothing extra. The rules are not guidelines; they run as an audit in CI."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" className="gap-2" style={{ background: BRAND.orange }} asChild>
            <Link href="/design">
              Open the full studio <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/site/press">Figures for your materials</Link>
          </Button>
          <div className="flex flex-wrap gap-2">
            <Pill tone="blue">{KINDS.length} visual types</Pill>
            <Pill tone="blue">6 engines</Pill>
            <Pill tone="orange">Taste gate in CI</Pill>
          </div>
        </div>
      </PageHero>

      <Section
        eyebrow="The rules"
        title="A taste gate that runs as code."
        lead="Editorial diagrams fail in predictable ways. Ours cannot ship those failures — the audit rejects them in the test suite, before anything reaches a page like this one."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Workflow, title: 'Orthogonal only', body: 'Connectors route with elbows, never diagonals — arc-aware, with stacked routes rejected.' },
            { icon: Ruler, title: '4px structural grid', body: 'Every node sits on the grid; type ramps and radii come from tokens, not eyeballing.' },
            { icon: Sparkles, title: 'One accent per figure', body: 'At most two focal elements and two callouts. Decoration is not data.' },
            { icon: ShieldCheck, title: 'Accessible by contract', body: 'role="img", a title as the first child, a description of what the figure shows.' },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-6">
              <item.icon className="size-4" style={{ color: BRAND.orange }} />
              <p className="mt-3 text-[14px] font-semibold" style={{ color: BRAND.blue, fontFamily: BRAND_FONTS.secondary.stack }}>
                {item.title}
              </p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: BRAND.gray }}>
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Gallery"
        title="Twelve figures from the library."
        lead="Architecture, org charts, sequences, flywheels, boards, timelines, funnels, quadrants, radars, schemas, bars and Wardley maps — one example per family, in the same language your reports would use."
        ground="canvas"
      >
        <div className="grid gap-5 lg:grid-cols-2">
          {GALLERY.map((item) => (
            <GalleryCard key={item.slug} slug={item.slug} note={item.note} />
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button size="lg" className="gap-2" style={{ background: BRAND.orange }} asChild>
            <Link href="/design">
              All {KINDS.length} types in the studio <ArrowRight className="size-4" />
            </Link>
          </Button>
          <span className="text-[11.5px]" style={{ color: BRAND.gray }}>
            The studio adds variants, themes, motion playback, importers (Mermaid, draw.io, Excalidraw) and one-click
            SVG / HTML export.
          </span>
        </div>
      </Section>

      <CtaBand
        title="Every deck, report and page deserves figures this good."
        lead="The diagram system is part of every AgentOS deployment — your team draws in the same language as this site."
      />
    </>
  )
}
