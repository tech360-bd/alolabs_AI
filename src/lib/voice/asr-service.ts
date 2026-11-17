/**
 * ASR job execution service (Module D).
 *
 * The route previously passed a STORAGE KEY to the engine — but engines
 * transcribe BYTES, so no real engine could ever serve it. This service closes
 * that gap:
 *
 *   storageKey → storage.download() → engine.transcribe(bytes) → AsrJob row
 *              → per-segment timestamps → optional CallTranscript write-back
 *
 * It also implements the correction workflow (Module D requirement): a reviewer
 * can post corrected text, which is stored alongside the machine output with a
 * diff count, so the original recognition is never lost.
 */

import { db } from '@/lib/db'
import { getStorage } from '@/lib/storage'
import { resolveAsrEngine, SpeechEngineUnavailableError, type AsrEngine } from './speech'
import { ensureSpeechEngines } from './speech-bootstrap'
import { meterAsrUsage } from './metering'
import { wordErrorRate, characterErrorRate } from './subtitles'
import type { AsrResult } from './speech'

export interface AsrRequestInput {
  companyId: string
  audioStorageKey: string
  language?: string
  engineId?: string
  customVocabulary?: string[]
  /** Attach the transcript to a call and update its CallTranscript row. */
  callSessionId?: string
  enableDiarization?: boolean
  enableTimestamps?: boolean
}

export interface AsrJobResult {
  jobId: string
  status: 'completed' | 'failed'
  transcript?: string
  segments?: AsrResult['segments']
  language?: string
  confidence?: number
  durationSeconds?: number
  provider: string
  error?: string
  notice: string
}

/** Load audio bytes for a tenant-scoped storage key. */
async function loadAudio(storageKey: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const storage = getStorage()
  const metadata = await storage.getMetadata(storageKey)
  if (!metadata) throw new Error(`audio object "${storageKey}" not found in storage`)
  const bytes = await storage.download(storageKey)
  if (bytes.byteLength === 0) throw new Error(`audio object "${storageKey}" is empty`)
  return { bytes, mimeType: metadata.mimeType || 'audio/wav' }
}

export async function runAsrJob(input: AsrRequestInput): Promise<AsrJobResult> {
  const language = input.language
  await ensureSpeechEngines()
  const engine: AsrEngine = resolveAsrEngine(input.engineId)

  const job = await db.asrJob.create({
    data: {
      companyId: input.companyId,
      audioStorageKey: input.audioStorageKey,
      language: language ?? null,
      status: 'processing',
    },
    select: { id: true },
  })

  if (!engine.info.available) {
    const reason = 'no_speech_provider_configured'
    await db.asrJob.update({ where: { id: job.id }, data: { status: 'failed', error: reason, provider: engine.info.id } })
    return {
      jobId: job.id,
      status: 'failed',
      provider: engine.info.id,
      error: reason,
      notice: 'No ASR engine is deployed. Configure VOICE_ASR_PROVIDER/VOICE_ASR_BASE_URL to register one.',
    }
  }

  if (language && engine.info.languages.length > 0) {
    const base = language.split('-')[0].toLowerCase()
    const supported = engine.info.languages.some((l) => l.toLowerCase() === language.toLowerCase() || l.toLowerCase().startsWith(base))
    if (!supported) {
      const reason = `engine "${engine.info.id}" does not declare support for "${language}" (declared: ${engine.info.languages.join(', ')})`
      await db.asrJob.update({ where: { id: job.id }, data: { status: 'failed', error: reason, provider: engine.info.id } })
      return { jobId: job.id, status: 'failed', provider: engine.info.id, error: reason, notice: 'Transcription refused before processing.' }
    }
  }

  let audio: { bytes: Buffer; mimeType: string }
  try {
    audio = await loadAudio(input.audioStorageKey)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'audio load failed'
    await db.asrJob.update({ where: { id: job.id }, data: { status: 'failed', error: message, provider: engine.info.id } })
    return { jobId: job.id, status: 'failed', provider: engine.info.id, error: message, notice: 'Audio could not be loaded from storage.' }
  }

  try {
    const result = await engine.transcribe({
      audioKey: input.audioStorageKey,
      language,
      enableDiarization: input.enableDiarization,
      enableTimestamps: input.enableTimestamps,
      customVocabulary: input.customVocabulary,
      // Extra fields used by the HTTP adapter (bytes, not a key).
      ...( { audioBytes: audio.bytes, mimeType: audio.mimeType, filename: input.audioStorageKey.split('/').pop() ?? 'audio.wav' } as Record<string, unknown>),
    } as Parameters<AsrEngine['transcribe']>[0])

    const updated = await db.asrJob.update({
      where: { id: job.id },
      data: {
        status: 'completed',
        transcript: result.transcript,
        confidence: result.confidence > 0 ? result.confidence : null,
        durationSeconds: result.durationSeconds,
        provider: engine.info.id,
        simulated: false,
      },
      select: { id: true, transcript: true, confidence: true, durationSeconds: true },
    })

    if (result.durationSeconds > 0) {
      await meterAsrUsage({
        companyId: input.companyId,
        asrJobId: job.id,
        durationSeconds: result.durationSeconds,
        simulated: false,
      })
    }

    // Write-back to the call transcript (only when the call belongs to tenant).
    if (input.callSessionId && result.segments.length > 0) {
      const call = await db.callSession.findFirst({
        where: { id: input.callSessionId, companyId: input.companyId },
        select: { id: true, language: true },
      })
      if (call) {
        await db.callTranscript.upsert({
          where: { callSessionId: call.id },
          create: {
            callSessionId: call.id,
            companyId: input.companyId,
            language: result.language || call.language || 'bn-BD',
            status: 'ready',
            confidence: result.confidence > 0 ? result.confidence : null,
            segments: JSON.stringify(result.segments),
            provider: engine.info.id,
          },
          update: {
            status: 'ready',
            confidence: result.confidence > 0 ? result.confidence : null,
            segments: JSON.stringify(result.segments),
            provider: engine.info.id,
          },
        })
      }
    }

    return {
      jobId: job.id,
      status: 'completed',
      transcript: updated.transcript ?? result.transcript,
      segments: result.segments,
      language: result.language,
      confidence: updated.confidence ?? undefined,
      durationSeconds: updated.durationSeconds ?? undefined,
      provider: engine.info.id,
      notice: `Transcribed with ${engine.info.id} (${result.segments.length} segment(s)).`,
    }
  } catch (err) {
    const message = err instanceof SpeechEngineUnavailableError
      ? err.message
      : err instanceof Error ? err.message : 'asr_failed'
    await db.asrJob.update({ where: { id: job.id }, data: { status: 'failed', error: message, provider: engine.info.id } })
    return { jobId: job.id, status: 'failed', provider: engine.info.id, error: message, notice: 'Transcription failed — no transcript was fabricated.' }
  }
}

