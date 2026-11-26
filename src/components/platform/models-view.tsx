'use client';

/**
 * Model catalogue with availability gates.
 *
 * Requirement: "Do not show a feature as available when the required
 * model/GPU/worker/storage is missing; display hardware+model requirements."
 *
 * Every deployment is listed — including the ones that cannot run here — with
 * the reason and the approximate memory it needs. Hiding them would make the
 * platform look smaller than it is; showing them without the reason would make
 * it look broken.
 */

import { useEffect, useState } from 'react';
import { platformApi, hostingLabel, type ModelEntry } from '@/lib/platform/client';

const HOSTING_ORDER: Record<string, number> = { local: 0, 'free-cloud': 1, remote: 2 };

export function ModelsView() {
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [counts, setCounts] = useState<{ total: number; selectable: number; byHostingType: Record<string, number> } | null>(null);
  const [filter, setFilter] = useState<'all' | 'selectable'>('all');
  const [capability, setCapability] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    platformApi.models().then((result) => {
      if (result.ok) {
        setModels(result.data.models);
        setCounts(result.data.counts);
      } else {
        setError(result.message);
      }
      setLoading(false);
    });
  }, []);

  const capabilities = [...new Set(models.flatMap((m) => m.capabilities))].sort();
  const visible = models
    .filter((m) => (filter === 'selectable' ? m.selectable : true))
    .filter((m) => (capability ? m.capabilities.includes(capability) : true))
    .sort((a, b) => (HOSTING_ORDER[a.hostingType] ?? 9) - (HOSTING_ORDER[b.hostingType] ?? 9) || a.priority - b.priority);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Models</h1>
        <p className="text-xs text-slate-500">
          The registry describes deployments, not just weights: the same model served by two backends has two
          independent health states.
        </p>
      </div>

      {counts && (
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
            {counts.selectable} selectable
          </span>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-400">
            {counts.total - counts.selectable} unavailable
          </span>
          {Object.entries(counts.byHostingType).map(([tier, count]) => (
            <span key={tier} className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-400">
              {hostingLabel(tier)}: {count}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-slate-700 p-0.5">
          {(['all', 'selectable'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={`rounded px-2.5 py-1 text-xs capitalize ${
                filter === option ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        <select
          value={capability}
          onChange={(event) => setCapability(event.target.value)}
          className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
          aria-label="Filter by capability"
        >
          <option value="">Any capability</option>
          {capabilities.map((entry) => (
            <option key={entry} value={entry}>{entry}</option>
          ))}
        </select>
      </div>

      {error && <p className="rounded border border-red-800/60 bg-red-950/30 p-2 text-xs text-red-300">{error}</p>}
      {loading && <p className="text-xs text-slate-500">Probing backends…</p>}

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full min-w-[46rem] text-left text-xs">
          <thead className="bg-slate-900/80 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Deployment</th>
              <th className="px-3 py-2">Hosting</th>
              <th className="px-3 py-2">Context</th>
              <th className="px-3 py-2">Memory</th>
              <th className="px-3 py-2">Capabilities</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {visible.map((model) => (
              <tr key={model.id} className={model.selectable ? '' : 'opacity-60'}>
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-200">{model.displayName}</div>
                  <div className="font-mono text-[10px] text-slate-500">{model.id}</div>
                </td>
                <td className="px-3 py-2 text-slate-400">{hostingLabel(model.hostingType)}</td>
                <td className="px-3 py-2 tabular-nums text-slate-400">{model.contextLength.toLocaleString()}</td>
                <td className="px-3 py-2 tabular-nums text-slate-400">
                  {model.approxSizeGb > 0 ? `~${model.approxSizeGb} GB` : '—'}
                </td>
                <td className="px-3 py-2">
                  <span className="flex flex-wrap gap-1">
                    {model.capabilities.slice(0, 4).map((cap) => (
                      <span key={cap} className="rounded bg-slate-800 px-1 py-0.5 text-[10px] text-slate-400">
                        {cap}
                      </span>
                    ))}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {model.selectable ? (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">ready</span>
                  ) : (
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400" title={model.blockedReason}>
                      unavailable
                    </span>
                  )}
                  {!model.selectable && model.blockedReason && (
                    <div className="mt-1 max-w-xs text-[10px] leading-snug text-slate-500">{model.blockedReason}</div>
                  )}
                  {model.selectable && model.notes && (
                    <div className="mt-1 max-w-xs text-[10px] leading-snug text-amber-500/80">{model.notes}</div>
                  )}
                </td>
              </tr>
            ))}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  Nothing matches this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-slate-500">
        Memory figures are the approximate VRAM/RAM needed to serve the deployment. A model marked
        &ldquo;unavailable&rdquo; has no reachable backend on this host — the reason is shown rather than hidden.
      </p>
    </div>
  );
}
