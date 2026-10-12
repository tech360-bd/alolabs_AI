'use client'

/**
 * MotionFigure — step / reveal / loop playback for a diagram.
 *
 * Behaviour follows the upstream animation contract (animation.md) and its
 * canonical controller (template-motion.html), re-expressed as React state:
 *   - Before hydration the complete diagram is shown and no controls render
 *     (failure-safe startup: a script error leaves the full figure visible).
 *   - `?motion=static` / `none` / reduced motion → complete frame, controls hidden,
 *     status says playback is unavailable.
 *   - `?motion=step&step=N` → exact zero-duration frame for visual regression.
 *   - `reveal` → one autoplay run that ends complete; never auto-replays.
 *   - `step` → starts at Ready (step 0) and waits for the user.
 *   - Pause on page hide; no catch-up when the page returns.
 *   - One timer chain per figure, cleared on pause, replay, unmount and at the end.
 *
 * The live region is outside the controls, so hiding controls for reduced or
 * static frames never hides announcements.
 */

import * as React from 'react'
import { DiagramCanvas, type MotionView } from './diagram-canvas'
import type { Scene } from '@/lib/diagram-design/spec'
import {
  MOTION_CLOCK,
  announceFor,
  clampStep,
  isVisibleAt,
  keyToIntent,
  parseMotionQuery,
  stepCount,
  stepOfId,
  type MotionMode,
  type MotionSpec,
  type MotionStep,
} from '@/lib/diagram-design/motion'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react'

export type PlaybackState = 'live' | 'static' | 'reduced' | 'test'

interface Resolved {
  state: PlaybackState
  step: number
  playing: boolean
  controls: boolean
  status: string
}

const STATIC_STATUS = 'Static frame · complete diagram · playback controls unavailable'
const REDUCED_STATUS = 'Reduced motion · complete static frame · playback controls unavailable'

function resolve(
  mode: MotionMode,
  count: number,
  reduceMatches: boolean,
  query: { forceStatic: boolean; exactStep: number | null },
): Resolved {
  if (query.forceStatic) return { state: 'static', step: count, playing: false, controls: false, status: STATIC_STATUS }
  if (reduceMatches) return { state: 'reduced', step: count, playing: false, controls: false, status: REDUCED_STATUS }
  if (mode === 'none' || mode === 'loop' || count === 0) {
    return { state: 'static', step: count, playing: false, controls: false, status: STATIC_STATUS }
  }
  if (query.exactStep !== null) {
    const s = clampStep(query.exactStep, count)
    return {
      state: 'test',
      step: s,
      playing: false,
      controls: false,
      status: `Test frame · step ${s} of ${count} · playback controls unavailable`,
    }
  }
  if (mode === 'reveal') {
    return { state: 'live', step: 0, playing: true, controls: true, status: `Playing · step 0 of ${count}` }
  }
  return { state: 'live', step: 0, playing: false, controls: true, status: `Ready · step 0 of ${count}` }
}

