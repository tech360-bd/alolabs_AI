'use client'

/**
 * Icons section of the design system page — the living spec for the icon primitive.
 * Shows the full set grouped by category, plus a figure that uses icons on nodes.
 */

import * as React from 'react'
import { EditorialDiagram } from '@/components/diagrams/editorial-diagram'
import { ICON_SHOWCASE } from '@/lib/diagram-design/icon-examples'
import { DIAGRAM_ICONS } from '@/lib/diagram-design/icons.generated'
import { iconMarkup } from '@/lib/diagram-design/icons'

export function IconsSection() {
  const groups = React.useMemo(() => {
    const map = new Map<string, typeof DIAGRAM_ICONS>()
    for (const icon of DIAGRAM_ICONS) {
      const list = map.get(icon.category) ?? []
      list.push(icon)
      map.set(icon.category, list)
    }
    return [...map.entries()]
  }, [])

  return (
    <div className="space-y-10">
      <section className="max-w-[80ch]">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Icons</p>
        <h2 className="mt-2 font-serif text-3xl font-normal tracking-tight text-slate-900">
          {DIAGRAM_ICONS.length} monochrome icons for diagram nodes
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Set a node&apos;s <code className="font-mono text-xs">icon</code> to any name below. The icon sits top-right, takes the
          node&apos;s outline colour and is hidden in boxes too short to hold it. Unknown names are ignored, never guessed.
          Stroked icons come from Tabler (MIT); brand marks from Simple Icons (CC0), log-z/logos and Devicon (MIT).
        </p>
      </section>

      <section>
        <EditorialDiagram key={ICON_SHOWCASE.slug} spec={ICON_SHOWCASE} showExport />
      </section>

      {groups.map(([category, icons]) => (
        <section key={category}>
          <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
            {category} <span className="text-slate-400">· {icons.length}</span>
          </h3>
          <ul className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 sm:grid-cols-3 lg:grid-cols-4">
            {icons.map((icon) => (
              <li key={icon.name} className="flex items-start gap-3 bg-white p-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-slate-800"
                  style={{ width: 24, height: 24 }}
                  dangerouslySetInnerHTML={{ __html: iconMarkup(icon.name, 0, 0, 24) }}
                />
                <span className="min-w-0">
                  <span className="block font-mono text-xs text-slate-900">{icon.name}</span>
                  <span className="block truncate text-[11px] text-slate-500" title={icon.description}>
                    {icon.description}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
