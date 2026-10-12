'use client'

/**
 * Scene → SVG renderer.
 *
 * This is the only component that turns the engine's flat primitive list into
 * DOM. It owns the accessible-SVG contract (§12): role="img", a stable id
 * prefix per diagram, `<title>` as the first child, and `<desc>` filled in.
 * The three arrow markers are always defined, exactly as the templates do.
 */

import { iconMarkup } from '@/lib/diagram-design/icons'
import * as React from 'react'
import { FONT_STACK, RADIUS, STROKE, alpha, nodeTreatment, resolveSkin } from '@/lib/diagram-design/tokens'
import type { LegendItem, Prim, Scene } from '@/lib/diagram-design/spec'
import type { NodeKind } from '@/lib/diagram-design/tokens'
import { MOTION_CLOCK } from '@/lib/diagram-design/motion'

/**
 * Playback view handed down by the motion controller. Absent for static figures,
 * in which case the canvas output is byte-identical to the non-motion render.
 */
export interface MotionView {
  /** 1-based step that reveals an item, or null when it is always visible. */
  stepOf: (id: string | undefined) => number | null
  /** Whether an item is visible at the current step. */
  isVisible: (id: string | undefined) => boolean
  /** Current step, used to mark the active item for styling. */
  current: number
  /** Draw one decorative flow token along the focal connector (loop mode). */
  loopToken?: boolean
}

export interface DiagramCanvasProps {
  scene: Scene
  className?: string
  /** Hide the legend strip (the figure sits inside a card that already explains it). */
  hideLegend?: boolean
  /** Step-gated playback view; see `MotionView`. */
  motion?: MotionView
  /** Hand-drawn displacement applied to shapes only (primitive-sketchy.md). */
  sketchy?: boolean
}

