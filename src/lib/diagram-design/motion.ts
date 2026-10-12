/**
 * Optional motion for diagrams — the pure model.
 *
 * Implements the contract in the upstream `animation.md` reference:
 *   - `none`    complete static figure, no playback (default; print, export, PNG, SVG)
 *   - `reveal`  one deterministic autoplay run that ends complete, never auto-replays
 *   - `step`    paused semantic states driven by Play / Pause / Replay / Previous / Next
 *   - `loop`    one decorative flow token repeats along the focal connector (≥3s cycle)
 *
 * Motion never supplies meaning. Items without a step are always visible, so the
 * static frame (step === count) is the complete diagram. Nothing here touches the DOM,
 * which keeps the model unit-testable and lets the React controller stay thin.
 */

export type MotionMode = 'none' | 'reveal' | 'step' | 'loop'

export interface MotionStep {
  /** Announced in the live region, e.g. "Policy evaluated". */
  label: string
  /** Scene item ids (node / link / zone ids) revealed when this step is reached. */
  ids: string[]
}

export interface MotionSpec {
  mode: MotionMode
  /** Ordered semantic steps. Step 1 is the first; there is no step 0 item. */
  steps?: MotionStep[]
}

/** One clock for the whole system (animation.md §"One clock"). */
export const MOTION_CLOCK = {
  fast: 160,
  step: 480,
  hold: 720,
  /** Hard autoplay budget in ms: steps × hold must stay within it. */
  totalBudget: 8000,
  maxSteps: 8,
  maxMarkedItems: 12,
  /** Loop cycle — never faster than 3s. */
  loopCycle: 3600,
} as const

export function stepCount(motion: MotionSpec | undefined): number {
  return motion?.steps?.length ?? 0
}

/** Total autoplay duration in ms: each step is followed by one hold. */
export function totalDurationMs(count: number): number {
  return count * MOTION_CLOCK.hold
}

/** 1-based step that reveals `id`, or `null` when the item is always visible. */
export function stepOfId(steps: MotionStep[] | undefined, id: string | undefined): number | null {
  if (!steps || !id) return null
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].ids.includes(id)) return i + 1
  }
  return null
}

/** Visible at `step`? Unmarked items are always visible; marked items appear at their step. */
export function isVisibleAt(steps: MotionStep[] | undefined, id: string | undefined, step: number): boolean {
  const s = stepOfId(steps, id)
  return s === null || s <= step
}

export function clampStep(next: number, count: number): number {
  if (!Number.isFinite(next)) return 0
  return Math.max(0, Math.min(count, Math.trunc(next)))
}

/** Live-region label for a step: "Ready" at 0, the step label otherwise, "Complete" past the end. */
export function stepLabel(steps: MotionStep[] | undefined, step: number): string {
  if (step <= 0) return 'Ready'
  return steps?.[step - 1]?.label || 'Complete'
}

/** Announcement for a user action, e.g. "Step 3 of 5: Policy evaluated". */
export function announceFor(steps: MotionStep[] | undefined, step: number, count: number): string {
  return `Step ${step} of ${count}: ${stepLabel(steps, step)}`
}

export interface MotionQuery {
  /** `?motion=static` or `<html data-motion="static">` — full frame, no controls. */
  forceStatic: boolean
  /** `?motion=step&step=N` with an integer 0..count — exact zero-duration frame for regression tests. */
  exactStep: number | null
}

/**
 * Parse the capture overrides. Missing, fractional, negative, non-numeric and
 * over-budget `step` values leave normal playback in place (animation.md).
 */
export function parseMotionQuery(search: string, count: number): MotionQuery {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const motion = params.get('motion')
  const raw = params.get('step')
  const parsed = raw !== null && /^\d+$/.test(raw) ? Number(raw) : null
  const exactStep =
    motion === 'step' && parsed !== null && Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= count
      ? parsed
      : null
  return { forceStatic: motion === 'static', exactStep }
}

export interface MotionIssue {
  level: 'error' | 'warn'
  message: string
}

/**
 * Structural checks for a motion declaration, against the scene's item ids.
 * Errors make the figure fall back to its static frame.
 */
export function validateMotion(motion: MotionSpec | undefined, knownIds: Set<string>): MotionIssue[] {
  if (!motion || motion.mode === 'none') return []
  const issues: MotionIssue[] = []
  const steps = motion.steps ?? []
  if (motion.mode === 'step' || motion.mode === 'reveal') {
    if (steps.length === 0) issues.push({ level: 'error', message: `${motion.mode} mode needs at least one step` })
  }
  if (steps.length > MOTION_CLOCK.maxSteps) {
    issues.push({ level: 'error', message: `${steps.length} steps exceed the ${MOTION_CLOCK.maxSteps}-step limit` })
  }
  if (totalDurationMs(steps.length) > MOTION_CLOCK.totalBudget) {
    issues.push({ level: 'error', message: 'autoplay exceeds the 8000ms budget' })
  }
  const seen = new Map<string, number>()
  let marked = 0
  steps.forEach((step, i) => {
    if (!step.label || !step.label.trim()) issues.push({ level: 'error', message: `step ${i + 1} has no label` })
    for (const id of step.ids) {
      if (!knownIds.has(id)) issues.push({ level: 'error', message: `step ${i + 1} references unknown item "${id}"` })
      if (seen.has(id)) {
        issues.push({ level: 'error', message: `item "${id}" is marked in step ${seen.get(id)} and step ${i + 1}` })
      } else {
        seen.set(id, i + 1)
        marked++
      }
    }
  })
  if (marked > MOTION_CLOCK.maxMarkedItems) {
    issues.push({ level: 'warn', message: `${marked} marked items exceed the ${MOTION_CLOCK.maxMarkedItems}-item budget` })
  }
  return issues
}

/** Keys the controller responds to, as documented in animation.md. */
export type MotionKey =
  | { kind: 'step'; to: 'prev' | 'next' | 'start' | 'end' }
  | { kind: 'toggle' }
  | { kind: 'replay' }

/**
 * Map a keyboard event to a motion intent. Returns null for keys the controller
 * must leave alone. `R` is ignored when Control, Command or Alt is held.
 */
export function keyToIntent(
  key: string,
  code: string,
  mods: { ctrl?: boolean; meta?: boolean; alt?: boolean },
  onNativeControl: boolean,
): MotionKey | null {
  if (code === 'Space' || key === ' ') return onNativeControl ? null : { kind: 'toggle' }
  if (!mods.ctrl && !mods.meta && !mods.alt && key.toLowerCase() === 'r') return { kind: 'replay' }
  switch (key) {
    case 'ArrowRight':
      return { kind: 'step', to: 'next' }
    case 'ArrowLeft':
      return { kind: 'step', to: 'prev' }
    case 'Home':
      return { kind: 'step', to: 'start' }
    case 'End':
      return { kind: 'step', to: 'end' }
    default:
      return null
  }
}
