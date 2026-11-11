import { db } from '@/lib/db'
import { readJson, requireString, optionalString, withCompany } from '@/lib/voice/api-helpers'
import {
  resolveAsrEngine,
  SpeechEngineUnavailableError,
} from '@/lib/voice/speech'
import { meterAsrUsage } from '@/lib/voice/metering'

export const dynamic = 'force-dynamic'

/**
 * Speech-to-text API (Module D). Multilingual: bn-BD primary, en/hi/ar
 * extensible. Honest behavior identical to the TTS route — no engine, no
 * fabricated transcript.
 */
export async function GET() {
  return withCompany(async (auth) => {
    const jobs = await db.asrJob.findMany({
      where: { companyId: auth.companyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { data: jobs, total: jobs.length }
  })
}

export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const audioStorageKey = requireString(body, 'audioStorageKey')
    const language = optionalString(body, 'language')

    const engine = resolveAsrEngine(optionalString(body, 'engine'))
    const job = await db.asrJob.create({
      data: {
        companyId: auth.companyId,
        audioStorageKey,
        language,
        status: 'processing',
      },
    })
    try {
      const result = await engine.transcribe({
        audioKey: audioStorageKey,
        language,
        enableDiarization: body.enableDiarization !== false,
        enableTimestamps: body.enableTimestamps !== false,
      })
      const updated = await db.asrJob.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          transcript: result.transcript,
          confidence: result.confidence,
          durationSeconds: result.durationSeconds,
          provider: engine.info.id,
          simulated: result.simulated,
        },
      })
      if (result.durationSeconds > 0) {
        await meterAsrUsage({
          companyId: auth.companyId,
          asrJobId: job.id,
          durationSeconds: result.durationSeconds,
          simulated: result.simulated,
        })
      }
      return { data: updated }
    } catch (err) {
      const message = err instanceof SpeechEngineUnavailableError
        ? 'no_speech_provider_configured'
        : err instanceof Error ? err.message : 'asr_failed'
      const failed = await db.asrJob.update({
        where: { id: job.id },
        data: { status: 'failed', error: message, provider: engine.info.id },
      })
      return {
        data: failed,
        notice: 'Transcription failed honestly — no transcript was produced. Deploy an ASR engine and register it via registerAsrEngine().',
      }
    }
  })
}
