import { readJson, requireString, optionalString, withCompany } from '@/lib/voice/api-helpers'
import { liveFloor, submitReview, qaSummary, agentPerformance, REVIEW_CRITERIA } from '@/lib/voice/supervision'

export const dynamic = 'force-dynamic'

/**
 * Supervisor & QA API (Module G).
 *
 * GET   — ?view=floor        live presence, active calls and queue depth
 *           ?view=qa&days=   submitted review summary (criteria averages)
 *           ?view=performance&days=&userId=  real per-agent call metrics
 *           ?view=criteria   the review scorecard definition
 * POST  — { callSessionId, criteria: {greeting:5,…}, notes?, submit? }
 *
 * Live monitoring here is METADATA ONLY. Listening to an in-progress call is a
 * separate consent-gated capability; this route never exposes live audio or
 * transcript.
 */
export async function GET(request: Request) {
  return withCompany(async (auth) => {
    const { searchParams } = new URL(request.url)
    const view = searchParams.get('view') ?? 'floor'
    const days = Number(searchParams.get('days') ?? '30') || 30

    if (view === 'qa') return { data: await qaSummary(auth.companyId, { days }) }
    if (view === 'performance') {
      return {
        data: {
          agents: await agentPerformance(auth.companyId, { days, userId: searchParams.get('userId') ?? undefined }),
          periodDays: days,
        },
      }
    }
    if (view === 'criteria') return { data: { criteria: REVIEW_CRITERIA } }

    return {
      data: await liveFloor(auth.companyId),
      privacy: 'Live view shows call metadata only (who, state, duration). Audio and transcript of an in-progress call are not exposed.',
    }
  })
}

export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const callSessionId = requireString(body, 'callSessionId')
    if (typeof body.criteria !== 'object' || body.criteria === null) {
      throw new Error('Invalid request: criteria object is required (e.g. { "greeting": 5 })')
    }
    const raw = body.criteria as Record<string, unknown>
    const criteria: Record<string, number> = {}
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === 'number') criteria[key] = value
    }
    const review = await submitReview({
      companyId: auth.companyId,
      callSessionId,
      reviewerUserId: auth.userId,
      criteria,
      notes: optionalString(body, 'notes'),
      submit: body.submit !== false,
    })
    return {
      data: review,
      notice: review.status === 'submitted'
        ? `Review submitted with an overall score of ${review.score}/5.`
        : 'Review saved as a draft.',
    }
  })
}
