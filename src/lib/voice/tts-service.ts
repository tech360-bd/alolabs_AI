/**
 * TTS job execution service (Module C).
 *
 * The route used to call `engine.synthesize()` and hope the adapter stored the
 * audio. Real engines return BYTES. This service is the missing middle:
 *
 *   text → pronunciation dictionary → normalization → sentence chunking →
 *   engine synthesis (per chunk) → object storage → job row → metering
 *
 * HONEST BEHAVIOR (unchanged from the route's original contract)
 * -------------------------------------------------------------
 * - No engine deployed → job fails with `no_speech_provider_configured` and
 *   NOTHING is metered or stored.
 * - Engine deployed but errors → job fails with the engine's real message.
 * - Audio is stored ONLY after bytes actually arrived, and `outputKey` is the
 *   storage key returned by the storage provider (so it is downloadable).
 * - Long texts are chunked; if chunk 3 of 5 fails the job is `failed` and the
 *   partial audio is NOT presented as a complete file. The error names the
 *   chunk so an operator can see where it broke.
 */

import { db } from '@/lib/db'
import { getStorage } from '@/lib/storage'
import { concatSpeechChunks, wavDurationSeconds } from './audio-concat'
import {
  countTtsCharacters,
  engineSupportsLanguage,
  resolveTtsEngine,
  SpeechEngineUnavailableError,
  type TtsEngine,
} from './speech'
import { ensureSpeechEngines } from './speech-bootstrap'
import { normalizeForSpeech, splitIntoSpeechSentences } from './bangla-text'
import { meterTtsUsage } from './metering'

export interface TtsRequestInput {
  companyId: string
  text: string
  language?: string
  voiceLibraryItemId?: string
  engineId?: string
  settings?: {
    speed?: number
    pitch?: number
    stability?: number
    format?: 'mp3' | 'wav'
    /** Skip the phrase dictionary / number expansion (expert use). */
    skipNormalization?: boolean
  }
  dryRun?: boolean
}

export interface TtsJobResult {
  jobId: string
  status: 'completed' | 'failed'
  outputKey?: string
  outputFormat?: string
  durationSeconds?: number
  characters: number
  chunks: number
  provider: string
  /** The exact text that was synthesized (after normalization). */
  normalizedText?: string
  substitutions?: Array<{ from: string; to: string; rule: string }>
  error?: string
  notice: string
}

/** Load the tenant's pronunciation dictionary for a language. */
async function loadPronunciation(companyId: string, language: string) {
  const rows = await db.pronunciationEntry.findMany({
    where: { companyId, language, enabled: true },
    orderBy: { term: 'desc' }, // longer terms first so phrases win over substrings
    take: 500,
    select: { term: true, phonetic: true, caseSensitive: true },
  })
  return rows
}

function chunksFor(text: string, language: string, skipNormalization?: boolean) {
  if (skipNormalization) return { chunks: [text], substitutions: [] as Array<{ from: string; to: string; rule: string }>, normalized: text }
  const pending = normalizeForSpeech(text, language)
  return {
    chunks: splitIntoSpeechSentences(pending.text, 280),
    substitutions: pending.substitutions,
    normalized: pending.text,
  }
}

/**
 * Run one TTS job end-to-end. Creates its own TtsJob row so the UI has a record
 * even when the engine is missing (a failed job is information, not noise).
 */