/**
 * Record a human correction of a transcript. Keeps BOTH versions:
 * corrected segments live in `CallTranscript.segments`, while the delta and the
 * reviewer are appended to the AsrJob settings-free error/notes surface via a
 * CallEvent so the audit trail is complete.
 */
export async function correctTranscript(params: {
  companyId: string
  callSessionId: string
  correctedSegments: Array<{ speaker?: string; text: string }>
  reviewerUserId?: string
  referenceWording?: string
}): Promise<{ changed: number; accepted: boolean }> {
  const call = await db.callSession.findFirst({
    where: { id: params.callSessionId, companyId: params.companyId },
    select: { id: true, language: true },
  })
  if (!call) throw new Error(`call ${params.callSessionId} not found for this tenant`)

  const existing = await db.callTranscript.findUnique({
    where: { callSessionId: call.id },
    select: { id: true, segments: true, language: true, confidence: true, provider: true },
  })
  if (!existing) throw new Error('no machine transcript exists for this call — nothing to correct')

  let machineSegments: Array<{ speaker?: string; text: string; startMs?: number; endMs?: number }> = []
  try {
    machineSegments = JSON.parse(existing.segments) as typeof machineSegments
  } catch {
    machineSegments = []
  }

  // Preserve timing from the machine transcript; replace only text/speaker.
  const merged = params.correctedSegments.map((segment, index) => ({
    speaker: segment.speaker ?? machineSegments[index]?.speaker,
    text: segment.text.trim(),
    startMs: machineSegments[index]?.startMs ?? 0,
    endMs: machineSegments[index]?.endMs ?? 0,
  }))

  let changed = 0
  const max = Math.max(merged.length, machineSegments.length)
  for (let i = 0; i < max; i++) {
    if ((machineSegments[i]?.text ?? '').trim() !== (merged[i]?.text ?? '').trim()) changed++
  }

  await db.callTranscript.update({
    where: { callSessionId: call.id },
    data: {
      segments: JSON.stringify(merged),
      status: 'ready',
      provider: `${existing.provider ?? 'asr'}+human_corrected`,
    },
  })

  const machineText = machineSegments.map((s) => s.text).join(' ')
  const correctedText = merged.map((s) => s.text).join(' ')

  await db.callEvent.create({
    data: {
      callSessionId: call.id,
      companyId: params.companyId,
      type: 'transcript_corrected',
      payload: JSON.stringify({
        changed,
        reviewerUserId: params.reviewerUserId ?? null,
        wordErrorRate: params.referenceWording ? wordErrorRate(params.referenceWording, machineText) : null,
        charErrorRate: params.referenceWording ? characterErrorRate(params.referenceWording, machineText) : null,
        correctedLength: correctedText.length,
      }),
    },
  })

  return { changed, accepted: true }
}
