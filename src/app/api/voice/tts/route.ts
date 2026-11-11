import { db } from '@/lib/db'
import { readJson, requireString, optionalString, withCompany } from '@/lib/voice/api-helpers'
import {
  resolveTtsEngine,
  engineSupportsLanguage,
  countTtsCharacters,
  SpeechEngineUnavailableError,
} from '@/lib/voice/speech'
import { meterTtsUsage } from '@/lib/voice/metering'

export const dynamic = 'force-dynamic'

/**
 * Bangla TTS studio API (Module C).
 *
 * HONEST BEHAVIOR: when no speech engine is deployed the job is recorded and
 * immediately failed with error `no_speech_provider_configured` — the API
 * never returns synthetic/fake audio. The metering rows are also stamped
 * simulated=false; failed jobs meter nothing.
 */
export async function GET() {
  return withCompany(async (auth) => {
    const jobs = await db.ttsJob.findMany({
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
    const text = requireString(body, 'text')
    const language = optionalString(body, 'language') ?? 'bn-BD'

    const engine = resolveTtsEngine(optionalString(body, 'engine'))
    if (!engineSupportsLanguage(engine.info, language)) {
      throw new Error(
        `refused: TTS engine "${engine.info.id}" does not support language "${language}" (available: ${engine.info.available})`,
      )
    }

    const job = await db.ttsJob.create({
      data: {
        companyId: auth.companyId,
        text,
        language,
        voiceLibraryItemId: optionalString(body, 'voiceLibraryItemId'),
        settings: JSON.stringify(body.settings ?? {}),
        characters: countTtsCharacters(text),
        status: 'processing',
      },
    })

    try {
      const result = await engine.synthesize({ text, language, voiceId: optionalString(body, 'voiceLibraryItemId'), settings: body.settings as never })
      const updated = await db.ttsJob.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          outputKey: result.audioKey,
          outputFormat: result.format,
          durationSeconds: result.durationSeconds,
          provider: engine.info.id,
          simulated: result.simulated,
        },
      })
      await meterTtsUsage({
        companyId: auth.companyId,
        ttsJobId: job.id,
        text,
        durationSeconds: result.durationSeconds,
        simulated: result.simulated,
      })
      return { data: updated }
    } catch (err) {
      const message = err instanceof SpeechEngineUnavailableError
        ? 'no_speech_provider_configured'
        : err instanceof Error ? err.message : 'tts_failed'
      const failed = await db.ttsJob.update({
        where: { id: job.id },
        data: { status: 'failed', error: message, provider: engine.info.id },
      })
      return {
        data: failed,
        notice:
          'Speech generation failed honestly — no audio was produced. Deploy a TTS engine (e.g. a Bangla-capable local model) and register it via registerTtsEngine(). See docs/BANGLA_VOICE_MODEL_EVALUATION.md.',
      }
    }
  })
}
