'use client';

/**
 * Project API key management.
 *
 * The plaintext key is displayed exactly once, in a modal the user must
 * acknowledge, because it is stored only as a SHA-256 hash — there is no
 * "reveal" endpoint and inventing one would defeat the point of hashing.
 */

import { useCallback, useEffect, useState } from 'react';
import { platformApi, type ApiKeyRow, type ProjectRow } from '@/lib/platform/client';

const SCOPE_OPTIONS = [
  { id: 'ai:chat', label: 'Chat' },
  { id: 'ai:embed', label: 'Embeddings' },
  { id: 'models:read', label: 'Read models' },
  { id: 'usage:read', label: 'Read usage' },
  { id: 'conversations:read', label: 'Read conversations' },
  { id: 'conversations:write', label: 'Write conversations' },
  { id: 'files:read', label: 'Read files' },
  { id: 'files:write', label: 'Write files' },
  { id: 'ai:code', label: 'Coding tasks' },
  { id: 'agents:run', label: 'Run agents' },
];

export function KeysView() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['ai:chat', 'models:read', 'usage:read']);
  const [projectId, setProjectId] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('');

  // The one-time secret. Kept in state only — never written to storage.
  const [revealed, setRevealed] = useState<{ plaintext: string; label: string } | null>(null);

  const refresh = useCallback(async () => {
    const [keysResult, projectsResult] = await Promise.all([platformApi.keys(), platformApi.projects()]);
    if (keysResult.ok) setKeys(keysResult.data.keys);
    else setError(keysResult.message);
    if (projectsResult.ok) setProjects(projectsResult.data.projects);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const result = await platformApi.createKey({
      name: name.trim(),
      scopes,
      ...(projectId ? { projectId } : {}),
      ...(expiresInDays ? { expiresInDays: Number(expiresInDays) } : {}),
    });
    setBusy(false);
    if (result.ok) {
      setRevealed({ plaintext: result.data.plaintext, label: result.data.key.name });
      setName('');
      await refresh();
    } else {
      setError(result.message);
    }
  };

  const revoke = async (keyId: string) => {
    const result = await platformApi.revokeKey(keyId);
    if (result.ok) await refresh();
    else setError(result.message);
  };

  const rotate = async (keyId: string) => {
    const result = await platformApi.rotateKey(keyId);
    if (result.ok) {
      setRevealed({ plaintext: result.data.plaintext, label: `${result.data.key.name} (rotated)` });
      await refresh();
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">API keys</h1>
        <p className="text-xs text-slate-500">
          Keys are hashed with SHA-256 and shown once. They are separate from any provider credential the
          administrator configures.
        </p>
      </div>

      {error && (
        <div className="flex items-start justify-between rounded border border-red-800/60 bg-red-950/30 p-2 text-xs text-red-300">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-2 text-red-400">✕</button>
        </div>
      )}

      {revealed && (
        <div className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 p-3">
          <div className="text-xs font-semibold text-emerald-300">
            New key for “{revealed.label}” — copy it now
          </div>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded bg-slate-950 px-2 py-1.5 font-mono text-[11px] text-emerald-200">
              {revealed.plaintext}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(revealed.plaintext);
              }}
              className="rounded border border-emerald-700 px-2 py-1 text-[11px] text-emerald-300"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => setRevealed(null)}
              className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-slate-950"
            >
              Done
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-emerald-400/80">
            This value is not stored anywhere and cannot be shown again.
          </p>
        </div>
      )}

      {/* Create */}
      <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-200">Create a key</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-[11px] text-slate-400">
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="CI pipeline"
              className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
            />
          </label>
          <label className="text-[11px] text-slate-400">
            Project (optional)
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
            >
              <option value="">All workspace projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-slate-400">
            Expires in (days, optional)
            <input
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(event.target.value.replace(/\D/g, ''))}
              placeholder="never"
              className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void create()}
              disabled={!name.trim() || busy || scopes.length === 0}
              className="w-full rounded bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 disabled:bg-slate-700 disabled:text-slate-500"
            >
              {busy ? 'Creating…' : 'Create key'}
            </button>
          </div>
        </div>

        <div className="mt-3">
          <div className="text-[11px] text-slate-400">Scopes</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {SCOPE_OPTIONS.map((scope) => {
              const on = scopes.includes(scope.id);
              return (
                <button
                  key={scope.id}
                  type="button"
                  onClick={() =>
                    setScopes((prev) => (on ? prev.filter((s) => s !== scope.id) : [...prev, scope.id]))
                  }
                  className={`rounded border px-1.5 py-0.5 text-[10px] ${
                    on
                      ? 'border-cyan-600/60 bg-cyan-500/15 text-cyan-300'
                      : 'border-slate-700 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {scope.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* List */}
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full min-w-[44rem] text-left text-xs">
          <thead className="bg-slate-900/80 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Key</th>
              <th className="px-3 py-2">Scopes</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Last used</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {keys.map((key) => (
              <tr key={key.id}>
                <td className="px-3 py-2 text-slate-200">
                  {key.name}
                  {key.rotatedFrom && <span className="ml-1 text-[10px] text-slate-500">(rotated)</span>}
                </td>
                <td className="px-3 py-2 font-mono text-[10px] text-slate-400">{key.maskedKey}</td>
                <td className="px-3 py-2 text-[10px] text-slate-400">{key.scopes.length} scopes</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] ${
                      key.status === 'active'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {key.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-[10px] text-slate-500">
                  {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'never'}
                </td>
                <td className="px-3 py-2 text-right">
                  {key.status === 'active' ? (
                    <span className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => void rotate(key.id)}
                        className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300"
                      >
                        Rotate
                      </button>
                      <button
                        type="button"
                        onClick={() => void revoke(key.id)}
                        className="rounded border border-rose-800 px-1.5 py-0.5 text-[10px] text-rose-300"
                      >
                        Revoke
                      </button>
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-600">—</span>
                  )}
                </td>
              </tr>
            ))}
            {keys.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  No keys yet. Create one to call the API from outside the browser.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-[11px] text-slate-400">
        <div className="font-semibold text-slate-300">Using a key</div>
        <pre className="mt-1 overflow-x-auto rounded bg-slate-950 p-2 font-mono text-[10px] text-slate-300">
{`curl -X POST $HOST/api/v1/platform/chat \\
  -H "x-api-key: alo_pk_..." \\
  -H "content-type: application/json" \\
  -d '{"messages":[{"role":"user","content":"Hello"}]}'`}
        </pre>
      </section>
    </div>
  );
}
