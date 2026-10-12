'use client'

/** Diagram Studio panel — the studio inside the enterprise shell. */

import { DiagramStudio } from './diagram-studio'

export default function DiagramStudioPanel() {
  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Design system</p>
        <h2 className="mt-1 font-serif text-3xl font-normal tracking-tight text-slate-900">Diagram Studio</h2>
        <p className="mt-1 max-w-[76ch] text-sm text-slate-600">
          Every visual type in the editorial diagram system, rendered from a spec that passes the taste gate. Pick a
          type, flip between the minimal and full-editorial variants and the light/dark themes, then export a
          self-contained SVG or HTML file to share.
        </p>
      </div>
      <DiagramStudio />
    </div>
  )
}
