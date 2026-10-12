/**
 * Motion reference figures — the same flowchart rendered in each playback mode.
 *
 * Built from the static `flowchart` example so the complete figure is identical
 * across modes; only the `motion` declaration differs. Every marked id exists in
 * that example, which the tests enforce through `validateMotion`.
 */

import { EXAMPLES } from './examples'
import type { DiagramSpec } from './spec'
import type { MotionSpec } from './motion'

const base = EXAMPLES.find((e) => e.kind === 'flowchart')
if (!base) throw new Error('flowchart example missing; motion examples cannot be built')

const steps: MotionSpec['steps'] = [
  { label: 'Install request received', ids: ['start'] },
  { label: 'Risk level evaluated', ids: ['risk'] },
  { label: 'Human review for risky installs', ids: ['review'] },
  { label: 'Published or returned with notes', ids: ['publish', 'reject'] },
]

function withMotion(slug: string, title: string, motion: MotionSpec): DiagramSpec {
  return { ...base!, slug, title, motion }
}

export const MOTION_EXAMPLES: { id: 'step' | 'reveal' | 'loop'; label: string; spec: DiagramSpec; note: string }[] = [
  {
    id: 'step',
    label: 'Step',
    note: 'Paused semantic states. Use Previous / Next, or the keyboard, to walk the decision.',
    spec: withMotion(`${base!.slug}-motion-step`, base!.title, { mode: 'step', steps }),
  },
  {
    id: 'reveal',
    label: 'Reveal',
    note: 'One autoplay run that ends complete. Replay is explicit; it never restarts on its own.',
    spec: withMotion(`${base!.slug}-motion-reveal`, base!.title, { mode: 'reveal', steps }),
  },
  {
    id: 'loop',
    label: 'Loop',
    note: 'Decorative flow token on the focal connector only. Meaning is complete without it.',
    spec: withMotion(`${base!.slug}-motion-loop`, base!.title, { mode: 'loop' }),
  },
]
