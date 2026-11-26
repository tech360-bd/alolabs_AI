'use client';

/**
 * Super Admin panel.
 *
 * Everything here is read from a live endpoint, including the licence inventory
 * (which is produced by inspecting the installed tree at request time). Tabs are
 * grouped by the question an operator is actually asking:
 *
 *   Overview   — is the platform healthy, and who is on it?
 *   Routing    — what order will the engine try, and what is benched?
 *   Fallbacks  — why did requests go sideways?
 *   Providers  — what backends exist, and is a paid lane enabled?
 *   Hardware   — what can this machine run?
 *   Licences   — what are our legal obligations?
 */

import { useCallback, useEffect, useState } from 'react';
import { attemptReason, hostingLabel } from '@/lib/platform/client';

interface AdminOverview {
  admin: { email: string; role: string };
  tenants: { workspaces: number; organisations: number; projects: number; users: number; activeApiKeys: number; conversations: number; files: number };
  usage24h: { requests: number; tokens: number; costUsd: number; fallbacks: number };
  models: {
    total: number;
    selectable: number;
    deployments: Array<{
      id: string; provider: string; model: string; hostingType: string; priority: number;
      selectable: boolean; reachable: boolean; blockedReason?: string;
      health: { status: string; consecutiveFailures: number; successRate: number; avgLatencyMs: number } | null;
    }>;
  };
  routing: {
    cooldowns: Array<{ provider: string; model: string; until: number; reason?: string }>;
    remoteAllowed: boolean;
    localEndpoints: Record<string, boolean>;
  };
  providers: ProviderRow[];
  queues: { pendingJobs: number | null };
}

interface ProviderRow {
  id: string;
  provider: string;
  displayName: string;
  baseUrl: string | null;
  enabled: boolean;
  isLocal: boolean;
  priority: number;
  fallbackEligible: boolean;
  lastHealthStatus: string | null;
  lastHealthAt: string | null;
  lastHealthLatencyMs: number | null;
  hasApiKey: boolean;
  keyHint: string | null;
  createdAt: string;
}

interface HardwareResponse {
  hardware: {
    cpu: { model: string; cores: number; loadAverage1m: number; architecture: string };
    memory: { totalGb: number; freeGb: number; usedPct: number };
    storage: { path: string; totalGb: number; freeGb: number } | null;
    gpu: { present: boolean; devices: Array<{ name: string; memoryGb: number | null }>; detectedVia: string; note?: string };
    platform: { os: string; release: string; node: string; uptimeHours: number };
    verdict: { canRunSmallLocalModels: boolean; canRun7bModels: boolean; canRun13bModels: boolean; canRunImageGeneration: boolean; reasons: string[] };
  };
}

interface LicenceResponse {
  application: {
    name: string; version: string; commit: string; declaredLicense: string | null;
    licenseFiles: string[]; readmeClaim: string | null; findings: string[];
  };
  dependencies: {
    total: number;
    byCategory: Record<string, number>;
    flagged: Array<{ name: string; version: string; license: string; category: string }>;
    registerClaims: Array<{ name: string; license: string; actual: string | null; status: string }>;
  };
  externalServices: Array<{ name: string; role: string; license: string; commercialUse: string; obligation: string }>;
  costModel: Array<{ kind: string; examples: string; cost: string; detail: string }>;
  summary: Record<string, number | boolean>;
}

interface FallbackResponse {
  window: { hours: number };
  totals: Array<{ outcome: string; errorClass: string | null; count: number }>;
  events: Array<{
    id: string; at: string; requested: string; task: string | null; outcome: string;
    errorClass: string | null; finalProvider: string | null; finalModel: string | null;
    attempts: Array<{ deployment: string; ok: boolean; errorClass?: string; httpStatus?: number }>;
  }>;
}

const TABS = ['Overview', 'Routing', 'Fallbacks', 'Providers', 'Hardware', 'Licences'] as const;
type Tab = (typeof TABS)[number];

async function getJson<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; message: string; status: number }> {
  try {
    const response = await fetch(`/api/v1/platform/admin${path}`, { credentials: 'same-origin', cache: 'no-store' });
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (!response.ok) {
      return { ok: false, status: response.status, message: payload?.error?.message ?? `Request failed (${response.status})` };
    }
    return { ok: true, data: payload as T };
  } catch (error) {
    return { ok: false, status: 0, message: error instanceof Error ? error.message : 'Network error' };
  }
}

