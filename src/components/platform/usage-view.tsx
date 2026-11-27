'use client';

/**
 * Usage dashboard.
 *
 * Reads the same `AiUsageRecord` rows the fallback engine writes, so the number
 * on screen is the number that was recorded per request — not a separately
 * maintained counter that can drift.
 */

import { useEffect, useState } from 'react';
import { platformApi, hostingLabel, type UsageResponse } from '@/lib/platform/client';

const GROUPS = [
  { id: 'day', label: 'By day' },
  { id: 'model', label: 'By model' },
  { id: 'provider', label: 'By provider' },
  { id: 'project', label: 'By project' },
] as const;

export function UsageView() {
  const [days, setDays] = useState(30);
  const [groupBy, setGroupBy] = useState<'day' | 'model' | 'provider' | 'project'>('model');
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    platformApi.usage(days, groupBy).then((result) => {
      if (result.ok) setUsage(result.data);
      else setError(result.message);
    });
  }, [days, groupBy]);

  const max = Math.max(1, ...(usage?.rows.map((row) => row.requests) ?? [1]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Usage</h1>
        <p className="text-xs text-slate-500">
          One row per model call, including failed attempts and fallbacks. Local and free-tier lanes record
          zero cost.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-slate-700 p-0.5">
          {[7, 30, 90].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setDays(option)}
              className={`rounded px-2.5 py-1 text-xs ${
                days === option ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {option}d
            </button>
          ))}
        </div>
        <select
          value={groupBy}
          onChange={(event) => setGroupBy(event.target.value as typeof groupBy)}
          className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
          aria-label="Group by"
        >
          {GROUPS.map((group) => (
            <option key={group.id} value={group.id}>{group.label}</option>
          ))}
        </select>
      </div>

      {error && <p className="rounded border border-red-800/60 bg-red-950/30 p-2 text-xs text-red-300">{error}</p>}

      {usage && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Requests</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-100">{usage.totals.requests}</div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Tokens</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-100">
                {usage.totals.tokens.toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Fallbacks</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-amber-400">{usage.totals.fallbacks}</div>
              <div className="text-[10px] text-slate-500">{(usage.totals.fallbackRate * 100).toFixed(1)}% of requests</div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Avg latency</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-100">{usage.totals.avgLatencyMs} ms</div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-1">{groupBy}</th>
                  <th className="pb-1 text-right">Requests</th>
                  <th className="pb-1 text-right">Tokens</th>
                  <th className="pb-1 text-right">Failures</th>
                  <th className="pb-1 text-right">Avg ms</th>
                  <th className="pb-1 pl-3">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {usage.rows.map((row) => (
                  <tr key={row.key}>
                    <td className="py-1 pr-2 font-mono text-[11px] text-slate-300">
                      {groupBy === 'project' && row.key === 'unassigned' ? 'Unassigned' : row.key}
                    </td>
                    <td className="py-1 text-right tabular-nums text-slate-200">{row.requests}</td>
                    <td className="py-1 text-right tabular-nums text-slate-400">{row.tokens.toLocaleString()}</td>
                    <td className={`py-1 text-right tabular-nums ${row.failures > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                      {row.failures}
                    </td>
                    <td className="py-1 text-right tabular-nums text-slate-400">{row.avgLatencyMs}</td>
                    <td className="py-1 pl-3">
                      <div className="h-1.5 w-full rounded bg-slate-800">
                        <div
                          className="h-1.5 rounded bg-cyan-500"
                          style={{ width: `${Math.max(2, (row.requests / max) * 100)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
                {usage.rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500">
                      No usage in this window. Send a chat message to record one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-slate-500">
            {hostingLabel('local')} and {hostingLabel('free-cloud').toLowerCase()} traffic costs nothing per token;
            only an administrator-enabled remote provider can produce a non-zero cost.
          </p>
        </>
      )}
    </div>
  );
}
