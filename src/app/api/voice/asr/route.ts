import { db } from '@/lib/db'
import { readJson, requireString, optionalString, withCompany } from '@/lib/voice/api-helpers'
import { runAsrJob, correctTranscript } from '@/lib/voice/asr-service'
import { speechCapabilitySnapshot } from '@/lib/voice/speech-bootstrap'

export const dynamic = 'force-dynamic'

/**
 * Speech-to-text API (Module D). Multilingual: bn-BD primary, en/hi/ar
 * extensible.
 *
 * GET   — recent jobs + real engine capability snapshot
 * POST  — { audioStorageKey, language?, callSessionId?, customVocabulary? }
 *         → transcribes the stored audio with a deployed engine
 * PATCH — { callSessionId, correctedSegments[] } → human correction of a
 *         machine transcript (keeps both versions, records a diff count)
 *
 * Honest behavior: no engine → job fails `no_speech_provider_configured`; a
 * missing audio object fails before any model runs. No transcript is invented.
 */
export async function GET() {
  return withCompany(async (auth) => {
    const [jobs, engines] = await Promise.all([
      db.asrJob.findMany({
        where: { companyId: auth.companyId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      speechCapabilitySnapshot(),
    ])
    return { data: jobs, total: jobs.length, engines }
  })
}

export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const audioStorageKey = requireString(body, 'audioStorageKey')

    const result = await runAsrJob({
      companyId: auth.companyId,
      audioStorageKey,
      language: optionalString(body, 'language'),
      engineId: optionalString(body, 'engine'),
      callSessionId: optionalString(body, 'callSessionId'),
      enableDiarization: body.enableDiarization !== false,
      enableTimestamps: body.enableTimestamps !== false,
      customVocabulary: Array.isArray(body.customVocabulary)
        ? (body.customVocabulary as unknown[]).filter((v): v is string => typeof v === 'string')
        : undefined,
    })

    const job = await db.asrJob.findFirst({ where: { id: result.jobId, companyId: auth.companyId } })
    return { data: { job, result }, notice: result.notice }
  })
}

export async function PATCH(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const callSessionId = requireString(body, 'callSessionId')
    if (!Array.isArray(body.correctedSegments) || body.correctedSegments.length === 0) {
      throw new Error('Invalid request: correctedSegments must be a non-empty array of { text }')
    }
    const corrected = (body.correctedSegments as Array<Record<string, unknown>>)
      .map((s) => ({
        text: typeof s.text === 'string' ? s.text : '',
        speaker: typeof s.speaker === 'string' ? s.speaker : undefined,
      }))
      .filter((s) => s.text.trim().length > 0)
    if (corrected.length === 0) throw new Error('Invalid request: every corrected segment needs text')

    const result = await correctTranscript({
      companyId: auth.companyId,
      callSessionId,
      correctedSegments: corrected,
      reviewerUserId: auth.userId,
      referenceWording: optionalString(body, 'referenceWording'),
    })
    return {
      data: result,
      notice: `${result.changed} segment(s) corrected. The machine transcript is preserved in the call audit trail.`,
    }
  })
}