function Card({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'warn' | 'bad' }) {
  const colour = tone === 'good' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : tone === 'bad' ? 'text-rose-400' : 'text-slate-100';
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 text-xl font-semibold tabular-nums ${colour}`}>{value}</div>
      {hint && <div className="text-[10px] text-slate-500">{hint}</div>}
    </div>
  );
}

export function AdminView() {
  const [tab, setTab] = useState<Tab>('Overview');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [hardware, setHardware] = useState<HardwareResponse['hardware'] | null>(null);
  const [licences, setLicences] = useState<LicenceResponse | null>(null);
  const [fallbacks, setFallbacks] = useState<FallbackResponse | null>(null);
  const [error, setError] = useState<{ message: string; status: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadOverview = useCallback(async () => {
    const result = await getJson<AdminOverview>('/overview');
    if (result.ok) setOverview(result.data);
    else setError({ message: result.message, status: result.status });
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (tab === 'Hardware' && !hardware) {
      void getJson<HardwareResponse>('/hardware').then((result) => {
        if (result.ok) setHardware(result.data.hardware);
        else setError({ message: result.message, status: result.status });
      });
    }
    if (tab === 'Licences' && !licences) {
      void getJson<LicenceResponse>('/licences').then((result) => {
        if (result.ok) setLicences(result.data);
        else setError({ message: result.message, status: result.status });
      });
    }
    if (tab === 'Fallbacks' && !fallbacks) {
      void getJson<FallbackResponse>('/fallbacks?hours=24&limit=40').then((result) => {
        if (result.ok) setFallbacks(result.data);
        else setError({ message: result.message, status: result.status });
      });
    }
  }, [tab, hardware, licences, fallbacks]);

  const clearCooldown = async (provider: string, model: string) => {
    setBusy(true);
    await fetch('/api/v1/platform/admin/routing', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'clear-cooldown', provider, model }),
    });
    setBusy(false);
    await loadOverview();
  };

  const toggleProvider = async (id: string, enabled: boolean) => {
    setBusy(true);
    const response = await fetch(`/api/v1/platform/admin/providers/${id}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    setBusy(false);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError({ message: payload?.error?.message ?? 'Could not update provider', status: response.status });
      return;
    }
    await loadOverview();
  };

  if (error) {
    return (
      <div className="rounded-lg border border-rose-800/60 bg-rose-950/30 p-4 text-sm text-rose-200">
        <p className="font-semibold">
          {error.status === 403 ? 'Administrator access required' : error.status === 401 ? 'Sign in required' : 'Admin panel unavailable'}
        </p>
        <p className="mt-1 text-xs text-rose-300/80">{error.message}</p>
        <p className="mt-2 text-[11px] text-rose-400/70">
          Platform administration is restricted to accounts with the <code>super_admin</code> or <code>admin</code> role,
          signed in through the browser. An API key never grants it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Super Admin</h1>
          <p className="text-[11px] text-slate-500">
            {overview ? `${overview.admin.email} · ${overview.admin.role}` : 'Loading…'}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-1">
          {TABS.map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setTab(entry)}
              className={`rounded px-2.5 py-1 text-xs ${
                tab === entry ? 'bg-cyan-500/20 font-medium text-cyan-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {entry}
            </button>
          ))}
        </div>
      </div>

      {tab === 'Overview' && overview && (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Card label="Workspaces" value={String(overview.tenants.workspaces)} hint={`${overview.tenants.users} users`} />
            <Card
              label="Models ready"
              value={`${overview.models.selectable}/${overview.models.total}`}
              tone={overview.models.selectable > 0 ? 'good' : 'bad'}
            />
            <Card label="Requests 24h" value={String(overview.usage24h.requests)} hint={`${overview.usage24h.tokens} tokens`} />
            <Card
              label="Fallbacks 24h"
              value={String(overview.usage24h.fallbacks)}
              tone={overview.usage24h.fallbacks > 0 ? 'warn' : 'good'}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Card label="Organisations" value={String(overview.tenants.organisations)} />
            <Card label="Projects" value={String(overview.tenants.projects)} />
            <Card label="Active API keys" value={String(overview.tenants.activeApiKeys)} />
            <Card
              label="Paid lane"
              value={overview.routing.remoteAllowed ? 'ENABLED' : 'off'}
              tone={overview.routing.remoteAllowed ? 'warn' : 'good'}
              hint={overview.routing.remoteAllowed ? 'remote providers may be billed' : 'local + free only'}
            />
          </div>

          <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
            <h2 className="mb-1 text-sm font-semibold text-slate-200">Deployments</h2>
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-1">Deployment</th>
                  <th className="pb-1">Tier</th>
                  <th className="pb-1">Health</th>
                  <th className="pb-1 text-right">Success</th>
                  <th className="pb-1 text-right">Avg ms</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {overview.models.deployments.map((deployment) => (
                  <tr key={deployment.id}>
                    <td className="py-1">
                      <span className="font-mono text-[10px] text-slate-300">{deployment.id}</span>
                      {!deployment.selectable && deployment.blockedReason && (
                        <div className="max-w-md text-[10px] text-slate-600">{deployment.blockedReason}</div>
                      )}
                    </td>
                    <td className="py-1 text-slate-400">{hostingLabel(deployment.hostingType)}</td>
                    <td className="py-1">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] ${
                          deployment.selectable ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        {deployment.health?.status ?? (deployment.selectable ? 'ready' : 'off')}
                      </span>
                    </td>
                    <td className="py-1 text-right tabular-nums text-slate-400">
                      {deployment.health ? `${(deployment.health.successRate * 100).toFixed(0)}%` : '—'}
                    </td>
                    <td className="py-1 text-right tabular-nums text-slate-400">{deployment.health?.avgLatencyMs || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {tab === 'Routing' && overview && (
        <div className="space-y-3">
          <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
            <h2 className="text-sm font-semibold text-slate-200">Configured endpoints</h2>
            <p className="mb-2 text-[11px] text-slate-500">Which environment variables are set. Values are never shown.</p>
            <ul className="space-y-1 text-xs">
              {Object.entries(overview.routing.localEndpoints).map(([name, configured]) => (
                <li key={name} className="flex justify-between">
                  <span className="font-mono text-[11px] text-slate-300">{name}</span>
                  <span className={configured ? 'text-emerald-400' : 'text-slate-600'}>
                    {configured ? 'configured' : 'not set'}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
            <h2 className="mb-1 text-sm font-semibold text-slate-200">
              Cooldowns ({overview.routing.cooldowns.length})
            </h2>
            {overview.routing.cooldowns.length === 0 ? (
              <p className="text-xs text-emerald-400">No deployment is benched.</p>
            ) : (
              <ul className="space-y-1">
                {overview.routing.cooldowns.map((cooldown) => (
                  <li key={`${cooldown.provider}:${cooldown.model}`} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-[11px] text-slate-300">
                      {cooldown.provider}/{cooldown.model}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-amber-400">
                        {Math.max(0, Math.ceil((cooldown.until - Date.now()) / 1000))}s
                        {cooldown.reason ? ` · ${cooldown.reason}` : ''}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void clearCooldown(cooldown.provider, cooldown.model)}
                        className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300 disabled:opacity-50"
                      >
                        Clear
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-[11px] text-slate-400">
            <div className="font-semibold text-slate-300">Fallback policy</div>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>Local deployments are tried before free-cloud, which is tried before remote.</li>
              <li>429, 503, timeout and network faults move to the next candidate; 400 and content-policy stop the chain.</li>
              <li>A classification cooldown is capped at 5 minutes; the engine&apos;s own backoff is capped at 15.</li>
              <li>Three consecutive failures mark a deployment unreachable until a success resets it.</li>
            </ul>
          </section>
        </div>
      )}

      {tab === 'Fallbacks' && (
        <div className="space-y-3">
          {!fallbacks && <p className="text-xs text-slate-500">Loading fallback log…</p>}
          {fallbacks && (
            <>
              <div className="flex flex-wrap gap-2 text-[11px]">
                {fallbacks.totals.length === 0 && <span className="text-emerald-400">No fallbacks in the last 24h.</span>}
                {fallbacks.totals.map((row) => (
                  <span key={`${row.outcome}-${row.errorClass}`} className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">
                    {row.outcome}
                    {row.errorClass ? ` (${row.errorClass})` : ''}: {row.count}
                  </span>
                ))}
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full min-w-[40rem] text-left text-xs">
                  <thead className="bg-slate-900/80 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-1">When</th>
                      <th className="px-2 py-1">Requested</th>
                      <th className="px-2 py-1">Chain</th>
                      <th className="px-2 py-1">Served by</th>
                      <th className="px-2 py-1">Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {fallbacks.events.map((event) => (
                      <tr key={event.id}>
                        <td className="px-2 py-1 text-[10px] text-slate-500">{new Date(event.at).toLocaleString()}</td>
                        <td className="px-2 py-1 font-mono text-[10px] text-slate-400">{event.requested}</td>
                        <td className="px-2 py-1">
                          <ol className="space-y-0.5">
                            {event.attempts.map((attempt, index) => (
                              <li key={`${event.id}-${index}`} className="font-mono text-[10px]">
                                <span className={attempt.ok ? 'text-emerald-400' : 'text-rose-400'}>
                                  {attempt.ok ? '✓' : '✕'}
                                </span>{' '}
                                <span className="text-slate-400">{attempt.deployment}</span>
                                {attempt.errorClass && (
                                  <span className="text-rose-400/80"> · {attemptReason(attempt.errorClass)}</span>
                                )}
                              </li>
                            ))}
                          </ol>
                        </td>
                        <td className="px-2 py-1 font-mono text-[10px] text-slate-300">
                          {event.finalModel ?? '—'}
                        </td>
                        <td className="px-2 py-1">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] ${
                              event.outcome === 'success' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
                            }`}
                          >
                            {event.outcome}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {fallbacks.events.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-2 py-6 text-center text-slate-500">
                          Nothing logged in this window.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'Providers' && overview && (
        <section className="space-y-2">
          {overview.providers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-800 p-4 text-xs text-slate-500">
              No provider rows configured in the database. The platform is currently routing entirely from
              environment-configured endpoints, which is the recommended production setup for a self-hosted install.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-1">Provider</th>
                  <th className="pb-1">Base URL</th>
                  <th className="pb-1">Key</th>
                  <th className="pb-1">Priority</th>
                  <th className="pb-1">Health</th>
                  <th className="pb-1 text-right">Enabled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {overview.providers.map((provider) => (
                  <tr key={provider.id}>
                    <td className="py-1">
                      <div className="text-slate-200">{provider.displayName}</div>
                      <div className="font-mono text-[10px] text-slate-500">
                        {provider.provider}
                        {provider.isLocal ? ' · local' : ''}
                      </div>
                    </td>
                    <td className="py-1 font-mono text-[10px] text-slate-400">{provider.baseUrl ?? '—'}</td>
                    <td className="py-1 text-[10px] text-slate-400">{provider.keyHint ?? 'none'}</td>
                    <td className="py-1 tabular-nums text-slate-400">{provider.priority}</td>
                    <td className="py-1 text-[10px] text-slate-400">{provider.lastHealthStatus ?? 'unknown'}</td>
                    <td className="py-1 text-right">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void toggleProvider(provider.id, !provider.enabled)}
                        className={`rounded px-1.5 py-0.5 text-[10px] ${
                          provider.enabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-500'
                        } disabled:opacity-50`}
                      >
                        {provider.enabled ? 'enabled' : 'disabled'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-[11px] text-slate-500">
            Enabling a remote provider does not by itself spend money: the router only considers remote
            deployments when <code className="rounded bg-slate-800 px-1">ALO_ALLOW_REMOTE_MODELS=true</code> is
            set on the server.
          </p>
        </section>
      )}

      {tab === 'Hardware' && (
        <div className="space-y-3">
          {!hardware && <p className="text-xs text-slate-500">Probing host…</p>}
          {hardware && (
            <>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Card label="CPU cores" value={String(hardware.cpu.cores)} hint={`load ${hardware.cpu.loadAverage1m}`} />
                <Card label="Memory" value={`${hardware.memory.totalGb} GB`} hint={`${hardware.memory.usedPct}% used`} />
                <Card
                  label="Storage free"
                  value={hardware.storage ? `${hardware.storage.freeGb} GB` : 'n/a'}
                  hint={hardware.storage ? `of ${hardware.storage.totalGb} GB` : undefined}
                  tone={hardware.storage && hardware.storage.freeGb < 10 ? 'warn' : undefined}
                />
                <Card
                  label="GPU"
                  value={hardware.gpu.present ? 'present' : 'none'}
                  hint={hardware.gpu.detectedVia}
                  tone={hardware.gpu.present ? 'good' : 'warn'}
                />
              </div>

              <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                <h2 className="mb-1 text-sm font-semibold text-slate-200">What this host can run</h2>
                <ul className="space-y-1 text-xs">
                  {[
                    ['Small local models (≤3B)', hardware.verdict.canRunSmallLocalModels],
                    ['7B models', hardware.verdict.canRun7bModels],
                    ['13B models', hardware.verdict.canRun13bModels],
                    ['Image generation', hardware.verdict.canRunImageGeneration],
                  ].map(([label, ok]) => (
                    <li key={String(label)} className="flex items-center justify-between">
                      <span className="text-slate-300">{label}</span>
                      <span className={ok ? 'text-emerald-400' : 'text-rose-400'}>{ok ? 'yes' : 'no'}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                <h2 className="mb-1 text-sm font-semibold text-slate-200">Measurements</h2>
                <ul className="space-y-0.5 text-[11px] text-slate-400">
                  {hardware.verdict.reasons.map((reason, index) => (
                    <li key={index}>· {reason}</li>
                  ))}
                </ul>
                {hardware.gpu.note && <p className="mt-1 text-[11px] text-amber-400/80">{hardware.gpu.note}</p>}
              </section>
            </>
          )}
        </div>
      )}

      {tab === 'Licences' && (
        <div className="space-y-3">
          {!licences && <p className="text-xs text-slate-500">Inspecting the installed tree…</p>}
          {licences && (
            <>
              <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                <h2 className="text-sm font-semibold text-slate-200">Application</h2>
                <dl className="mt-1 grid gap-x-4 gap-y-0.5 text-[11px] sm:grid-cols-2">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Package</dt>
                    <dd className="text-slate-300">{licences.application.name}@{licences.application.version}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Commit</dt>
                    <dd className="font-mono text-slate-300">{licences.application.commit.slice(0, 12)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Declared licence</dt>
                    <dd className="text-slate-300">{licences.application.declaredLicense ?? 'NONE'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">LICENSE file</dt>
                    <dd className="text-slate-300">{licences.application.licenseFiles.join(', ') || 'MISSING'}</dd>
                  </div>
                </dl>
                {licences.application.findings.length > 0 ? (
                  <ul className="mt-2 space-y-1 rounded border border-amber-800/60 bg-amber-950/30 p-2 text-[11px] text-amber-200">
                    {licences.application.findings.map((finding, index) => (
                      <li key={index}>! {finding}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[11px] text-emerald-400">
                    Licence is declared consistently: package.json, LICENSE file and README agree.
                  </p>
                )}
              </section>

              <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                <h2 className="mb-1 text-sm font-semibold text-slate-200">
                  Dependencies ({licences.dependencies.total} inspected)
                </h2>
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  {Object.entries(licences.dependencies.byCategory).map(([category, count]) => (
                    <span
                      key={category}
                      className={`rounded px-1.5 py-0.5 ${
                        category === 'copyleft' || category === 'network-copyleft'
                          ? 'bg-amber-500/15 text-amber-300'
                          : category === 'unknown'
                          ? 'bg-rose-500/15 text-rose-300'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {category}: {count}
                    </span>
                  ))}
                </div>
                {licences.dependencies.flagged.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-[10px] text-slate-400">
                    {licences.dependencies.flagged.map((row) => (
                      <li key={`${row.name}@${row.version}`}>
                        <span className="text-amber-400">{row.category}</span> {row.name}@{row.version} ({row.license})
                      </li>
                    ))}
                  </ul>
                )}
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] text-slate-400">
                    Register claims re-checked against the installed tree
                  </summary>
                  <ul className="mt-1 space-y-0.5 text-[10px]">
                    {licences.dependencies.registerClaims.map((claim) => (
                      <li key={claim.name} className={claim.status === 'matches' ? 'text-emerald-400/80' : 'text-rose-400'}>
                        {claim.status === 'matches' ? 'ok' : 'FAIL'} {claim.name} — claimed {claim.license}, actual{' '}
                        {claim.actual ?? 'not installed'}
                      </li>
                    ))}
                  </ul>
                </details>
              </section>

              <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                <h2 className="mb-1 text-sm font-semibold text-slate-200">External services and obligations</h2>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[38rem] text-left text-[11px]">
                    <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="py-1">Service</th>
                        <th className="py-1">Licence</th>
                        <th className="py-1">Obligation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {licences.externalServices.map((service) => (
                        <tr key={service.name}>
                          <td className="py-1 align-top">
                            <div className="text-slate-200">{service.name}</div>
                            <div className="text-[10px] text-slate-500">{service.role}</div>
                          </td>
                          <td className="py-1 align-top text-slate-400">{service.license}</td>
                          <td className="py-1 align-top text-slate-400">{service.obligation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                <h2 className="mb-1 text-sm font-semibold text-slate-200">Cost model</h2>
                <ul className="space-y-1 text-[11px]">
                  {licences.costModel.map((row) => (
                    <li key={row.kind}>
                      <span className="font-semibold text-slate-300">{row.kind}</span>
                      <span className="text-slate-500"> — {row.cost}</span>
                      <div className="text-slate-400">{row.detail}</div>
                      <div className="text-[10px] text-slate-600">e.g. {row.examples}</div>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
