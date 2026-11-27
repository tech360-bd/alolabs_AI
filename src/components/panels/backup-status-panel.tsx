'use client';

/**
 * Backup status panel.
 *
 * The production backup failed for three days and nobody knew, because the result
 * lived only inside a workflow run. This panel exists to make the opposite true:
 * the age of the newest *verified* backup is on the dashboard, and "verified" means
 * a restore was performed and read back — not that an upload returned 200.
 *
 * Nothing here can contain a credential: the API returns already-redacted excerpts,
 * and the panel renders text only.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  HardDriveDownload,
  RefreshCw,
  ShieldQuestion,
  XCircle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import type { DashboardPanelProps } from '@/lib/dashboard/navigation';

interface Health {
  verdict: 'ok' | 'stale' | 'failed' | 'never' | 'unverified';
  reason: string;
  environment: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  ageHours: number | null;
  consecutiveFailures: number;
  lastStatus: string | null;
  lastStage: string | null;
  lastArtifactBytes: number | null;
  lastChecksum: string | null;
  restoreVerifiedAt: string | null;
  restoreEvidence: boolean;
  actions: string[];
}

interface RunRow {
  id: string;
  status: string;
  stage: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  artifactBytes: number | null;
  checksum: string | null;
  restoreTested: boolean;
  source: string;
  failureExcerpt: string | null;
}

interface Response {
  health: Health;
  runs: RunRow[];
  lastFailure: { stage: string; excerpt: string | null; at: string | null } | null;
}

const VERDICT_STYLE: Record<Health['verdict'], { icon: typeof CheckCircle2; tone: string; label: string }> = {
  ok: { icon: CheckCircle2, tone: 'text-emerald-400', label: 'Verified' },
  unverified: { icon: ShieldQuestion, tone: 'text-amber-400', label: 'No restore proof' },
  stale: { icon: Clock, tone: 'text-amber-400', label: 'Stale' },
  failed: { icon: XCircle, tone: 'text-rose-400', label: 'Failing' },
  never: { icon: AlertTriangle, tone: 'text-rose-400', label: 'Never ran' },
};

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return 'never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toLocaleString();
}

export default function BackupStatusPanel(_props: DashboardPanelProps) {
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch('/api/super-admin/backups');
      if (!response.ok) {
        setError(
          response.status === 403
            ? 'Only a super administrator can see backup status.'
            : `Backup status is unavailable (HTTP ${response.status}).`,
        );
        return;
      }
      setData((await response.json()) as Response);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Backup status could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const health = data?.health;
  const style = health ? VERDICT_STYLE[health.verdict] : VERDICT_STYLE.never;
  const Icon = style.icon;

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-white">
            <Database className="h-5 w-5 text-sky-400" />
            Backup verification
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            A snapshot counts as verified only when it can be read back. This panel reports the newest
            successful backup, its age, and whether an isolated restore was actually performed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {health && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Icon className={`h-6 w-6 ${style.tone}`} />
            <span className={`text-lg font-semibold ${style.tone}`}>{style.label}</span>
            <span className="text-sm text-slate-400">{health.environment}</span>
            {health.consecutiveFailures > 1 && (
              <span className="rounded bg-rose-500/15 px-2 py-0.5 text-xs text-rose-300">
                {health.consecutiveFailures} consecutive failures
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-slate-300">{health.reason}</p>
          {health.actions.length > 0 && (
            <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-amber-200/90">
              {health.actions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          )}

          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['Last attempt', formatWhen(health.lastAttemptAt)],
              ['Last verified backup', formatWhen(health.lastSuccessAt)],
              ['Age', health.ageHours == null ? '—' : `${health.ageHours} h`],
              ['Artifact size', formatBytes(health.lastArtifactBytes)],
              ['Restore proven', health.restoreEvidence ? formatWhen(health.restoreVerifiedAt) : 'not yet'],
              ['Checksum', health.lastChecksum ? `${health.lastChecksum.slice(0, 16)}…` : '—'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
                <dd className="mt-1 text-sm text-slate-200">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {data?.lastFailure && (
        <section className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-rose-200">
            <HardDriveDownload className="h-4 w-4" />
            Last failure — {data.lastFailure.stage} stage
          </h3>
          <p className="mt-1 text-xs text-slate-400">{formatWhen(data.lastFailure.at)}</p>
          {data.lastFailure.excerpt && (
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-950/60 p-2 text-xs text-slate-300">
              {data.lastFailure.excerpt}
            </pre>
          )}
        </section>
      )}

      <section className="rounded-xl border border-slate-800">
        <h3 className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-200">
          Recent attempts
        </h3>
        {data && data.runs.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">
            No attempt has ever been reported. Configure the host to post to{' '}
            <code className="rounded bg-slate-800 px-1">/api/ops/backups/ingest</code> — until then this is
            truthfully “unknown”, not “fine”.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Finished</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Stage</th>
                  <th className="px-4 py-2">Size</th>
                  <th className="px-4 py-2">Restore</th>
                  <th className="px-4 py-2">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {data?.runs.map((run) => (
                  <tr key={run.id} className="text-slate-300">
                    <td className="px-4 py-2">{formatWhen(run.finishedAt ?? run.startedAt)}</td>
                    <td className="px-4 py-2">
                      <span
                        className={
                          run.status === 'succeeded'
                            ? 'text-emerald-400'
                            : run.status === 'failed'
                              ? 'text-rose-400'
                              : 'text-slate-400'
                        }
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">{run.stage ?? '—'}</td>
                    <td className="px-4 py-2">{formatBytes(run.artifactBytes)}</td>
                    <td className="px-4 py-2">{run.restoreTested ? 'verified' : 'not tested'}</td>
                    <td className="px-4 py-2">{run.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
