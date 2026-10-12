'use client'

/**
 * DiagramStudio — browse every visual type, flip its variant and skin, and read
 * the taste gate for the exact diagram on screen.
 *
 * Variants mirror the design system: minimal light (default, screenshot-ready),
 * minimal dark, and full editorial (cards + callouts). The ALO skin swaps the
 * semantic roles onto the product palette without touching type logic.
 */

import * as React from 'react'
import { EXAMPLES } from '@/lib/diagram-design/examples'
import { KINDS } from '@/lib/diagram-design/tokens'
import type { DiagramKind, DiagramSpec, DiagramVariant, Theme } from '@/lib/diagram-design/spec'
import { EditorialDiagram } from './editorial-diagram'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Search, LayoutGrid, PanelLeft } from 'lucide-react'

type SkinName = 'editorial' | 'alo'

export function DiagramStudio({ initialKind = 'architecture' }: { initialKind?: DiagramKind }) {
  const [kind, setKind] = React.useState<DiagramKind>(initialKind)
  const [variant, setVariant] = React.useState<DiagramVariant>('minimal')
  const [theme, setTheme] = React.useState<Theme>('light')
  const [skin, setSkin] = React.useState<SkinName>('editorial')
  const [query, setQuery] = React.useState('')
  const [listOpen, setListOpen] = React.useState(false)

  const spec: DiagramSpec | undefined = EXAMPLES.find((e) => e.kind === kind)
  const meta = KINDS.find((k) => k.kind === kind)

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return EXAMPLES
    return EXAMPLES.filter(
      (e) => e.kind.includes(q) || e.title.toLowerCase().includes(q) || (e.eyebrow ?? '').toLowerCase().includes(q),
    )
  }, [query])

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      {/* Type picker */}
      <aside className={cn('lg:block', listOpen ? 'block' : 'hidden')}>
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search 44 types…"
              className="h-9 pl-8 text-sm"
            />
          </div>
        </div>
        <div className="max-h-[560px] space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
          {filtered.map((e) => {
            const active = e.kind === kind
            return (
              <button
                key={e.kind}
                onClick={() => {
                  setKind(e.kind)
                  setListOpen(false)
                }}
                className={cn(
                  'w-full rounded-md px-3 py-2 text-left transition-colors',
                  active ? 'bg-slate-900 text-white' : 'hover:bg-slate-100',
                )}
              >
                <span className="block text-sm font-medium">{KINDS.find((k) => k.kind === e.kind)?.label ?? e.kind}</span>
                <span className={cn('block text-[11px]', active ? 'text-slate-300' : 'text-slate-500')}>
                  {e.title}
                </span>
              </button>
            )
          })}
          {!filtered.length && <p className="px-3 py-6 text-center text-sm text-slate-500">No type matches “{query}”.</p>}
        </div>
      </aside>

      {/* Figure */}
      <section className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button variant="editorialOutline" size="sm" className="lg:hidden" onClick={() => setListOpen((v) => !v)}>
            <PanelLeft className="size-3.5" /> Types
          </Button>
          <div className="flex items-center gap-1 rounded-[6px] border border-slate-200 bg-white p-1">
            {(['minimal', 'editorial'] as DiagramVariant[]).map((v) => (
              <button
                key={v}
                onClick={() => setVariant(v)}
                className={cn(
                  'rounded-[4px] px-3 py-1 text-xs font-medium capitalize transition-colors',
                  variant === v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {v === 'editorial' ? 'Full editorial' : 'Minimal'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-[6px] border border-slate-200 bg-white p-1">
            {(['light', 'dark'] as Theme[]).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={cn(
                  'rounded-[4px] px-3 py-1 text-xs font-medium capitalize transition-colors',
                  theme === t ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-[6px] border border-slate-200 bg-white p-1">
            {(['editorial', 'alo'] as SkinName[]).map((s) => (
              <button
                key={s}
                onClick={() => setSkin(s)}
                className={cn(
                  'rounded-[4px] px-3 py-1 text-xs font-medium uppercase tracking-wide transition-colors',
                  skin === s ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {s === 'alo' ? 'ALO skin' : 'Editorial skin'}
              </button>
            ))}
          </div>
        </div>

        {meta && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-wider">
              {meta.engine} engine
            </Badge>
            <span className="text-xs text-slate-500">{meta.purpose}</span>
            {meta.budget.note && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                budget: {meta.budget.note}
              </span>
            )}
          </div>
        )}

        <div
          className={cn(
            'rounded-lg border p-6',
            theme === 'dark' ? 'border-slate-800 bg-[#2d3142]' : 'border-slate-200 bg-[#f5f5f5]',
          )}
          data-skin={skin}
        >
          {spec ? (
            <EditorialDiagram
              spec={{ ...spec, skin, footer: `${spec.kind} · ${skin} skin · ${variant} ${theme}` }}
              variant={variant}
              theme={theme}
              showAudit
              showExport
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-20 text-slate-500">
              <LayoutGrid className="size-6" />
              <p className="text-sm">No example spec for this type yet.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export default DiagramStudio
