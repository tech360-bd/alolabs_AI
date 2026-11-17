import { db } from '@/lib/db'
import { readJson, requireString, optionalString, withCompany, parseJsonColumn } from '@/lib/voice/api-helpers'
import { analyzeCall, intelligenceTrends, detectRepeatedTopics } from '@/lib/voice/intelligence'

export const dynamic = 'force-dynamic'

/**
 * AI Call Intelligence API (Module J).
 *
 * GET   — ?callSessionId=  insights for one call (evidence included)
 *           ?trends=       repeated intents/objections across the window
 *           ?repeat=       repeated topics computed on-the-fly from transcripts
 * POST  — { action: 'analyze', callSessionId } → derive + persist insights
 *
 * Every insight carries `confidence` and a `evidence` array of
 * { segmentIndex, quote }. Sentiment is labeled as an automated tone estimate in
 * every response — never as a fact about the person.
 */
export async function GET(request: Request) {
  return withCompany(async (auth) => {
    const { searchParams } = new URL(request.url)

    const callSessionId = searchParams.get('callSessionId')
    if (callSessionId) {
      const call = await db.callSession.findFirst({
        where: { id: callSessionId, companyId: auth.companyId },
        select: { id: true, disposition: true, status: true, transferred: true, language: true },
      })
      if (!call) throw new Error(`call ${callSessionId} not found for this tenant`)
      const [insights, transcript] = await Promise.all([
        db.callInsight.findMany({ where: { companyId: auth.companyId, callSessionId }, orderBy: { kind: 'asc' } }),
        db.callTranscript.findUnique({ where: { callSessionId }, select: { segments: true, confidence: true, provider: true } }),
      ])
      return {
        data: {
          call,
          insights: insights.map((i) => ({
            id: i.id,
            kind: i.kind,
            label: i.label,
            value: i.value,
            confidence: i.confidence,
            evidence: parseJsonColumn<unknown[]>(i.evidence, []),
            model: i.model,
          })),
          hasTranscript: Boolean(transcript),
          transcriptConfidence: transcript?.confidence ?? null,
          disclaimer: 'Sentiment and intent indicators are automated estimates derived from the transcript, with the quoted evidence shown. They are not measurements of a person’s emotional state.',
        },
      }
    }

    if (searchParams.get('repeat')) {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const transcripts = await db.callTranscript.findMany({
        where: { companyId: auth.companyId, createdAt: { gte: since }, status: 'ready' },
        select: { callSessionId: true, segments: true },
        take: 500,
      })
      const calls = transcripts.map((t) => ({
        callSessionId: t.callSessionId,
        segments: parseJsonColumn<Array<{ text: string; speaker?: string }>>(t.segments, []),
      })).filter((c) => c.segments.length > 0)
      return {
        data: {
          repeatedTopics: detectRepeatedTopics(calls, { minCalls: 2 }),
          callsAnalyzed: calls.length,
          windowDays: 30,
        },
      }
    }

    const days = Number(searchParams.get('days') ?? '30') || 30
    return {
      data: {
        trends: await intelligenceTrends(auth.companyId, { days }),
        periodDays: days,
        disclaimer: 'Counts are derived from persisted insights; each is traceable to the quoted evidence on its call.',
      },
    }
  })
}

export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const action = optionalString(body, 'action') ?? 'analyze'
    if (action !== 'analyze') throw new Error('Invalid request: action must be "analyze"')

    const callSessionId = requireString(body, 'callSessionId')

    // A transcript in the request body is IGNORED on purpose: insights must be
    // derived from the stored CallTranscript so a caller cannot post arbitrary
    // text and have it recorded as evidence about a real call. Saying so
    // explicitly beats silently analyzing something else.
    const ignoredTranscript =
      Array.isArray(body.transcript) && body.transcript.length > 0

    const result = await analyzeCall({ companyId: auth.companyId, callSessionId })
    const hasEvidence = result.insights.some((i) => i.evidence.length > 0)
    return {
      data: {
        insights: result.insights,
        sentiment: result.sentiment,
        quality: result.quality,
        analyzedSource: 'stored_transcript',
        ...(ignoredTranscript
          ? { ignoredRequestTranscript: 'A transcript was supplied in the request body and ignored. Insights are derived only from the stored transcript for this call.' }
          : {}),
      },
      notice: ignoredTranscript
        ? 'Request transcript ignored — analyzed the stored transcript instead, so evidence cannot be supplied by the caller.'
        : hasEvidence
          ? `${result.insights.length} insight(s) derived with quoted evidence.`
          : 'No transcript evidence available — only structural checks were recorded.',
    }
  })
}
