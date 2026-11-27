'use client';

/**
 * /site/stack — the public stack register.
 *
 * WHAT THIS PAGE IS FOR
 * ---------------------
 * The owner sent 88 upstream links (monid, SignuDoc, LiteLLM, Temporal,
 * Activepieces, Directus, LibreChat, Open WebUI, vLLM, free-for.dev, Postman …)
 * and asked for them to be *used*. The honest answer is not "all adopted": this
 * repository already implements eight of them as registered adapters, mirrors
 * one as a curated free-tier catalogue, replaces one with a first-party engine,
 * and genuinely lacks three. Those four states are shown as four verdicts, each
 * with the file that proves it.
 *
 * DESIGN NOTES
 * ------------
 *  · Every card carries its evidence. A badge without a path is marketing.
 *  · Filtering is client-side over a payload already rendered on the server, so
 *    the page is complete without JavaScript and never re-fetches on a keystroke.
 *  · Gaps are presented as a queue with a written next step, not hidden in a
 *    footnote — that is the part a reader can act on.
 */

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, CircleDot, Database, ExternalLink, GitBranch, Layers, Search, ShieldCheck } from 'lucide-react';
import { BRAND } from '@/lib/brand/public';
import { CtaBand, PageHero, Pill, Section, StatCard } from '@/components/site/chrome';
import {
  filterStack,
  gapQueue,
  VERDICT_META,
  type StackEntryView,
  type StackReport,
} from '@/lib/ecosystem/stack';
import type { CoverageVerdict } from '@/lib/link-coverage/types';

const TONE_STYLE: Record<string, { bg: string; fg: string; border: string }> = {
  green: { bg: 'rgba(16,185,129,0.10)', fg: '#047857', border: 'rgba(16,185,129,0.28)' },
  blue: { bg: 'rgba(29,78,216,0.08)', fg: '#1D4ED8', border: 'rgba(29,78,216,0.22)' },
  slate: { bg: 'rgba(100,116,139,0.10)', fg: '#334155', border: 'rgba(100,116,139,0.24)' },
  amber: { bg: 'rgba(245,158,11,0.12)', fg: '#92400E', border: 'rgba(245,158,11,0.32)' },
  rose: { bg: 'rgba(244,63,94,0.10)', fg: '#9F1239', border: 'rgba(244,63,94,0.26)' },
};

