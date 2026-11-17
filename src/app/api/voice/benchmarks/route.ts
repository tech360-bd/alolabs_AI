import { db } from '@/lib/db'
import { readJson, requireString, optionalString, withCompany } from '@/lib/voice/api-helpers'
import { wordErrorRate, characterErrorRate } from '@/lib/voice/subtitles'
import { buildEvalRow, evaluateGates, type AudioProfile, type EvalTask } from '@/lib/voice/eval-harness'

export const dynamic = 'force-dynamic'

/**
 * Bangla speech-quality benchmark registry (docs/BANGLA_VOICE_MODEL_EVALUATION.md).
 *
 * This exists so the platform CANNOT claim voice quality it has not measured.
 * Rows are recorded only from real evaluations:
 *   - `mos`/naturalness/intelligibility must come from a named human reviewer.
 *   - `wer`/`cer` are COMPUTED here from reference vs hypothesis text; a client
 *     cannot post a pre-computed number, so a benchmark cannot be fabricated by
 *     a request body.
 *
 * GET  — ?engine= filter, plus per-engine aggregates (n, mean MOS, mean WER)
 * POST — record one evaluation row
 */
export async function GET(request: Request) {
  return withCompany(async (auth) => {
    const { searchParams } = new URL(request.url)
    const engine = searchParams.get('engine')
    const task = searchParams.get('task')
    const rows = await db.voiceBenchmark.findMany({
      where: {
        ...(engine ? { engine } : {}),
        ...(task === 'tts' || task === 'asr' ? { task } : {}),
        // Tenant's own rows plus global (companyId null) reference evaluations.
        OR: [{ companyId: auth.companyId }, { companyId: null }],
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })

    const byEngine = new Map<string, { task: string; samples: number; mosSum: number; mosCount: number; werSum: number; werCount: number; latencySum: number; latencyCount: number }>()
    for (const row of rows) {
      const key = `${row.engine}:${row.task}`
      const entry = byEngine.get(key) ?? { task: row.task, samples: 0, mosSum: 0, mosCount: 0, werSum: 0, werCount: 0, latencySum: 0, latencyCount: 0 }
      entry.samples++
      if (typeof row.mos === 'number') { entry.mosSum += row.mos; entry.mosCount++ }
      if (typeof row.wer === 'number') { entry.werSum += row.wer; entry.werCount++ }
      if (typeof row.latencyMs === 'number') { entry.latencySum += row.latencyMs; entry.latencyCount++ }
      byEngine.set(key, entry)
    }

    // ?gates=1 — apply the documented release gates to the rows that actually
    // exist in the database. Rows without a reference transcript carry no
    // error rate, so they cannot silently count as passing evidence.
    const gateReport = searchParams.get('gates') === '1' ? evaluateGates(
      rows.map((row) => ({
        engine: row.engine,
        engineVersion: row.engineVersion ?? undefined,
        language: row.language,
        task: (row.task === 'tts' ? 'tts' : 'asr') as EvalTask,
        sampleId: row.sampleId,
        audioProfile: (row.audioProfile as AudioProfile) ?? 'clean',
        referenceText: row.referenceText ?? '',
        hypothesisText: row.hypothesisText ?? '',
        wer: row.wer ?? 1,
        cer: row.cer ?? 1,
        latencyMs: row.latencyMs,
        reviewerName: row.reviewerName,
        mos: row.mos,
        naturalness: row.naturalness,
        intelligibility: row.intelligibility,
        notes: row.notes,
      })),
    ) : null

    return {
      data: rows,
      total: rows.length,
      ...(gateReport ? { gates: gateReport } : {}),
      aggregates: [...byEngine.entries()].map(([key, v]) => ({
        engine: key.split(':')[0],
        task: v.task,
        samples: v.samples,
        meanMos: v.mosCount > 0 ? Math.round((v.mosSum / v.mosCount) * 100) / 100 : null,
        meanWer: v.werCount > 0 ? Math.round((v.werSum / v.werCount) * 10000) / 10000 : null,
        meanLatencyMs: v.latencyCount > 0 ? Math.round(v.latencySum / v.latencyCount) : null,
        reviewedSamples: v.mosCount,
      })),
      note: 'meanWer is only reported where a reference transcript was supplied. A mean MOS without a named reviewer is not a quality claim.',
    }
  })
}

export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')

    const task = requireString(body, 'task')
    if (task !== 'tts' && task !== 'asr') throw new Error('Invalid request: task must be "tts" or "asr"')
    const engine = requireString(body, 'engine')
    const sampleId = requireString(body, 'sampleId')

    const referenceText = optionalString(body, 'referenceText')
    const hypothesisText = optionalString(body, 'hypothesisText')
    const reviewerName = optionalString(body, 'reviewerName')
    const mos = typeof body.mos === 'number' ? body.mos : undefined
    const naturalness = typeof body.naturalness === 'number' ? body.naturalness : undefined
    const intelligibility = typeof body.intelligibility === 'number' ? body.intelligibility : undefined

    // A subjective score REQUIRES a named reviewer, and must be on the 1–5 scale.
    for (const [field, value] of [['mos', mos], ['naturalness', naturalness], ['intelligibility', intelligibility]] as const) {
      if (value !== undefined) {
        if (!reviewerName) throw new Error(`Invalid request: ${field} requires reviewerName — an unattributed score is not evidence`)
        if (!Number.isFinite(value) || value < 1 || value > 5) throw new Error(`Invalid request: ${field} must be 1–5`)
      }
    }
    if (referenceText && !hypothesisText) {
      throw new Error('Invalid request: hypothesisText is required when referenceText is supplied')
    }
    const scored = Boolean(referenceText && hypothesisText)

    // A scored row goes through the shared harness, so the API and the CLI
    // compute WER/CER with EXACTLY the same code and neither accepts a
    // client-supplied error rate. Unscored rows are subjective-only evidence.
    const built = scored
      ? buildEvalRow({
          engine,
          engineVersion: optionalString(body, 'engineVersion'),
          language: optionalString(body, 'language') ?? 'bn-BD',
          task: task as EvalTask,
          sample: {
            sampleId,
            referenceText: referenceText!,
            hypothesisText: hypothesisText!,
            audioProfile: (optionalString(body, 'audioProfile') as AudioProfile | undefined) ?? 'clean',
            latencyMs: typeof body.latencyMs === 'number' ? body.latencyMs : undefined,
          },
          reviewer:
            reviewerName || mos !== undefined || naturalness !== undefined || intelligibility !== undefined
              ? { reviewerName: reviewerName ?? '', mos, naturalness, intelligibility, notes: optionalString(body, 'notes') }
              : undefined,
        })
      : null

    const row = await db.voiceBenchmark.create({
      data: {
        companyId: auth.companyId,
        engine,
        engineVersion: optionalString(body, 'engineVersion') ?? null,
        language: optionalString(body, 'language') ?? 'bn-BD',
        task,
        sampleId,
        reviewerName: built ? built.reviewerName : reviewerName ?? null,
        referenceText: referenceText ?? null,
        hypothesisText: hypothesisText ?? null,
        // Error rates ALWAYS computed, never accepted from the client.
        wer: built ? built.wer : null,
        cer: built ? built.cer : null,
        mos: built ? built.mos : mos ?? null,
        naturalness: built ? built.naturalness : naturalness ?? null,
        intelligibility: built ? built.intelligibility : intelligibility ?? null,
        latencyMs: typeof body.latencyMs === 'number' ? Math.max(0, Math.round(body.latencyMs)) : null,
        audioProfile: optionalString(body, 'audioProfile') ?? 'clean',
        notes: optionalString(body, 'notes') ?? null,
      },
    })
    return {
      data: row,
      notice: built
        ? `Recorded. Computed WER ${(built.wer * 100).toFixed(2)}% and CER ${(built.cer * 100).toFixed(2)}% from the supplied transcripts.`
        : 'Recorded a subjective evaluation. Error rates need a reference transcript to be computed.',
    }
  })
}
