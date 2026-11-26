'use client';

/**
 * Workspace settings.
 *
 * Shows the tenant's own facts plus a live health table for its providers.
 * Provider *configuration* (base URLs, keys, enabling paid lanes) is an
 * administrator action and lives in the Super Admin panel — a workspace owner
 * must not be able to route the whole platform's traffic to a paid API.
 */

import { useEffect, useState } from 'react';
import { platformApi, hostingLabel, type HealthResponse, type MeResponse } from '@/lib/platform/client';

export function SettingsView() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const load = async () => {
    const [meResult, healthResult] = await Promise.all([platformApi.me(), platformApi.health()]);
    if (meResult.ok) setMe(meResult.data);
    else setError(meResult.message);
    if (healthResult.ok) setHealth(healthResult.data);
  };

  useEffect(() => {
    void load();
  }, []);

  const createWorkspace = async () => {
    setCreating(true);
    const response = await fetch('/api/v1/platform/workspaces/ensure', {
      method: 'POST',
      credentials: 'same-origin',
    });
    const payload = (await response.json().catch(() => null)) as
      | { apiKey?: string; error?: { message?: string } }
      | null;
    setCreating(false);
    if (!response.ok) {
      setError(payload?.error?.message ?? 'Could not create a workspace');
      return;
    }
    if (payload?.apiKey) setNewKey(payload.apiKey);
    await load();
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Settings</h1>
        <p className="text-xs text-slate-500">Workspace identity, access and backend state.</p>
      </div>

      {error && <p className="rounded border border-red-800/60 bg-red-950/30 p-2 text-xs text-red-300">{error}</p>}

      {me && !me.workspace && (
        <section className="rounded-lg border border-cyan-800/60 bg-cyan-950/30 p-4">
          <h2 className="text-sm font-semibold text-cyan-200">You have no workspace yet</h2>
          <p className="mt-1 text-xs text-cyan-300/80">
            A workspace holds your projects, API keys, conversations and usage. Creating one also issues your
            first API key, which is shown once.
          </p>
          <button
            type="button"
            onClick={() => void createWorkspace()}
            disabled={creating}
            className="mt-2 rounded bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 disabled:bg-slate-700 disabled:text-slate-500"
          >
            {creating ? 'Creating…' : 'Create my workspace'}
          </button>
          {newKey && (
            <div className="mt-2 rounded border border-emerald-700/60 bg-emerald-950/40 p-2">
              <div className="text-[11px] font-semibold text-emerald-300">Your API key — copy it now</div>
              <code className="mt-1 block overflow-x-auto font-mono text-[10px] text-emerald-200">{newKey}</code>
            </div>
          )}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">Workspace</h2>
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Name</dt>
              <dd className="text-slate-200">{me?.workspace?.name ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Slug</dt>
              <dd className="font-mono text-[11px] text-slate-300">{me?.workspace?.slug ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Kind</dt>
              <dd className="capitalize text-slate-200">{me?.workspace?.kind ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Plan</dt>
              <dd className="text-slate-200">{me?.workspace?.plan ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Your role</dt>
              <dd className="text-slate-200">
                {me?.permissions.canAdministerWorkspace ? 'owner / admin' : 'member'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Requests this minute</dt>
              <dd className="tabular-nums text-slate-200">
                {me ? `limit ${me.principal.rateLimitPerMinute}/min` : '—'}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">Granted scopes</h2>
          <div className="flex flex-wrap gap-1">
            {(me?.principal.scopes ?? []).map((scope) => (
              <span key={scope} className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                {scope}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            {me?.principal.kind === 'api-key'
              ? 'This session is authenticated with an API key, so its scopes are limited to the key.'
              : 'A browser session carries the full workspace scope set; each API key you create gets only what you grant it.'}
          </p>
        </section>
      </div>

      <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-200">Backend health</h2>
        <p className="mb-2 text-[11px] text-slate-500">
          Provider configuration and paid-lane enablement are administrator-only and live in the Super Admin
          panel.
        </p>
        <table className="w-full text-left text-xs">
          <thead className="text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="pb-1">Deployment</th>
              <th className="pb-1">Tier</th>
              <th className="pb-1">Status</th>
              <th className="pb-1 text-right">Success</th>
              <th className="pb-1 text-right">Avg ms</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {(health?.deployments ?? []).map((deployment) => (
              <tr key={deployment.id}>
                <td className="py-1 font-mono text-[10px] text-slate-300">{deployment.id}</td>
                <td className="py-1 text-slate-400">{hostingLabel(deployment.hostingType)}</td>
                <td className="py-1">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] ${
                      deployment.selectable ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {deployment.selectable ? (deployment.health?.status ?? 'ready') : 'off'}
                  </span>
                </td>
                <td className="py-1 text-right tabular-nums text-slate-400">
                  {deployment.health ? `${(deployment.health.successRate * 100).toFixed(0)}%` : '—'}
                </td>
                <td className="py-1 text-right tabular-nums text-slate-400">{deployment.health?.avgLatencyMs ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-[11px] text-slate-400">
        <div className="font-semibold text-slate-300">Data isolation</div>
        <p className="mt-1">
          Every request is resolved to your workspace before any query runs. Projects, keys, conversations,
          files and usage belonging to another workspace return 404 — not 403 — so the API cannot be used to
          discover what exists.
        </p>
      </section>
    </div>
  );
}