function VerdictBadge({ verdict, count }: { verdict: CoverageVerdict; count?: number }) {
  const meta = VERDICT_META[verdict];
  const tone = TONE_STYLE[meta.tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]"
      style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}` }}
    >
      {meta.label}
      {count !== undefined ? <span className="tabular-nums opacity-70">{count}</span> : null}
    </span>
  );
}

function StackCard({ entry }: { entry: StackEntryView }) {
  return (
    <article className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold" style={{ color: BRAND.blue }}>
            {entry.name}
          </h3>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: BRAND.graySoft }}>
            {entry.pillar.label} · {entry.category}
          </p>
        </div>
        <VerdictBadge verdict={entry.verdict} />
      </div>

      <p className="mt-3 text-[13px] leading-relaxed" style={{ color: BRAND.gray }}>
        {entry.upstream}
      </p>

      <p className="mt-3 border-l-2 pl-3 text-[12.5px] leading-relaxed" style={{ borderColor: BRAND.orange, color: BRAND.gray }}>
        {entry.claim}
      </p>

      {entry.adapter ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Pill tone="blue">adapter {entry.adapter.id}</Pill>
          <Pill tone="orange">{entry.adapter.strategy.replace('_', ' ')}</Pill>
          <Pill tone="plain">{entry.adapter.licenseClass}</Pill>
        </div>
      ) : null}

      {entry.brief ? (
        <details className="group mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[12px] font-semibold" style={{ color: BRAND.blue }}>
            <BookOpen className="size-3.5" style={{ color: BRAND.orange }} />
            Agent brief
            <span className="ml-auto font-mono text-[10px] font-normal" style={{ color: BRAND.graySoft }}>
              {entry.brief.steps.length} steps · {entry.brief.risks.length} risks
            </span>
          </summary>
          <dl className="mt-3 space-y-2 text-[12px] leading-relaxed" style={{ color: BRAND.gray }}>
            <div>
              <dt className="font-semibold" style={{ color: BRAND.blue }}>Use when</dt>
              <dd>{entry.brief.useWhen}</dd>
            </div>
            <div>
              <dt className="font-semibold" style={{ color: BRAND.blue }}>Steps</dt>
              <dd>
                <ol className="list-decimal space-y-1 pl-4">
                  {entry.brief.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </dd>
            </div>
            <div>
              <dt className="font-semibold" style={{ color: BRAND.blue }}>Risks</dt>
              <dd>
                <ul className="list-disc space-y-1 pl-4">
                  {entry.brief.risks.map((risk) => (
                    <li key={risk}>{risk}</li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
        </details>
      ) : null}

      {entry.gap ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-[12px] leading-relaxed" style={{ color: '#78350F' }}>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em]">Next step</span>
          <p className="mt-1">{entry.gap}</p>
        </div>
      ) : null}

      <div className="mt-auto pt-4">
        <div className="flex flex-wrap gap-1.5">
          {entry.evidence.slice(0, 3).map((item) => (
            <span
              key={item.path}
              className="max-w-full truncate rounded border border-slate-200 px-1.5 py-0.5 font-mono text-[10px]"
              style={{ color: BRAND.graySoft }}
              title={item.path}
            >
              {item.path}
            </span>
          ))}
          {entry.evidence.length > 3 ? (
            <span className="font-mono text-[10px]" style={{ color: BRAND.graySoft }}>
              +{entry.evidence.length - 3}
            </span>
          ) : null}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[10px]" style={{ color: BRAND.graySoft }}>
          <span className="truncate font-mono">
            {entry.stars !== undefined ? `${entry.stars.toLocaleString()}★` : 'n/a'}
            {entry.language ? ` · ${entry.language}` : ''}
            {entry.checkedAt ? ` · checked ${entry.checkedAt}` : ''}
          </span>
          <a
            href={entry.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex shrink-0 items-center gap-1 font-semibold hover:underline"
            style={{ color: BRAND.orangeInk }}
          >
            upstream <ExternalLink className="size-3" />
          </a>
        </div>
      </div>
    </article>
  );
}

export function StackPage({ report }: { report: StackReport }) {
  const [query, setQuery] = React.useState('');
  const [verdict, setVerdict] = React.useState<CoverageVerdict | 'all'>('all');
  const [pillar, setPillar] = React.useState<string>('all');

  const visible = React.useMemo(
    () => filterStack(report.entries, { q: query, verdict, pillar }),
    [report.entries, query, verdict, pillar],
  );

  const gaps = React.useMemo(() => gapQueue(report.entries).slice(0, 4), [report.entries]);
  const filtersActive = query.trim().length > 0 || verdict !== 'all' || pillar !== 'all';

  return (
    <>
      <PageHero
        eyebrow="Stack register"
        title={<>Every upstream link, and what we actually did with it</>}
        lead="Eighty-eight systems were sent to us — agent frameworks, e-signature, automation builders, inference servers, directories. This register states, per link, whether the capability is implemented here, implemented in kind, a reference only, or a gap with a written next step. Each claim names the file that proves it."
        crumbs={[{ href: '/site', label: 'Studio' }]}
      >
        <div className="flex flex-wrap items-center gap-2">
          {report.verdicts.map((item) => (
            <VerdictBadge key={item.id} verdict={item.id} count={item.count} />
          ))}
          <span className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: BRAND.graySoft }}>
            updated {report.updatedAt}
          </span>
        </div>
      </PageHero>

      <Section
        eyebrow="At a glance"
        title="A catalogue that admits what it does not have"
        lead="These four numbers are computed from the registry at render time — not typed into this page."
        ground="canvas"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Database} value={String(report.stats.links)} label="Upstream links" note={`${report.stats.evidencePaths} evidence files cited`} />
          <StatCard icon={ShieldCheck} value={String(report.stats.implemented + report.stats.inKind)} label="Implemented or in kind" note={`${report.stats.implemented} with a registered adapter or route`} />
          <StatCard icon={GitBranch} value={String(report.stats.adapters)} label="Registered adapters" note="ONE Runtime, licence-classified" />
          <StatCard icon={CircleDot} value={String(report.stats.gap)} label="Open gaps" note="each with a concrete next step" />
        </div>
      </Section>

      <Section
        eyebrow="The register"
        title="Search, filter, and read the evidence"
        lead="A verdict is a claim about this repository that can be disproved by opening a file. Filters run locally — nothing is sent anywhere."
      >
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative flex-1">
              <span className="sr-only">Search the stack register</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" style={{ color: BRAND.graySoft }} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search 88 systems — e.g. e-signature, LiteLLM, browser, vLLM"
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-[13px] outline-none focus:border-slate-400"
                style={{ color: BRAND.blue }}
              />
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setVerdict('all')}
                className="rounded-md border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]"
                style={
                  verdict === 'all'
                    ? { background: BRAND.blue, color: '#fff', borderColor: BRAND.blue }
                    : { background: '#fff', color: BRAND.gray, borderColor: '#E2E8F0' }
                }
              >
                all
              </button>
              {report.verdicts.map((item) => {
                const tone = TONE_STYLE[VERDICT_META[item.id].tone];
                const active = verdict === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setVerdict(item.id)}
                    className="rounded-md border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]"
                    style={
                      active
                        ? { background: tone.fg, color: '#fff', borderColor: tone.fg }
                        : { background: tone.bg, color: tone.fg, borderColor: tone.border }
                    }
                  >
                    {item.label} {item.count}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: BRAND.graySoft }}>
              pillar
            </span>
            <button
              type="button"
              onClick={() => setPillar('all')}
              className="rounded-full border px-2.5 py-0.5 text-[11px]"
              style={
                pillar === 'all'
                  ? { background: BRAND.tint, color: BRAND.blue, borderColor: 'rgba(29,78,216,0.25)' }
                  : { background: '#fff', color: BRAND.gray, borderColor: '#E2E8F0' }
              }
            >
              All
            </button>
            {report.pillars.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPillar(item.id)}
                className="rounded-full border px-2.5 py-0.5 text-[11px]"
                style={
                  pillar === item.id
                    ? { background: BRAND.tint, color: BRAND.blue, borderColor: 'rgba(29,78,216,0.25)' }
                    : { background: '#fff', color: BRAND.gray, borderColor: '#E2E8F0' }
                }
              >
                {item.label} <span className="tabular-nums opacity-60">{item.total}</span>
              </button>
            ))}
            {filtersActive ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setVerdict('all');
                  setPillar('all');
                }}
                className="ml-auto font-mono text-[10px] uppercase tracking-[0.1em] hover:underline"
                style={{ color: BRAND.orangeInk }}
              >
                reset
              </button>
            ) : null}
          </div>
        </div>

        <p className="mt-3 font-mono text-[11px]" style={{ color: BRAND.graySoft }}>
          {visible.length} of {report.entries.length} rows
        </p>

        {visible.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-8 text-center text-[13px]" style={{ color: BRAND.gray }}>
            Nothing matches that filter. Try a broader term, or{' '}
            <button
              type="button"
              className="font-semibold underline"
              style={{ color: BRAND.orangeInk }}
              onClick={() => {
                setQuery('');
                setVerdict('all');
                setPillar('all');
              }}
            >
              show all {report.entries.length} rows
            </button>
            .
          </div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((entry) => (
              <StackCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </Section>

      <Section
        eyebrow="What a verdict means"
        title="Four states, no rounding up"
        lead="The vocabulary is the point: a directory listing is not an integration, and an adapter is not a deployment."
        ground="canvas"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {report.verdicts.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <VerdictBadge verdict={item.id} count={item.count} />
              </div>
              <p className="mt-2 text-[13px] leading-relaxed" style={{ color: BRAND.gray }}>
                {item.meaning}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Gap queue"
        title="What we would build next, in order"
        lead="Only rows with a concrete, implementable next step appear here. This is the backlog the register implies — not a wish list."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {gaps.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[15px] font-semibold" style={{ color: BRAND.blue }}>
                  {entry.name}
                </h3>
                <VerdictBadge verdict={entry.verdict} />
              </div>
              <p className="mt-2 text-[13px] leading-relaxed" style={{ color: BRAND.gray }}>
                {entry.gap}
              </p>
              <p className="mt-3 font-mono text-[10px]" style={{ color: BRAND.graySoft }}>
                evidence: {entry.evidence[0]?.path}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/site/request-a-solution"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white"
            style={{ background: BRAND.orange }}
          >
            Ask for one of these gaps <ArrowRight className="size-4" />
          </Link>
          <a
            href="/api/ecosystem"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-[13px] font-semibold"
            style={{ color: BRAND.blue }}
          >
            <Layers className="size-4" /> Machine-readable register
          </a>
        </div>
      </Section>

      <CtaBand
        title="Already run one of these systems?"
        lead="If you have LiteLLM, LibreChat or a Temporal cluster in place, we will say honestly whether the platform can meet it where it is — and what a bridge would take. If it is a gap, you will see it in this register before you buy."
      />
    </>
  );
}