export async function runTtsJob(input: TtsRequestInput): Promise<TtsJobResult> {
  const language = input.language ?? 'bn-BD'
  const text = input.text?.trim()
  if (!text) throw new Error('text is required')

  await ensureSpeechEngines()
  const engine: TtsEngine = resolveTtsEngine(input.engineId)

  const pronunciation = await loadPronunciation(input.companyId, language)
  const pre = pronunciation.length > 0 && input.settings?.skipNormalization !== true
    ? normalizeForSpeech(text, language, { pronunciation })
    : { text, substitutions: [] as Array<{ from: string; to: string; rule: string }> }

  const job = await db.ttsJob.create({
    data: {
      companyId: input.companyId,
      text,
      language,
      voiceLibraryItemId: input.voiceLibraryItemId ?? null,
      settings: JSON.stringify({
        ...(input.settings ?? {}),
        // Store what the engine was ACTUALLY asked to say, so a quality review
        // can tell "the voice mispronounced it" from "we sent the wrong text".
        normalizedText: pre.text.slice(0, 4000),
        substitutions: pre.substitutions.slice(0, 50),
      }),
      characters: countTtsCharacters(text),
      status: 'processing',
    },
    select: { id: true },
  })

  // Language capability gate BEFORE any synthesis cost.
  if (!engineSupportsLanguage(engine.info, language)) {
    const reason = engine.info.available
      ? `engine "${engine.info.id}" does not declare support for "${language}" (declared: ${engine.info.languages.join(', ')})`
      : 'no_speech_provider_configured'
    await db.ttsJob.update({
      where: { id: job.id },
      data: { status: 'failed', error: reason, provider: engine.info.id },
    })
    return {
      jobId: job.id,
      status: 'failed',
      characters: countTtsCharacters(text),
      chunks: 0,
      provider: engine.info.id,
      error: reason,
      notice: engine.info.available
        ? 'Refused before synthesis: the selected engine does not claim this language. See docs/BANGLA_VOICE_MODEL_EVALUATION.md.'
        : 'No TTS engine is deployed. Configure VOICE_TTS_PROVIDER/VOICE_TTS_BASE_URL to register one.',
    }
  }

  const { chunks, substitutions, normalized } = chunksFor(text, language, input.settings?.skipNormalization)
  if (chunks.length === 0) {
    await db.ttsJob.update({ where: { id: job.id }, data: { status: 'failed', error: 'text produced no speakable sentences' } })
    return { jobId: job.id, status: 'failed', characters: 0, chunks: 0, provider: engine.info.id, error: 'empty_after_normalization', notice: 'Nothing to synthesize after normalization.' }
  }

  if (input.dryRun) {
    await db.ttsJob.update({ where: { id: job.id }, data: { status: 'queued', error: 'dry_run: not synthesized' } })
    return {
      jobId: job.id,
      status: 'failed',
      characters: countTtsCharacters(text),
      chunks: chunks.length,
      provider: engine.info.id,
      normalizedText: normalized,
      substitutions,
      error: 'dry_run',
      notice: 'Dry run: text was normalized and segmented but no audio was requested.',
    }
  }

  const format = input.settings?.format === 'wav' ? 'wav' : 'mp3'

  try {
    let totalDuration = 0
    let totalBytes = 0
    const audioParts: Buffer[] = []

    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index]
      try {
        // Prefer the byte-returning path when the engine offers it.
        const withBytes = engine as TtsEngine & { synthesizeBytes?: (req: unknown) => Promise<{ bytes: Buffer }> }
        if (typeof withBytes.synthesizeBytes === 'function') {
          const { bytes } = await withBytes.synthesizeBytes({
            text: chunk,
            language,
            voiceId: input.voiceLibraryItemId,
            settings: input.settings,
          })
          audioParts.push(bytes)
          totalBytes += bytes.byteLength
          totalDuration += estimateChunkDuration(chunk, language)
        } else {
          const result = await engine.synthesize({
            text: chunk,
            language,
            voiceId: input.voiceLibraryItemId,
            settings: input.settings,
          })
          totalDuration += result.durationSeconds
        }
      } catch (chunkErr) {
        const message = chunkErr instanceof Error ? chunkErr.message : 'synthesis failed'
        throw new Error(`chunk ${index + 1}/${chunks.length} failed: ${message}`)
      }
    }

    let outputKey: string | null = null
    let storageError: string | null = null

    if (audioParts.length > 0) {
      try {
        // Chunks are independent files. Concatenating raw bytes corrupts a WAV
        // (the header keeps the first chunk's length, so players stop after
        // sentence one). Merge per format instead.
        const merged = concatSpeechChunks(audioParts, format)
        // Prefer the real measured duration over the estimate when the merged
        // artefact can be measured.
        if (format === 'wav') {
          try {
            totalDuration = wavDurationSeconds(merged)
          } catch {
            // Fall back to the per-chunk estimate already accumulated.
          }
        }
        const storage = getStorage()
        const upload = await storage.upload(merged, `tts-${job.id}.${format}`, {
          folder: 'voice/tts',
          mimeType: format === 'wav' ? 'audio/wav' : 'audio/mpeg',
          companyId: input.companyId,
        })
        outputKey = upload.id
      } catch (err) {
        // Audio was produced but could not be stored. That is a failure of the
        // job's deliverable, so it must NOT be reported as completed.
        storageError = err instanceof Error ? err.message : 'storage failed'
      }
    }

    if (storageError) {
      throw new Error(`audio generated (${totalBytes} bytes) but storage failed: ${storageError}`)
    }

    const updated = await db.ttsJob.update({
      where: { id: job.id },
      data: {
        status: 'completed',
        outputKey,
        outputFormat: format,
        durationSeconds: Math.round(totalDuration * 10) / 10,
        provider: engine.info.id,
        simulated: false,
      },
      select: { id: true, outputKey: true, outputFormat: true, durationSeconds: true },
    })

    await meterTtsUsage({
      companyId: input.companyId,
      ttsJobId: job.id,
      text,
      durationSeconds: updated.durationSeconds ?? 0,
      simulated: false,
    })

    return {
      jobId: job.id,
      status: 'completed',
      outputKey: updated.outputKey ?? undefined,
      outputFormat: updated.outputFormat ?? undefined,
      durationSeconds: updated.durationSeconds ?? 0,
      characters: countTtsCharacters(text),
      chunks: chunks.length,
      provider: engine.info.id,
      normalizedText: normalized,
      substitutions,
      notice: `Synthesized ${chunks.length} sentence chunk(s) with ${engine.info.id}.`,
    }
  } catch (err) {
    const message = err instanceof SpeechEngineUnavailableError
      ? 'no_speech_provider_configured'
      : err instanceof Error ? err.message : 'tts_failed'
    await db.ttsJob.update({
      where: { id: job.id },
      data: { status: 'failed', error: message, provider: engine.info.id },
    })
    return {
      jobId: job.id,
      status: 'failed',
      characters: countTtsCharacters(text),
      chunks: chunks.length,
      provider: engine.info.id,
      normalizedText: normalized,
      substitutions,
      error: message,
      notice: 'Speech generation failed honestly — no audio was produced.',
    }
  }
}

/** Planning duration for a chunk (engines report real duration when available). */
function estimateChunkDuration(text: string, language: string): number {
  const chars = [...text].length
  const cps = language.toLowerCase().startsWith('bn') ? 13 : 15
  return chars / cps
}

/** Batch: synthesize many texts, returning per-item results (never one big fail). */
export async function runTtsBatch(params: {
  companyId: string
  items: Array<{ text: string; language?: string; voiceLibraryItemId?: string }>
  settings?: TtsRequestInput['settings']
  language?: string
}): Promise<{ results: TtsJobResult[]; completed: number; failed: number }> {
  if (params.items.length === 0) throw new Error('batch requires at least one item')
  if (params.items.length > 100) throw new Error('batch limited to 100 items per request')
  const results: TtsJobResult[] = []
  for (const item of params.items) {
    const result = await runTtsJob({
      companyId: params.companyId,
      text: item.text,
      language: item.language ?? params.language ?? 'bn-BD',
      voiceLibraryItemId: item.voiceLibraryItemId,
      settings: params.settings,
    })
    results.push(result)
  }
  return {
    results,
    completed: results.filter((r) => r.status === 'completed').length,
    failed: results.filter((r) => r.status === 'failed').length,
  }
}
