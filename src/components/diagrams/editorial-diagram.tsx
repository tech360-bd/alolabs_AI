'use client'

/**
 * EditorialDiagram — the page-level figure.
 *
 * Page layout contract (§7): eyebrow (mono) → title (Instrument Serif) →
 * optional subtitle → the diagram sitting directly on the paper → footer
 * colophon. A framed variant is available for card-heavy layouts, but the
 * default stays borderless so the extra chrome never fights the figure.
 */

import * as React from 'react'
import { DiagramCanvas } from './diagram-canvas'
import { MotionFigure } from './motion-figure'
import { renderDiagram } from '@/lib/diagram-design/render'
import { sceneToHtml, sceneToSvg } from '@/lib/diagram-design/export'
import { validateMotion } from '@/lib/diagram-design/motion'
import type { DiagramSpec, DiagramVariant, Theme } from '@/lib/diagram-design/spec'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, AlertTriangle, XCircle, Copy, Download, Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'

export interface EditorialDiagramProps {
  spec: DiagramSpec
  variant?: DiagramVariant
  theme?: Theme
  framed?: boolean
  showAudit?: boolean
  showExport?: boolean
  className?: string
}

export function EditorialDiagram({
  spec,
  variant,
  theme,
  framed = false,
  showAudit = false,
  showExport = false,
  className,
}: EditorialDiagramProps) {
  const resolved: DiagramSpec = React.useMemo(() => {
    // The terminal frame is a fixed dark skin: it ignores the light/dark toggle and the spec's skin.
    if (spec.frame === 'terminal') {
      return { ...spec, variant: variant ?? spec.variant, theme: 'dark', skin: 'terminal' }
    }
    return { ...spec, variant: variant ?? spec.variant, theme: theme ?? spec.theme }
  }, [spec, variant, theme])
  const scene = React.useMemo(() => renderDiagram(resolved), [resolved])
  const audit = scene.audit
  const dark = resolved.theme === 'dark'
  const sketchy = Boolean(resolved.sketchy)
  const terminal = resolved.frame === 'terminal'
  // Paper behind the masks, per skin — matches the canvas mask fill so masks are invisible.
  const paperVar =
    terminal ? '#141414' : resolved.skin === 'alo' ? (dark ? '#0F172A' : '#F8FAFC') : dark ? '#2d3142' : '#f5f5f5'

  // Motion runs only when every structural check passes; otherwise the complete static figure is shown.
  const motionActive = React.useMemo(() => {
    if (!resolved.motion || resolved.motion.mode === 'none') return false
    const known = new Set(
      scene.items.flatMap((i) => [i.id, i.group]).filter((x): x is string => Boolean(x)),
    )
    return validateMotion(resolved.motion, known).every((issue) => issue.level !== 'error')
  }, [resolved.motion, scene.items])

  const copy = async (kind: 'svg' | 'html') => {
    try {
      const payload = kind === 'svg' ? sceneToSvg(scene, { sketchy }) : sceneToHtml(scene)
      await navigator.clipboard.writeText(payload)
      toast.success(`${kind.toUpperCase()} copied to clipboard`)
    } catch {
      toast.error('Clipboard unavailable in this browser')
    }
  }

  const download = (kind: 'svg' | 'html') => {
    const payload = kind === 'svg' ? sceneToSvg(scene, { sketchy }) : sceneToHtml(scene)
    const blob = new Blob([payload], { type: kind === 'svg' ? 'image/svg+xml' : 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${resolved.slug}.${kind}`
    a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * PNG export: the static SVG rasterised at 2× on a transparent canvas
   * (omit_background), so it sits on any slide or page colour without a halo.
   * Fonts come from the browser's installed set; the SVG itself is complete.
   */
  const downloadPng = () => {
    const svg = sceneToSvg(scene, { sketchy })
    const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    const img = new Image()
    img.onload = () => {
      const scale = 2
      const canvas = document.createElement('canvas')
      canvas.width = scene.width * scale
      canvas.height = (scene.height + (scene.legend.length ? 44 : 0)) * scale
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.scale(scale, scale)
        ctx.drawImage(img, 0, 0, scene.width, scene.height + (scene.legend.length ? 44 : 0))
      }
      canvas.toBlob((png) => {
        URL.revokeObjectURL(svgUrl)
        if (!png) {
          toast.error('PNG export is unavailable in this browser')
          return
        }
        const url = URL.createObjectURL(png)
        const a = document.createElement('a')
        a.href = url
        a.download = `${resolved.slug}.png`
        a.click()
        URL.revokeObjectURL(url)
      }, 'image/png')
    }
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl)
      toast.error('PNG export failed')
    }
    img.src = svgUrl
  }

  return (
    <figure className={cn('w-full', className)} style={{ colorScheme: dark ? 'dark' : 'light' }}>
      <style>{`
        [data-diagram] { --dd-paper: ${paperVar}; }
        [data-diagram] text { -webkit-font-smoothing: antialiased; }
      `}</style>
      <figcaption className="mb-4">
        {resolved.eyebrow && (
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
            {resolved.eyebrow}
          </p>
        )}
        {terminal ? (
          <h3 className="mt-1 font-mono text-lg font-bold tracking-tight text-slate-900">
            <span className="text-slate-400"># </span>
            {resolved.title}
          </h3>
        ) : (
          <h3 className="mt-1 font-serif text-2xl font-normal tracking-tight" style={{ fontFamily: 'var(--font-editorial, "Instrument Serif", Georgia, serif)' }}>
            {resolved.title}
          </h3>
        )}
        {resolved.subtitle && <p className="mt-1 max-w-[70ch] text-sm text-slate-600">{resolved.subtitle}</p>}
      </figcaption>

      <div
        className={cn(
          framed ? 'rounded-lg border border-slate-200 bg-slate-50 p-6' : '',
          terminal ? 'overflow-hidden rounded-[12px] border border-[#2b2b2b] bg-[#141414]' : 'overflow-hidden',
        )}
      >
        {terminal ? (
          <div className="flex items-center gap-1.5 border-b border-[#2b2b2b] bg-[#1b1b1b] px-3 py-2">
            <span className="size-2.5 rounded-full bg-[#ff5a36]" aria-hidden="true" />
            <span className="size-2.5 rounded-full bg-[#5c5c5c]" aria-hidden="true" />
            <span className="size-2.5 rounded-full bg-[#5c5c5c]" aria-hidden="true" />
            <span className="ml-3 font-mono text-[11px] text-[#9a9a9a]">{resolved.slug}.svg — diagram-design</span>
          </div>
        ) : null}
        <div className={terminal ? 'p-5' : undefined}>
          {terminal ? (
            <p className="mb-3 font-mono text-xs text-[#f5f5f5]">
              <span className="text-[#ff5a36]">$</span> diagram-design render --type {resolved.kind}
            </p>
          ) : null}
          {motionActive && resolved.motion ? (
            <MotionFigure scene={scene} motion={resolved.motion} />
          ) : (
            <DiagramCanvas scene={scene} sketchy={sketchy} />
          )}
        </div>
      </div>

      {showExport && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => copy('svg')}>
            <Copy className="size-3.5" /> Copy SVG
          </Button>
          <Button size="sm" variant="outline" onClick={() => copy('html')}>
            <Copy className="size-3.5" /> Copy HTML
          </Button>
          <Button size="sm" variant="outline" onClick={() => download('svg')}>
            <Download className="size-3.5" /> Save SVG
          </Button>
          <Button size="sm" variant="outline" onClick={() => download('html')}>
            <Download className="size-3.5" /> Save HTML
          </Button>
          <Button size="sm" variant="outline" onClick={downloadPng}>
            <ImageIcon className="size-3.5" /> Save PNG
          </Button>
        </div>
      )}

      {showAudit && audit && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            {audit.ok ? (
              <CheckCircle2 className="size-4 text-emerald-600" />
            ) : (
              <XCircle className="size-4 text-red-600" />
            )}
            <span className="text-sm font-medium">
              Taste gate {audit.ok ? 'passed' : 'failed'}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
              {audit.counts.nodes} nodes · {audit.counts.links} links · {audit.counts.focal} focal
            </span>
          </div>
          <ul className="mt-3 space-y-1">
            {audit.findings.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                {f.level === 'pass' ? (
                  <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-600" />
                ) : f.level === 'warn' ? (
                  <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-500" />
                ) : (
                  <XCircle className="mt-0.5 size-3 shrink-0 text-red-600" />
                )}
                <span>
                  <span className="font-mono text-[10px] uppercase tracking-wide text-slate-400">{f.rule}</span>{' '}
                  {f.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {resolved.footer && (
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">{resolved.footer}</p>
      )}
      {!audit?.ok && showAudit && (
        <Badge variant="destructive" className="mt-2">
          Budget breach
        </Badge>
      )}
    </figure>
  )
}

export default EditorialDiagram
