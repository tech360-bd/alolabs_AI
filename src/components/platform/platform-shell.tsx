'use client';

/**
 * ALO Open AI Platform — application shell.
 *
 * One sidebar for the whole product, with the navigation the specification
 * asks for. Sections whose backend does not exist yet are rendered as
 * explicitly *not available* rather than as links that 404: a navigation entry
 * that silently fails is worse than an honest "coming later", because the user
 * cannot tell whether they mis-clicked or the product is broken.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { platformApi, type MeResponse } from '@/lib/platform/client';

interface NavItem {
  href: string;
  label: string;
  /** `null` = available; a string = what is missing. */
  unavailable?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    title: 'Workspace',
    items: [
      { href: '/platform', label: 'Dashboard' },
      { href: '/platform/chat', label: 'AI Chat' },
      { href: '/platform/models', label: 'Models' },
      { href: '/platform/projects', label: 'Projects' },
      { href: '/platform/keys', label: 'API Keys' },
      { href: '/platform/usage', label: 'Usage' },
      { href: '/platform/settings', label: 'Settings' },
    ],
  },
  {
    title: 'Build',
    items: [
      { href: '/platform/agents', label: 'Agents', unavailable: 'Needs a configured agent runtime' },
      { href: '/platform/coding', label: 'Coding', unavailable: 'Needs an isolated worker' },
      { href: '/platform/image', label: 'Image Studio', unavailable: 'Needs ComfyUI + a GPU' },
      { href: '/platform/video', label: 'Video Studio', unavailable: 'Needs a video model + GPU' },
      { href: '/platform/audio', label: 'Audio Studio', unavailable: 'Needs a TTS/STT model' },
      { href: '/platform/research', label: 'Research', unavailable: 'Needs a search provider' },
      { href: '/platform/automations', label: 'Automations', unavailable: 'Needs the workflow engine' },
      { href: '/platform/website', label: 'Website Builder', unavailable: 'Needs GrapesJS assets' },
      { href: '/platform/app-builder', label: 'App Builder', unavailable: 'Needs NocoBase/Directus' },
      { href: '/platform/data', label: 'Data & RAG', unavailable: 'Needs an embedding + vector store' },
    ],
  },
];

export function PlatformShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    platformApi.me().then((result) => {
      if (cancelled) return;
      if (result.ok) setMe(result.data);
      else setError(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const active = (href: string) => (href === '/platform' ? pathname === href : pathname.startsWith(href));

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 shrink-0 overflow-y-auto border-r border-slate-800 bg-slate-900/95 backdrop-blur transition-transform lg:static lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-16 items-center gap-2 border-b border-slate-800 px-4">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 text-sm font-bold text-slate-950">
            A
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">ALO Open AI</div>
            <div className="text-[11px] text-slate-400">Platform</div>
          </div>
        </div>

        <nav className="px-2 py-3">
          {NAV.map((group) => (
            <div key={group.title} className="mb-4">
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {group.title}
              </div>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = active(item.href);
                  if (item.unavailable) {
                    return (
                      <li key={item.href}>
                        <div
                          className="flex items-center justify-between rounded-md px-2 py-1.5 text-[13px] text-slate-500"
                          title={item.unavailable}
                        >
                          <span>{item.label}</span>
                          <span className="rounded bg-slate-800 px-1 text-[9px] uppercase tracking-wide text-slate-400">
                            off
                          </span>
                        </div>
                      </li>
                    );
                  }
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={`block rounded-md px-2 py-1.5 text-[13px] transition-colors ${
                          isActive
                            ? 'bg-cyan-500/15 font-medium text-cyan-300'
                            : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="mt-auto border-t border-slate-800 p-3 text-[11px] text-slate-400">
          {error ? (
            <span className="text-amber-400">Not signed in</span>
          ) : me ? (
            <>
              <div className="truncate font-medium text-slate-200">{me.workspace?.name ?? 'No workspace'}</div>
              <div className="truncate">{me.user?.email}</div>
              <div className="mt-1 flex items-center gap-1">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${me.inference.anyProviderConfigured ? 'bg-emerald-400' : 'bg-amber-400'}`}
                />
                {me.inference.anyProviderConfigured ? 'Inference ready' : 'No inference backend'}
              </div>
            </>
          ) : (
            <span>Loading…</span>
          )}
        </div>
      </aside>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-800 bg-slate-950/80 px-4 backdrop-blur">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-md border border-slate-700 px-2 py-1 text-xs lg:hidden"
            aria-label="Toggle navigation"
          >
            ☰
          </button>
          <div className="text-sm font-medium text-slate-300">
            {NAV.flatMap((g) => g.items).find((i) => active(i.href) && !i.unavailable)?.label ?? 'Platform'}
          </div>
          <div className="ml-auto flex items-center gap-2 text-[11px]">
            {me?.workspace && (
              <span className="rounded-full border border-slate-700 px-2 py-0.5 text-slate-400">
                {me.workspace.plan} plan
              </span>
            )}
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
