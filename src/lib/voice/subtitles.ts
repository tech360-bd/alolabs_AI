/**
 * Subtitle + audio-segmentation helpers (Module C "additional audio tools",
 * Module D "timestamps / SRT/VTT export").
 *
 * Everything here is pure and operates on transcripts the platform OWNS
 * (CallTranscript.segments, AsrJob results, TtsJob chunk manifests). It never
 * invents timing: a segment without timestamps is skipped by the subtitle
 * exporters rather than being given a fake clock.
 */

export interface TimedSegment {
  speaker?: string
  text: string
  startMs: number
  endMs: number
  confidence?: number
}

/** Format milliseconds as SRT (00:00:01,250) or VTT (00:00:01.250). */
export function formatTimestamp(ms: number, style: 'srt' | 'vtt' = 'srt'): string {
  const safe = Math.max(0, Math.round(ms))
  const h = Math.floor(safe / 3_600_000)
  const m = Math.floor((safe % 3_600_000) / 60_000)
  const s = Math.floor((safe % 60_000) / 1000)
  const milli = safe % 1000
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  const sep = style === 'srt' ? ',' : '.'
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(milli, 3)}`
}

/** True when the segment carries usable timing (end > start). */
export function hasUsableTiming(segment: Pick<TimedSegment, 'startMs' | 'endMs'>): boolean {
  return Number.isFinite(segment.startMs) && Number.isFinite(segment.endMs) && segment.endMs > segment.startMs
}

export interface SubtitleOptions {
  /** Prefix speaker labels when the transcript is diarized. Default true. */
  includeSpeaker?: boolean
  /** Maximum characters per cue before wrapping. Default 84 (2 lines × 42). */
  maxCharsPerCue?: number
  /** Speaker label used when a segment has none. */
  defaultSpeaker?: string
}

function cueText(segment: TimedSegment, options: SubtitleOptions): string {
  const parts: string[] = []
  if (options.includeSpeaker !== false && segment.speaker) parts.push(`${segment.speaker}:`)
  parts.push(segment.text.trim())
  const line = parts.join(' ')
  const max = options.maxCharsPerCue ?? 84
  if (line.length <= max) return line
  // Wrap on word boundaries; Bangla has few spaces, so fall back to hard wrap.
  const words = line.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if ((current + ' ' + word).trim().length > max && current) {
      lines.push(current.trim())
      current = word
    } else {
      current = `${current} ${word}`
    }
  }
  if (current.trim()) lines.push(current.trim())
  return lines.join('\n')
}

/**
 * Build an SRT document. Segments without usable timing are DROPPED and
 * reported in `skipped` so a caller can surface "3 segments had no timing".
 */
export function toSrt(segments: TimedSegment[], options: SubtitleOptions = {}): { srt: string; cues: number; skipped: number } {
  const usable = segments.filter((s) => s.text.trim() && hasUsableTiming(s))
  const srt = usable
    .map((segment, index) => {
      const start = formatTimestamp(segment.startMs, 'srt')
      const end = formatTimestamp(segment.endMs, 'srt')
      return `${index + 1}\n${start} --> ${end}\n${cueText(segment, options)}`
    })
    .join('\n\n')
  return { srt: srt ? `${srt}\n` : '', cues: usable.length, skipped: segments.length - usable.length }
}

/** Build a WebVTT document (same rules as SRT). */
export function toVtt(segments: TimedSegment[], options: SubtitleOptions = {}): { vtt: string; cues: number; skipped: number } {
  const usable = segments.filter((s) => s.text.trim() && hasUsableTiming(s))
  const body = usable
    .map((segment, index) => {
      const start = formatTimestamp(segment.startMs, 'vtt')
      const end = formatTimestamp(segment.endMs, 'vtt')
      return `${index + 1}\n${start} --> ${end}\n${cueText(segment, options)}`
    })
    .join('\n\n')
  return { vtt: `WEBVTT\n\n${body}${body ? '\n' : ''}`, cues: usable.length, skipped: segments.length - usable.length }
}

export interface AudioChunk {
  index: number
  text: string
  /** Absolute start offset in ms, tied to the plan's chunk durations. */
  startMs: number
  endMs: number
}

/**
 * Segment long-form text for streaming/batch synthesis.
 *
 * Given per-chunk measured durations (or estimates) it returns chunks whose
 * offsets are cumulative — the basis for a single audio timeline and for
 * subtitle timing. `estimateMs` is used only when a real duration is absent and
 * is flagged as such, because subtitles built on estimates must be labeled.
 */
export function planAudioSegments(
  sentences: string[],
  options: { maxChars?: number; gapMs?: number; durationsMs?: number[]; estimateFn?: (text: string) => number } = {},
): { chunks: AudioChunk[]; basedOnEstimates: boolean } {
  const maxChars = options.maxChars ?? 280
  const gapMs = options.gapMs ?? 180
  const estimateFn = options.estimateFn ?? ((text: string) => Math.round(([...text].length / 13) * 1000))

  const chunks: AudioChunk[] = []
  let cursor = 0
  let index = 0
  let basedOnEstimates = false

  for (const sentence of sentences) {
    const trimmed = sentence.trim()
    if (!trimmed) continue
    for (const piece of trimmed.length > maxChars ? splitAtBoundary(trimmed, maxChars) : [trimmed]) {
      const measured = options.durationsMs?.[index]
      const duration = typeof measured === 'number' && measured > 0 ? measured : estimateFn(piece)
      if (typeof measured !== 'number' || measured <= 0) basedOnEstimates = true
      chunks.push({ index, text: piece, startMs: cursor, endMs: cursor + duration })
      cursor += duration + gapMs
      index++
    }
  }
  return { chunks, basedOnEstimates }
}

function splitAtBoundary(text: string, maxChars: number): string[] {
  const out: string[] = []
  let buffer = ''
  for (const word of text.split(/\s+/)) {
    if ((buffer + ' ' + word).trim().length > maxChars && buffer) {
      out.push(buffer.trim())
      buffer = word
    } else {
      buffer = `${buffer} ${word}`
    }
  }
  if (buffer.trim()) out.push(buffer.trim())
  return out
}

/**
 * Silence removal (non-destructive planning): given VAD/energy-derived silent
 * spans, return the KEPT spans so a media worker can cut them. The plan is data
 * only — this module never touches audio bytes, and it refuses overlapping or
 * out-of-range spans instead of guessing.
 */
export function computeSilenceTrimPlan(
  totalDurationMs: number,
  silentSpans: Array<{ startMs: number; endMs: number }>,
  options: { minSilenceMs?: number; keepPaddingMs?: number } = {},
): { kept: Array<{ startMs: number; endMs: number }>; keptMs: number; removedMs: number; rejected: number } {
  const minSilence = options.minSilenceMs ?? 400
  const padding = options.keepPaddingMs ?? 120
  let rejected = 0
  const valid = silentSpans
    .filter((s) => {
      const ok = Number.isFinite(s.startMs) && Number.isFinite(s.endMs) &&
        s.startMs >= 0 && s.endMs <= totalDurationMs && s.endMs > s.startMs
      if (!ok) rejected++
      return ok
    })
    .filter((s) => s.endMs - s.startMs >= minSilence)
    .sort((a, b) => a.startMs - b.startMs)

  const kept: Array<{ startMs: number; endMs: number }> = []
  let cursor = 0
  let removedMs = 0
  for (const span of valid) {
    // Keep padding around speech so cuts do not clip consonants.
    const cutStart = Math.max(cursor, span.startMs + padding)
    const cutEnd = Math.min(totalDurationMs, span.endMs - padding)
    if (cutEnd <= cutStart) continue
    if (cutStart > cursor) kept.push({ startMs: cursor, endMs: cutStart })
    removedMs += cutEnd - cutStart
    cursor = cutEnd
  }
  if (cursor < totalDurationMs) kept.push({ startMs: cursor, endMs: totalDurationMs })

  const keptMs = kept.reduce((sum, k) => sum + (k.endMs - k.startMs), 0)
  return { kept, keptMs, removedMs, rejected }
}

/**
 * Sentence-level diff for the "correction workflow" in Module D: a reviewer
 * edits a transcript, and the platform records what changed without destroying
 * the machine output.
 */
export interface TranscriptCorrection {
  segmentIndex: number
  original: string
  corrected: string
  changed: boolean
}

export function diffTranscriptSegments(
  machineSegments: Array<{ text: string }>,
  correctedTexts: string[],
): { corrections: TranscriptCorrection[]; changedCount: number } {
  const corrections: TranscriptCorrection[] = []
  const length = Math.max(machineSegments.length, correctedTexts.length)
  for (let i = 0; i < length; i++) {
    const original = machineSegments[i]?.text ?? ''
    const corrected = correctedTexts[i] ?? ''
    const changed = original.trim() !== corrected.trim()
    if (changed) corrections.push({ segmentIndex: i, original, corrected, changed })
  }
  return { corrections, changedCount: corrections.length }
}

/** Word/character error rates against a reference transcript (ASR benchmarks). */
export function characterErrorRate(reference: string, hypothesis: string): number {
  const a = [...reference.replace(/\s+/g, ' ').trim()]
  const b = [...hypothesis.replace(/\s+/g, ' ').trim()]
  if (a.length === 0) return b.length === 0 ? 0 : 1
  return levenshtein(a, b) / a.length
}

export function wordErrorRate(reference: string, hypothesis: string): number {
  const a = reference.trim().split(/\s+/).filter(Boolean)
  const b = hypothesis.trim().split(/\s+/).filter(Boolean)
  if (a.length === 0) return b.length === 0 ? 0 : 1
  return levenshtein(a, b) / a.length
}

function levenshtein<T>(a: T[], b: T[]): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost)
    }
    previous = current
  }
  return previous[b.length]
}
