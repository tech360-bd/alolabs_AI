'use client'

import Image from 'next/image'
import { useState } from 'react'
import { Box, ChevronLeft, ChevronRight } from 'lucide-react'

const models = [
  { name: 'Studio companion', id: 'ALO–01', file: 'alo-companion', alt: '3D white ALO robot with a blue visor and an orange cape, standing on a machined display plinth.' },
  { name: 'Logic core', id: 'ALO–02', file: 'logic-core', alt: 'An exploded 3D model of a blue AI processor above glass and orange circuit layers.' },
  { name: 'Platform stack', id: 'ALO–03', file: 'platform-stack', alt: 'Three layered glass and aluminium application windows in a 3D software model.' },
  { name: 'System bridge', id: 'ALO–04', file: 'system-bridge', alt: 'Interlocking blue and orange machined links representing connected systems.' },
] as const

/** A manually controlled exhibit. The first render is full HTML and needs no
 * canvas, animation loop, remote model, or GPU; controls are keyboard buttons. */
export function StudioFigure() {
  const [index, setIndex] = useState(0)
  const model = models[index]
  const step = (direction: number) => setIndex(i => (i + direction + models.length) % models.length)
  const number = String(index + 1).padStart(2, '0')
  return (
    <figure className="studio-exhibit" aria-label="Studio model collection">
      <div
        className={`specimen-stage${index === 0 ? ' specimen-mascot' : ''}`}
        onPointerMove={event => {
          if (event.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
          const stage = event.currentTarget
          const rect = stage.getBoundingClientRect()
          stage.style.setProperty('--yaw', `${((event.clientX - rect.left) / rect.width - .5) * 6}deg`)
          stage.style.setProperty('--pitch', `${(.5 - (event.clientY - rect.top) / rect.height) * 3}deg`)
        }}
        onPointerLeave={event => {
          event.currentTarget.style.removeProperty('--yaw')
          event.currentTarget.style.removeProperty('--pitch')
        }}
      >
        <svg className="specimen-guides" viewBox="0 0 600 440" aria-hidden="true" focusable="false">
          <g fill="none" stroke="currentColor" strokeWidth="0.8">
            <circle cx="300" cy="218" r="167" strokeDasharray="2 7" />
            <circle cx="300" cy="218" r="191" strokeDasharray="165 1035" transform="rotate(-63 300 218)" />
            <path d="M32 50h12m-6-6v12m486 283h12m-6-6v12M77 309h8m-4-4v8" />
            <path d="M146 369q120 47 337-10" strokeDasharray="2 5" />
          </g>
        </svg>
        <div key={model.id} className="specimen-object">
          <Image src={`/studio/${model.file}.webp`} alt={model.alt} fill unoptimized loading={index === 0 ? 'eager' : 'lazy'} fetchPriority={index === 0 ? 'high' : 'auto'} sizes="(max-width: 760px) 100vw, 52vw" />
        </div>
        <div className="specimen-callout" aria-hidden="true"><i /><span>MODEL ID<b>{model.id}</b></span></div>
        <div className="specimen-scale" aria-hidden="true" />
      </div>
      <figcaption className="specimen-caption">
        <div className="specimen-identifier" aria-live="polite" aria-atomic="true">
          <Box size={15} strokeWidth={1.6} aria-hidden="true" /><span className="specimen-index">FIG. {number}</span><span className="specimen-slash">/</span><span>{model.name}</span>
        </div>
        <div className="specimen-buttons">
          <button type="button" aria-label="Previous studio model" onClick={() => step(-1)}><ChevronLeft size={16} /></button>
          <button type="button" aria-label="Next studio model" onClick={() => step(1)}><ChevronRight size={16} /></button>
        </div>
      </figcaption>
    </figure>
  )
}