export function DiagramCanvas({ scene, className, hideLegend, motion, sketchy }: DiagramCanvasProps): React.ReactElement {
  const uid = React.useCallback((name: string) => `${scene.aria.slug}-${name}`, [scene.aria.slug])
  const t = scene.theme
  // Masks must match the page behind them: paper for light/dark, the fixed terminal paper for the terminal skin.
  const maskFill = scene.skin === 'terminal' ? '#141414' : scene.theme === 'dark' ? '#232734' : '#f5f5f5'
  const items = React.useMemo(
    () => [...scene.items].sort((a, b) => a.layer - b.layer),
    [scene.items],
  )
  const legendItems = hideLegend ? [] : scene.legend
  const height = scene.height + (legendItems.length ? 44 : 0)

  const renderItem = (item: (typeof items)[number], i: number) => {
    const node = <Primitive key={item.id ?? `${item.layer}-${i}`} prim={item.prim} uid={uid} maskFill={maskFill} />
    if (!motion) return node
    const key = item.group ?? item.id
    const step = motion.stepOf(key)
    if (step === null) return node
    const visible = motion.isVisible(key)
    return (
      <g
        key={item.id ?? `${item.layer}-${i}`}
        data-motion-item=""
        data-step={step}
        data-current={step === motion.current ? 'true' : undefined}
        data-visible={visible ? 'true' : 'false'}
        aria-hidden={visible ? undefined : true}
        style={{ opacity: visible ? 1 : 0, transition: 'opacity var(--motion-step, 480ms) cubic-bezier(.2,.8,.2,1)' }}
      >
        <Primitive prim={item.prim} uid={uid} maskFill={maskFill} />
      </g>
    )
  }

  // Sketchy: displacement on shapes only. Text sits in its own unfiltered group so labels stay crisp.
  const shapeItems = sketchy ? items.filter((it) => it.prim.t !== 'text') : []
  const textItems = sketchy ? items.filter((it) => it.prim.t === 'text') : []

  // Loop mode: one decorative token on the focal connector, hidden from assistive tech.
  const loopPath = motion?.loopToken ? focalPath(items) : undefined

  return (
    <div
      className={className}
      data-diagram={scene.aria.slug}
      style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
    >
      <svg
        role="img"
        aria-labelledby={`${uid('title')} ${uid('desc')}`}
        viewBox={`0 0 ${scene.width} ${height}`}
        width="100%"
        style={{ minWidth: scene.width, display: 'block' }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <title id={uid('title')}>{scene.aria.title}</title>
        <desc id={uid('desc')}>{scene.aria.desc}</desc>
        <defs>
          <ArrowMarker id={uid('arrow')} fill={t === 'dark' ? '#bfc0c0' : '#4f5d75'} />
          <ArrowMarker id={uid('arrow-accent')} fill={t === 'dark' ? '#f08a59' : '#eb6c36'} />
          <ArrowMarker id={uid('arrow-link')} fill={t === 'dark' ? '#6a95d8' : '#2e5aa8'} />
          {scene.background === 'dots' ? (
            <pattern id={uid('dots')} width="22" height="22" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.9" fill={alpha(t === 'dark' ? '#f5f5f5' : '#2d3142', 0.1)} />
            </pattern>
          ) : null}
        </defs>

        {scene.skin === 'alo' ? (
          <rect
            width={scene.width}
            height={height}
            fill={t === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(248,250,252,0.6)'}
          />
        ) : null}
        {scene.background === 'dots' ? (
          <rect width={scene.width} height={height} fill={`url(#${uid('dots')})`} />
        ) : null}

        {sketchy ? (
          <>
            <defs>
              <filter id={uid('sketchy')} x="-2%" y="-2%" width="104%" height="104%">
                <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="4" />
                <feDisplacementMap in="SourceGraphic" scale="1.5" />
              </filter>
            </defs>
            <g filter={`url(#${uid('sketchy')})`}>{shapeItems.map(renderItem)}</g>
            {textItems.map(renderItem)}
          </>
        ) : (
          items.map(renderItem)
        )}

        {loopPath ? (
          <circle className="dd-flow-token" aria-hidden="true" focusable="false" r="5" fill={t === 'dark' ? '#f08a59' : '#eb6c36'}>
            <animateMotion dur={`${MOTION_CLOCK.loopCycle}ms`} repeatCount="indefinite" path={loopPath} />
          </circle>
        ) : null}

        {legendItems.length ? <LegendStrip scene={scene} items={legendItems} y={scene.height + 8} uid={uid} /> : null}
      </svg>
    </div>
  )
}

/** The focal connector: the first accent-marked path, else the first path. */
function focalPath(items: Scene['items']): string | undefined {
  const paths = items.filter((it) => it.prim.t === 'path')
  const accent = paths.find((it) => it.prim.t === 'path' && it.prim.marker === 'accent')
  const pick = accent ?? paths[0]
  return pick && pick.prim.t === 'path' ? pick.prim.d : undefined
}

function ArrowMarker({ id, fill }: { id: string; fill: string }) {
  return (
    <marker id={id} markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill={fill} />
    </marker>
  )
}

function Primitive({ prim, uid, maskFill }: { prim: Prim; uid: (n: string) => string; maskFill: string }) {
  switch (prim.t) {
    case 'rect':
      return (
        <rect
          x={prim.x}
          y={prim.y}
          width={prim.w}
          height={prim.h}
          rx={prim.rx ?? 0}
          fill={prim.fill ?? 'none'}
          stroke={prim.stroke}
          strokeWidth={prim.strokeWidth}
          strokeDasharray={prim.dash}
          opacity={prim.opacity}
        />
      )
    case 'icon':
      // Trusted markup from icons.generated.ts only; the name is looked up in the allowlist.
      return (
        <g
          style={{ color: prim.color }}
          dangerouslySetInnerHTML={{ __html: iconMarkup(prim.name, prim.x, prim.y, prim.size) }}
        />
      )
    case 'mask':
      // Opaque paper backing — the same value as the page background.
      return (
        <rect
          x={prim.x}
          y={prim.y}
          width={prim.w}
          height={prim.h}
          rx={prim.rx ?? 0}
          fill={maskFill}
        />
      )
    case 'path':
      return (
        <path
          d={prim.d}
          fill={prim.fill ?? 'none'}
          stroke={prim.stroke}
          strokeWidth={prim.strokeWidth}
          strokeDasharray={prim.dash}
          opacity={prim.opacity}
          markerEnd={
            prim.marker === 'accent'
              ? `url(#${uid('arrow-accent')})`
              : prim.marker === 'link'
                ? `url(#${uid('arrow-link')})`
                : prim.marker
                  ? `url(#${uid('arrow')})`
                  : undefined
          }
        />
      )
    case 'line':
      return (
        <line
          x1={prim.x1}
          y1={prim.y1}
          x2={prim.x2}
          y2={prim.y2}
          stroke={prim.stroke}
          strokeWidth={prim.strokeWidth}
          strokeDasharray={prim.dash}
          opacity={prim.opacity}
          markerEnd={
            prim.marker === 'accent'
              ? `url(#${uid('arrow-accent')})`
              : prim.marker === 'link'
                ? `url(#${uid('arrow-link')})`
                : prim.marker
                  ? `url(#${uid('arrow')})`
                  : undefined
          }
        />
      )
    case 'circle':
      return (
        <circle
          cx={prim.cx}
          cy={prim.cy}
          r={prim.r}
          fill={prim.fill ?? 'none'}
          stroke={prim.stroke}
          strokeWidth={prim.strokeWidth}
          opacity={prim.opacity}
        />
      )
    case 'polygon':
      return (
        <polygon
          points={prim.points}
          fill={prim.fill ?? 'none'}
          stroke={prim.stroke}
          strokeWidth={prim.strokeWidth}
          strokeDasharray={prim.dash}
          opacity={prim.opacity}
        />
      )
    case 'text': {
      const family =
        prim.family === 'sans'
          ? FONT_STACK.sans
          : prim.family === 'serif'
            ? FONT_STACK.serif
            : FONT_STACK.mono
      return (
        <text
          x={prim.x}
          y={prim.y}
          fill={prim.fill}
          fontFamily={family}
          fontSize={prim.size}
          fontWeight={prim.weight ?? 400}
          textAnchor={prim.anchor ?? 'start'}
          letterSpacing={prim.tracking ? `${prim.tracking}em` : undefined}
          fontStyle={prim.italic ? 'italic' : undefined}
          opacity={prim.opacity}
          dominantBaseline={prim.baseline === 'middle' ? 'central' : undefined}
        >
          {prim.text}
        </text>
      )
    }
    default:
      return null
  }
}

function LegendStrip({
  scene,
  items,
  y,
  uid,
}: {
  scene: Scene
  items: LegendItem[]
  y: number
  uid: (n: string) => string
}) {
  const tokens = resolveSkin(scene.skin, scene.theme)
  return (
    <g data-legend={uid('legend')}>
      <line x1={40} y1={y} x2={scene.width - 40} y2={y} stroke={tokens.rule} strokeWidth={0.8} />
      <text
        x={40}
        y={y + 22}
        fill={tokens.muted}
        fontFamily={FONT_STACK.mono}
        fontSize={8}
        letterSpacing="0.14em"
      >
        LEGEND
      </text>
      {items.map((item, i) => {
        const x = 132 + i * 160
        const isArrow = item.kind.startsWith('arrow') || item.kind === 'dash'
        return (
          <g key={`${item.kind}-${item.label}-${i}`}>
            {isArrow ? (
              <line
                x1={x}
                y1={y + 19}
                x2={x + 18}
                y2={y + 19}
                stroke={
                  item.kind === 'arrow-accent' ? tokens.accent : item.kind === 'arrow-link' ? tokens.link : tokens.muted
                }
                strokeWidth={STROKE.default}
                strokeDasharray={item.kind === 'dash' ? '5,4' : undefined}
              />
            ) : (
              (() => {
                const treat = nodeTreatment(item.kind as NodeKind, tokens)
                return (
                  <rect
                    x={x}
                    y={y + 14}
                    width={16}
                    height={10}
                    rx={RADIUS.sm - 2}
                    fill={treat.fill}
                    stroke={treat.stroke}
                    strokeWidth={treat.strokeWidth}
                    strokeDasharray={treat.dash}
                  />
                )
              })()
            )}
            <text
              x={x + 24}
              y={y + 23}
              fill={tokens.muted}
              fontFamily={FONT_STACK.mono}
              fontSize={8}
            >
              {item.label}
            </text>
          </g>
        )
      })}
    </g>
  )
}
