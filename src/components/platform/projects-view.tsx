'use client';

/** Projects: the unit of key scoping and usage attribution. */

import { useCallback, useEffect, useState } from 'react';
import { platformApi, type ProjectRow } from '@/lib/platform/client';

export function ProjectsView() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const result = await platformApi.projects();
    if (result.ok) setProjects(result.data.projects);
    else setError(result.message);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const result = await platformApi.createProject({
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
    });
    setBusy(false);
    if (result.ok) {
      setName('');
      setDescription('');
      await refresh();
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Projects</h1>
        <p className="text-xs text-slate-500">
          A project groups keys, conversations and usage. It is an attribution boundary; the workspace is the
          security boundary.
        </p>
      </div>

      {error && <p className="rounded border border-red-800/60 bg-red-950/30 p-2 text-xs text-red-300">{error}</p>}

      <section className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Project name"
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
          />
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What is this project for? (optional)"
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
          />
          <button
            type="button"
            onClick={() => void create()}
            disabled={!name.trim() || busy}
            className="rounded bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 disabled:bg-slate-700 disabled:text-slate-500"
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <div key={project.id} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <div className="text-sm font-medium text-slate-200">{project.name}</div>
            <div className="font-mono text-[10px] text-slate-500">{project.slug}</div>
            {project.description && <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">{project.description}</p>}
            <dl className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px]">
              <div className="rounded bg-slate-950/60 py-1">
                <dt className="text-slate-500">Keys</dt>
                <dd className="tabular-nums text-slate-300">{project.counts.apiKeys}</dd>
              </div>
              <div className="rounded bg-slate-950/60 py-1">
                <dt className="text-slate-500">Chats</dt>
                <dd className="tabular-nums text-slate-300">{project.counts.conversations}</dd>
              </div>
              <div className="rounded bg-slate-950/60 py-1">
                <dt className="text-slate-500">Files</dt>
                <dd className="tabular-nums text-slate-300">{project.counts.files}</dd>
              </div>
            </dl>
          </div>
        ))}
        {projects.length === 0 && (
          <p className="col-span-full rounded-lg border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">
            No projects yet.
          </p>
        )}
      </div>
    </div>
  );
}
