'use client'

/**
 * Motion section of the design system page — the living spec for playback.
 * Renders the same flowchart in each mode, plus the control and keyboard contract.
 */

import * as React from 'react'
import { EditorialDiagram } from '@/components/diagrams/editorial-diagram'
import { MOTION_EXAMPLES } from '@/lib/diagram-design/motion-examples'
import { MOTION_CLOCK } from '@/lib/diagram-design/motion'
import { Button } from '@/components/ui/button'

const MODES: { mode: string; behaviour: string; controls: string }[] = [
  { mode: 'none', behaviour: 'Complete stable figure, no JavaScript. Default for print, PNG and SVG export.', controls: 'None' },
  { mode: 'reveal', behaviour: 'One deterministic autoplay run that ends complete. Never auto-replays.', controls: 'Replay, Pause' },
  { mode: 'step', behaviour: 'Paused semantic states. Each step reveals its marked items.', controls: 'Play, Pause, Replay, Previous, Next' },
  { mode: 'loop', behaviour: 'One decorative flow token repeats along the focal connector (3.6s cycle).', controls: 'None (decorative)' },
]

export function MotionSection() {
  const [active, setActive] = React.useState<'step' | 'reveal' | 'loop'>('step')
  const figure = MOTION_EXAMPLES.find((m) => m.id === active) ?? MOTION_EXAMPLES[0]

  return (
    <div className="space-y-10">
      <section className="max-w-[80ch]">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Optional motion</p>
        <h2 className="mt-2 font-serif text-3xl font-normal tracking-tight text-slate-900">
          Playback explains order; it never supplies meaning
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Every figure is complete before any playback starts. Motion only reveals items the static figure already
          shows, on one clock ({MOTION_CLOCK.hold}ms holds, at most {MOTION_CLOCK.maxSteps} steps, 8 seconds of autoplay).
          Print, PNG export, reduced-motion and <code className="font-mono text-xs">?motion=static</code> all show the complete
          frame with controls hidden.
        </p>
      </section>

      <section>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Motion mode">
          {MOTION_EXAMPLES.map((m) => (
            <Button
              key={m.id}
              role="tab"
              aria-selected={active === m.id}
              variant={active === m.id ? 'editorialAccent' : 'editorialOutline'}
              size="editorial"
              onClick={() => setActive(m.id)}
            >
              {m.label}
            </Button>
          ))}
        </div>
        <p className="mt-3 text-sm text-slate-600">{figure.note}</p>
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
          <EditorialDiagram key={figure.spec.slug} spec={figure.spec} showExport />
        </div>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">
          Keyboard, when focus is in the figure: ← / → step · Space play or pause · R replay · Home / End jump
        </p>
      </section>

      <section>
        <h3 className="font-serif text-xl text-slate-900">Modes</h3>
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 font-mono text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Mode</th>
                <th className="px-4 py-2 font-medium">Behaviour</th>
                <th className="px-4 py-2 font-medium">Controls</th>
              </tr>
            </thead>
            <tbody>
              {MODES.map((row) => (
                <tr key={row.mode} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 font-mono text-xs">{row.mode}</td>
                  <td className="px-4 py-2 text-slate-600">{row.behaviour}</td>
                  <td className="px-4 py-2 text-slate-600">{row.controls}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
