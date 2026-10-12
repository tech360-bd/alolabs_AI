'use client'

/**
 * Diagram import panel — paste Mermaid, draw.io XML or Excalidraw JSON, get the
 * same figure redrawn in this design system, plus the fidelity ledger.
 *
 * Parsing runs in the browser as text only. Nothing is executed or fetched.
 */

import * as React from 'react'
import { EditorialDiagram } from './editorial-diagram'
import { importDiagram, ImportError, type ImportFormat, type ImportResult } from '@/lib/diagram-design/importers'
import { IMPORT_SAMPLES } from '@/lib/diagram-design/import-samples'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'

const FORMATS: { id: ImportFormat; label: string }[] = [
  { id: 'mermaid', label: 'Mermaid' },
  { id: 'drawio', label: 'draw.io XML' },
  { id: 'excalidraw', label: 'Excalidraw JSON' },
]

export function DiagramImport() {
  const [format, setFormat] = React.useState<ImportFormat>('mermaid')
  const [source, setSource] = React.useState(IMPORT_SAMPLES.mermaid.source)
  const [slug, setSlug] = React.useState('imported-diagram')
  const [title, setTitle] = React.useState('')
  const [result, setResult] = React.useState<ImportResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const run = React.useCallback(() => {
    try {
      const next = importDiagram(format, source, { slug, title: title || undefined })
      setResult(next)
      setError(null)
    } catch (e) {
      setResult(null)
      setError(e instanceof ImportError ? e.message : 'Import failed: the source could not be read.')
    }
  }, [format, source, slug, title])

  const pickFormat = (next: ImportFormat) => {
    setFormat(next)
    setSource(IMPORT_SAMPLES[next].source)
    setResult(null)
    setError(null)
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <section className="space-y-4">
        <div>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Import</p>
          <h2 className="mt-2 font-serif text-3xl font-normal tracking-tight text-slate-900">Redraw an existing diagram</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            The source supplies content and direction, never coordinates. Styling is discarded and the figure is laid out
            by this design system. Every import reports what was kept, simplified or dropped.
          </p>
        </div>

        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Source format">
          {FORMATS.map((f) => (
            <Button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={format === f.id}
              variant={format === f.id ? 'editorialAccent' : 'editorialOutline'}
              size="editorial"
              onClick={() => pickFormat(f.id)}
            >
              {f.label}
            </Button>
          ))}
        </div>

        <label className="block space-y-1">
          <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Source</span>
          <Textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            rows={14}
            spellCheck={false}
            className="font-mono text-xs"
            aria-label="Diagram source"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Slug</span>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} aria-label="Diagram slug" />
          </label>
          <label className="block space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Title (optional)</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Diagram title" />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="editorialAccent" size="editorialLg" onClick={run}>
            Redraw
          </Button>
          <Button type="button" variant="editorialGhost" size="editorialLg" onClick={() => pickFormat(format)}>
            Reset sample
          </Button>
        </div>
      </section>

      <section className="space-y-6">
        {error ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {result ? (
          <>
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <EditorialDiagram spec={result.spec} showAudit showExport />
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="font-serif text-xl text-slate-900">Fidelity ledger</h3>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                grammar {result.grammar} · source {result.source.nodes} nodes / {result.source.edges} edges · drawn{' '}
                {result.drawn.nodes} / {result.drawn.edges}
              </p>
              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                {result.ledger.map((entry, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-20 shrink-0 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                      {entry.action}
                    </span>
                    <span>{entry.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">
            The redrawn figure and its fidelity ledger appear here.
          </div>
        )}
      </section>
    </div>
  )
}