export function MotionFigure({ scene, motion }: { scene: Scene; motion: MotionSpec }) {
  const steps: MotionStep[] = React.useMemo(() => motion.steps ?? [], [motion.steps])
  const count = stepCount(motion)
  const mode = motion.mode

  // Complete until the controller has resolved the initial state.
  const [ready, setReady] = React.useState(false)
  const [resolved, setResolved] = React.useState<Resolved>({
    state: 'static',
    step: count,
    playing: false,
    controls: false,
    status: STATIC_STATUS,
  })
  const [step, setStep] = React.useState(count)
  const [playing, setPlaying] = React.useState(false)
  const [status, setStatus] = React.useState(resolved.status)

  // Initial resolution and reduced-motion / visibility subscriptions.
  React.useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    const query = parseMotionQuery(window.location.search, count)
    const apply = (reduceMatches: boolean) => {
      const next = resolve(mode, count, reduceMatches, query)
      setResolved(next)
      setStep(next.step)
      setPlaying(next.playing)
      setStatus(next.status)
    }
    apply(reduce.matches)
    setReady(true)

    const onReduce = (event: MediaQueryListEvent) => apply(event.matches)
    reduce.addEventListener('change', onReduce)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') setPlaying(false)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      reduce.removeEventListener('change', onReduce)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [mode, count])

  // One timer chain: each hold advances one step; the last step stops playback.
  React.useEffect(() => {
    if (!playing) return
    if (step >= count) {
      setPlaying(false)
      setStatus(`Complete · step ${count} of ${count}`)
      return
    }
    const timer = window.setTimeout(() => setStep((s) => Math.min(count, s + 1)), MOTION_CLOCK.hold)
    return () => window.clearTimeout(timer)
  }, [playing, step, count])

  const showControls = ready && resolved.controls
  // Static and reduced frames show everything; live and test frames gate items by step.
  const gated = ready && (resolved.state === 'live' || resolved.state === 'test')
  const frame =
    !ready || resolved.state === 'static' || resolved.state === 'reduced'
      ? 'static'
      : step === count
        ? 'end'
        : step === 0
          ? 'start'
          : 'step'

  const view: MotionView = React.useMemo(
    () => ({
      stepOf: (id) => stepOfId(steps, id),
      isVisible: (id) => (gated ? isVisibleAt(steps, id, step) : true),
      current: step,
      loopToken: mode === 'loop' && ready,
    }),
    [steps, step, gated, mode, ready],
  )

  // ── Actions (user-initiated: announce) ─────────────────────────────────────
  const goTo = (next: number) => {
    const s = clampStep(next, count)
    setStep(s)
    setStatus(announceFor(steps, s, count))
  }
  const play = (fromStart: boolean) => {
    if (fromStart || step >= count) {
      setStep(0)
      setStatus(announceFor(steps, 0, count))
    } else {
      setStatus(`Playing · step ${step} of ${count}`)
    }
    setPlaying(true)
  }
  const pause = () => {
    setPlaying(false)
    setStatus(`Paused at step ${step} of ${count}`)
  }
  const toggle = () => (playing ? pause() : play(false))

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!showControls) return
    const target = event.target as HTMLElement
    if (target.matches('input, textarea, select, a[href]')) return
    const intent = keyToIntent(
      event.key,
      event.code,
      { ctrl: event.ctrlKey, meta: event.metaKey, alt: event.altKey },
      Boolean(target.closest('button')),
    )
    if (!intent) return
    event.preventDefault()
    if (intent.kind === 'toggle') return toggle()
    if (intent.kind === 'replay') return play(true)
    setPlaying(false)
    if (intent.to === 'prev') return goTo(step - 1)
    if (intent.to === 'next') return goTo(step + 1)
    if (intent.to === 'start') return goTo(0)
    return goTo(count)
  }

  const atStart = step === 0
  const atEnd = step === count

  return (
    <div
      data-motion-root=""
      data-motion-mode={mode}
      data-step-count={count}
      data-step-current={step}
      data-frame={frame}
      data-motion-state={resolved.state}
      className={cn('dd-motion-root', ready && 'motion-ready')}
      onKeyDown={onKeyDown}
    >
      <style>{MOTION_CSS}</style>
      <DiagramCanvas scene={scene} motion={view} />

      {showControls ? (
        <div
          data-motion-controls=""
          role="group"
          aria-label="Diagram playback controls"
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <Button
            type="button"
            variant="editorialOutline"
            size="editorialLg"
            data-motion-action="prev"
            aria-label="Previous step"
            disabled={atStart}
            onClick={() => {
              setPlaying(false)
              goTo(step - 1)
            }}
          >
            <SkipBack className="size-4" aria-hidden="true" /> Previous
          </Button>
          <Button
            type="button"
            variant={playing ? 'editorialOutline' : 'editorialAccent'}
            size="editorialLg"
            data-motion-action="play"
            aria-pressed={playing}
            onClick={() => play(false)}
          >
            <Play className="size-4" aria-hidden="true" /> Play
          </Button>
          <Button
            type="button"
            variant="editorialOutline"
            size="editorialLg"
            data-motion-action="pause"
            aria-pressed={!playing}
            onClick={pause}
          >
            <Pause className="size-4" aria-hidden="true" /> Pause
          </Button>
          <Button
            type="button"
            variant="editorialOutline"
            size="editorialLg"
            data-motion-action="next"
            aria-label="Next step"
            disabled={atEnd}
            onClick={() => {
              setPlaying(false)
              goTo(step + 1)
            }}
          >
            Next <SkipForward className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="editorialGhost"
            size="editorialLg"
            data-motion-action="replay"
            onClick={() => play(true)}
          >
            <RotateCcw className="size-4" aria-hidden="true" /> Replay
          </Button>
          <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500" aria-hidden="true">
            ←/→ step · Space play/pause · R replay · Home/End jump · Step{' '}
            <span data-motion-step-label>{step}</span> of {count}
          </span>
        </div>
      ) : null}

      {/* Scoped live region: outside the controls so hiding them never hides announcements. */}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-motion-status="">
        {status}
      </p>
    </div>
  )
}

/**
 * Motion CSS — opacity-only reveals (no layout movement), decorative tokens and
 * controls removed for reduced motion and print. Timing comes from the one clock.
 */
const MOTION_CSS = `
.dd-motion-root { --motion-fast: ${MOTION_CLOCK.fast}ms; --motion-step: ${MOTION_CLOCK.step}ms; --motion-hold: ${MOTION_CLOCK.hold}ms; }
.dd-motion-root [data-motion-item] { transition: opacity var(--motion-step) cubic-bezier(.2,.8,.2,1); }
@media (prefers-reduced-motion: reduce) {
  .dd-motion-root *, .dd-motion-root *::before, .dd-motion-root *::after { transition-duration: 0.001ms !important; animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; }
  .dd-motion-root [data-motion-item] { opacity: 1 !important; }
  .dd-motion-root .dd-flow-token, .dd-motion-root [data-motion-controls] { display: none !important; }
}
@media print {
  .dd-motion-root [data-motion-controls], .dd-motion-root .dd-flow-token { display: none !important; }
  .dd-motion-root [data-motion-item] { opacity: 1 !important; }
}
`
