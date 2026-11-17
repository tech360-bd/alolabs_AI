import { db } from '@/lib/db'
import { readJson, requireString, optionalString, withCompany } from '@/lib/voice/api-helpers'
import { runTtsJob, runTtsBatch } from '@/lib/voice/tts-service'
import { speechCapabilitySnapshot } from '@/lib/voice/speech-bootstrap'

export const dynamic = 'force-dynamic'

/**
 * Bangla TTS studio API (Module C).
 *
 * GET   — recent jobs + the REAL speech-engine capability snapshot
 * POST  — synthesize. Two shapes:
 *           { text, language?, settings?, dryRun? }        → single job
 *           { items: [{ text, language? }, …], batch }     → batch jobs
 *
 * HONEST BEHAVIOR: when no speech engine is deployed the job is recorded and
 * immediately failed with error `no_speech_provider_configured` — the API never
 * returns synthetic audio. Nothing is metered for a failed job.
 */
export async function GET() {
  return withCompany(async (auth) => {
    const [jobs, engines] = await Promise.all([
      db.ttsJob.findMany({
        where: { companyId: auth.companyId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true, text: true, language: true, status: true, characters: true,
          durationSeconds: true, provider: true, simulated: true, error: true,
          outputKey: true, outputFormat: true, createdAt: true,
        },
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

    const settings = typeof body.settings === 'object' && body.settings ? (body.settings as never) : undefined

    // Batch mode: many texts, one request, per-item honest results.
    if (Array.isArray(body.items)) {
      const items = (body.items as Array<Record<string, unknown>>)
        .map((item) => ({
          text: typeof item.text === 'string' ? item.text : '',
          language: typeof item.language === 'string' ? item.language : undefined,
          voiceLibraryItemId: typeof item.voiceLibraryItemId === 'string' ? item.voiceLibraryItemId : undefined,
        }))
        .filter((item) => item.text.trim().length > 0)
      if (items.length === 0) throw new Error('Invalid request: items must contain at least one { text }')
      const batch = await runTtsBatch({
        companyId: auth.companyId,
        items,
        language: optionalString(body, 'language'),
        settings,
      })
      return { data: batch, notice: `${batch.completed} completed, ${batch.failed} failed.` }
    }

    const text = requireString(body, 'text')
    const language = optionalString(body, 'language') ?? 'bn-BD'
    const result = await runTtsJob({
      companyId: auth.companyId,
      text,
      language,
      voiceLibraryItemId: optionalString(body, 'voiceLibraryItemId'),
      engineId: optionalString(body, 'engine'),
      settings,
      dryRun: body.dryRun === true,
    })

    const job = await db.ttsJob.findFirst({ where: { id: result.jobId, companyId: auth.companyId } })
    return { data: { job, result }, notice: result.notice }
  })
}
