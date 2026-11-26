'use client';

/**
 * Platform dashboard.
 *
 * Deliberately shows *measured* facts rather than vanity metrics: how many
 * models are actually reachable right now, what failed, and where the requests
 * went. A dashboard that only counts rows in a table tells an operator nothing
 * about whether the thing works.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { platformApi, hostingLabel, type HealthResponse, type MeResponse, type UsageResponse } from '@/lib/platform/client';

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'warn' | 'bad' }) {
  const colour = tone === 'good' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : tone === 'bad' ? 'text-rose-400' : 'text-slate-100';
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${colour}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div>}
    </div>
  );
}

export function PlatformDashboard() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [meResult, usageResult, healthResult] = await Promise.all([
        platformApi.me(),
        platformApi.usage(30, 'day'),
        platformApi.health(),
      ]);
      if (cancelled) return;
      if (meResult.ok) setMe(meResult.data);
      else setError(meResult.message);
      if (usageResult.ok) setUsage(usageResult.data);
      if (healthResult.ok) setHealth(healthResult.data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectable = health?.deployments.filter((d) => d.selectable) ?? [];
  const blocked = health?.deployments.filter((d) => !d.selectable) ?? [];
  const cooldowns = health?.cooldowns ?? [];

  if (error) {
    return (
      <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 text-sm text-amber-200">
        <p className="font-medium">You are not signed in to the platform.</p>
        <p className="mt-1 text-amber-300/80">{error}</p>
        <Link href="/login" className="mt-3 inline-block rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">
          {me?.workspace?.name ?? 'Workspace'}
        </h1>
        <p className="text-xs text-slate-500">
          {me?.workspace ? `${me.workspace.kind} · ${me.workspace.plan} plan` : 'Loading…'} · requests are scoped to this
          workspace only
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Models available"
          value={`${selectable.length}/${(health?.deployments.length ?? 0)}`}
          hint={`${blocked.length} backend${blocked.length === 1 ? '' : 's'} not reachable`}
          tone={selectable.length > 0 ? 'good' : 'bad'}
        />
        <Stat label="Requests (30d)" value={String(usage?.totals.requests ?? me?.summary.requests30d ?? 0)} hint={`${usage?.totals.tokens ?? 0} tokens`} />
        <Stat
          label="Fallbacks (30d)"
          value={String(usage?.totals.fallbacks ?? 0)}
          hint={usage ? `${(usage.totals.fallbackRate * 100).toFixed(1)}% of requests` : undefined}
          tone={(usage?.totals.fallbacks ?? 0) > 0 ? 'warn' : 'good'}
        />
        <Stat
          label="Active keys"
          value={String(me?.summary.activeKeys ?? 0)}
          hint={`${me?.summary.projects ?? 0} project${me?.summary.projects === 1 ? '' : 's'}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="text-sm font-semibold text-slate-200">Model backends</h2>
          <p className="mb-2 text-[11px] text-slate-500">
            Availability is measured by a live probe, not read from the catalogue.
          </p>
          <ul className="space-y-1.5">
            {health?.deployments.slice(0, 6).map((deployment) => (
              <li key={deployment.id} className="flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="truncate font-mono text-[11px] text-slate-300">{deployment.id}</div>
                  <div className="text-[10px] text-slate-500">
                    {hostingLabel(deployment.hostingType)}
                    {deployment.health ? ` · ${deployment.health.status}` : ''}
                    {deployment.health?.avgLatencyMs ? ` · ${deployment.health.avgLatencyMs}ms avg` : ''}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                    deployment.selectable ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {deployment.selectable ? 'ready' : 'off'}
                </span>
              </li>
            ))}
            {!health && <li className="text-xs text-slate-500">Probing backends…</li>}
          </ul>
          <Link href="/platform/models" className="mt-3 inline-block text-[11px] text-cyan-400 hover:underline">
            All models and requirements →
          </Link>
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="text-sm font-semibold text-slate-200">Routing state</h2>
          <p className="mb-2 text-[11px] text-slate-500">
            A model in cooldown is skipped until its retry window closes.
          </p>
          {cooldowns.length === 0 ? (
            <p className="text-xs text-emerald-400">No models in cooldown.</p>
          ) : (
            <ul className="space-y-1">
              {cooldowns.map((cooldown) => (
                <li key={`${cooldown.provider}-${cooldown.model}`} className="flex justify-between text-xs">
                  <span className="font-mono text-[11px] text-slate-300">{cooldown.provider}/{cooldown.model}</span>
                  <span className="text-amber-400">
                    {Math.max(0, Math.ceil((cooldown.until - Date.now()) / 1000))}s left
                    {cooldown.reason ? ` (${cooldown.reason})` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex gap-2">
            <Link href="/platform/chat" className="rounded bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950">
              Open chat
            </Link>
            <Link href="/platform/keys" className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300">
              API keys
            </Link>
          </div>
        </section>
      </div>

      {me?.inference.anyProviderConfigured === false && (
        <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-3 text-xs text-amber-200">
          <strong className="font-semibold">No inference backend is configured.</strong> Chat and embeddings will fail
          until one is started. For a local test run:{' '}
          <code className="rounded bg-slate-900 px-1">node scripts/local-model-runtime.mjs</code> and set{' '}
          <code className="rounded bg-slate-900 px-1">ALO_PLATFORM_LOCAL_URL</code>; for real models, install Ollama and
          set <code className="rounded bg-slate-900 px-1">OLLAMA_BASE_URL</code>.
        </div>
      )}
    </div>
  );
}
