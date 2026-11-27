'use client';

/**
 * Stack register panel (dashboard).
 *
 * The same register as `/site/stack`, rendered dark for operators. It exists
 * because the two catalogues behind it — `LINK_COVERAGE` (88 upstream links with
 * verdicts and evidence) and the 26-adapter ONE Runtime registry — were only
 * reachable by curl or by reading source. This is the surface that answers
 * "do we already support X?" without leaving the product.
 *
 * Data comes from the public `/api/ecosystem` endpoint: the payload is static
 * catalogue data, so the panel needs no tenant context and cannot leak one.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Activity, AlertTriangle, BookOpen, ExternalLink, Layers, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import type { CoverageVerdict } from '@/lib/link-coverage/types';
import type { StackEntryView, StackPillarSummary, StackStats, VerdictMeta } from '@/lib/ecosystem/stack';

interface EcosystemResponse {
  success: boolean;
  updatedAt: string;
  stats: StackStats;
  verdicts: { id: CoverageVerdict; label: string; meaning: string; tone: VerdictMeta['tone']; count: number }[];
  pillars: StackPillarSummary[];
  total: number;
  entries: StackEntryView[];
  notice: string;
}

const TONE: Record<VerdictMeta['tone'], string> = {
  green: 'bg-emerald-500/15 text-emerald-300',
  blue: 'bg-sky-500/15 text-sky-300',
  slate: 'bg-slate-700/60 text-slate-300',
  amber: 'bg-amber-500/15 text-amber-300',
  rose: 'bg-rose-500/15 text-rose-300',
};

function Stat({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: 'good' | 'warn' }) {
  const colour = tone === 'good' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : 'text-slate-100';
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${colour}`}>{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div> : null}
    </div>
  );
}

export default function EcosystemStackPanel() {
  const [data, setData] = useState<EcosystemResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [verdict, setVerdict] = useState<CoverageVerdict | 'all'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch('/api/ecosystem');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as EcosystemResponse;
      setData(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the stack register.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const entries = useMemo(() => {
    const rows = data?.entries ?? [];
    const q = query.trim().toLowerCase();
    return rows.filter((entry) => {
      if (verdict !== 'all' && entry.verdict !== verdict) return false;
      if (!q) return true;
      return [entry.name, entry.upstream, entry.claim, entry.gap ?? '', entry.category]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [data, query, verdict]);

  const gaps = useMemo(() => (data?.entries ?? []).filter((entry) => entry.verdict === 'gap'), [data]);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
        <RefreshCw className="size-4 animate-spin" /> Loading the stack register…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 text-sm text-amber-200">
        <p className="font-medium">The stack register could not be loaded.</p>
        <p className="mt-1 text-amber-300/80">{error}</p>
        <button type="button" onClick={() => void load()} className="mt-3 rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950">
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
            <Layers className="size-4 text-orange-400" /> Stack register
          </h1>
          <p className="text-xs text-slate-500">
            Every upstream link we were asked about, with a verdict and the file that proves it · updated {data.updatedAt}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/site/stack"
            className="rounded border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-500"
          >
            Public page
          </Link>
          <a
            href="/api/ecosystem"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-500"
          >
            JSON <ExternalLink className="size-3" />
          </a>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
          >
            <RefreshCw className={`size-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Links" value={data.stats.links} hint={`${data.stats.evidencePaths} evidence files`} />
        <Stat label="Implemented" value={data.stats.implemented} hint="adapter or first-party route" tone="good" />
        <Stat label="In kind" value={data.stats.inKind} hint="equivalent built here" tone="good" />
        <Stat label="Gaps" value={data.stats.gap} hint="next step written" tone="warn" />
        <Stat label="Adapters" value={data.stats.adapters} hint="ONE Runtime, licence-gated" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[180px] flex-1">
              <span className="sr-only">Search the register</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search systems…"
                className="w-full rounded border border-slate-700 bg-slate-950/60 py-1.5 pl-8 pr-2 text-xs text-slate-200 outline-none focus:border-slate-500"
              />
            </label>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setVerdict('all')}
                className={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                  verdict === 'all' ? 'bg-slate-200 text-slate-900' : 'bg-slate-800 text-slate-400'
                }`}
              >
                all {data.stats.links}
              </button>
              {data.verdicts.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setVerdict(item.id)}
                  title={item.meaning}
                  className={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                    verdict === item.id ? 'bg-slate-200 text-slate-900' : TONE[item.tone]
                  }`}
                >
                  {item.label} {item.count}
                </button>
              ))}
            </div>
          </div>

          <ul className="mt-3 divide-y divide-slate-800">
            {entries.slice(0, 60).map((entry) => (
              <li key={entry.id} className="py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium text-slate-200">{entry.name}</span>
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-slate-400">
                        {entry.pillar.label}
                      </span>
                      {entry.adapter ? (
                        <span className="rounded bg-sky-500/15 px-1.5 py-0.5 font-mono text-[9px] text-sky-300">
                          {entry.adapter.id}
                        </span>
                      ) : null}
                      {entry.brief ? (
                        <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-400">
                          <BookOpen className="size-2.5" /> brief
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{entry.claim}</p>
                    {entry.gap ? (
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-amber-400/80">Next: {entry.gap}</p>
                    ) : null}
                  </div>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${TONE[data.verdicts.find((v) => v.id === entry.verdict)?.tone ?? 'slate']}`}>
                    {data.verdicts.find((v) => v.id === entry.verdict)?.label ?? entry.verdict}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {entries.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">No rows match that filter.</p>
          ) : null}
          {entries.length > 60 ? (
            <p className="pt-2 text-[11px] text-slate-500">Showing 60 of {entries.length}. Narrow the filter to see more.</p>
          ) : null}
        </section>

        <div className="space-y-4">
          <section className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-200">
              <AlertTriangle className="size-4" /> Open gaps ({gaps.length})
            </h2>
            <p className="mt-1 text-[11px] text-amber-300/70">
              Each row names the next concrete step. Nothing here is hidden behind a “coming soon”.
            </p>
            <ul className="mt-2 space-y-2">
              {gaps.slice(0, 6).map((entry) => (
                <li key={entry.id} className="text-[11px]">
                  <span className="font-medium text-amber-100">{entry.name}</span>
                  <p className="mt-0.5 line-clamp-2 text-amber-300/70">{entry.gap}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Activity className="size-4 text-sky-400" /> Pillars
            </h2>
            <ul className="mt-2 space-y-1.5">
              {data.pillars.map((pillar) => (
                <li key={pillar.id} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="truncate text-slate-400">{pillar.label}</span>
                  <span className="shrink-0 tabular-nums text-slate-500">
                    <span className="text-emerald-400">{pillar.implemented}</span>
                    {' / '}
                    {pillar.total}
                    {pillar.gaps ? <span className="ml-1 text-amber-400">{pillar.gaps} gap</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <ShieldCheck className="size-4 text-emerald-400" /> How to read this
            </h2>
            <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-slate-500">
              {data.verdicts.map((item) => (
                <li key={item.id}>
                  <span className={`mr-1 rounded px-1 py-0.5 text-[9px] uppercase ${TONE[item.tone]}`}>{item.label}</span>
                  {item.meaning}
                </li>
              ))}
            </ul>
            <p className="mt-2 border-t border-slate-800 pt-2 text-[10px] text-slate-600">{data.notice}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
