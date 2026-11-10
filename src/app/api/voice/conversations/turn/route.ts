import { readJson, requireString, optionalNumber, withCompany } from '@/lib/voice/api-helpers'
import { handleConversationTurn } from '@/lib/voice/conversation-service'

export const dynamic = 'force-dynamic'

/**
 * Conversation turn ingestion (master prompt §07/§09).
 *
 * The speech runtime (telephony adapter media bridge, or a test client) posts
 * one customer utterance per turn: ASR text + confidence. The service runs
 * the structural handoff rules, produces the agent reply through the LLM
 * responder (rule-based fallback), persists both turns, and executes the
 * handoff / ends the call when the orchestrator decides so.
 *
 * POST { callSessionId, utterance, asrConfidence?, asrFailureCount? }
 */
export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const callSessionId = requireString(body, 'callSessionId')
    const utterance = requireString(body, 'utterance')
    const result = await handleConversationTurn({
      companyId: auth.companyId,
      callSessionId,
      utterance,
      asrConfidence: optionalNumber(body, 'asrConfidence') ?? null,
      asrFailureCount: optionalNumber(body, 'asrFailureCount') ?? 0,
    })
    return { data: result }
  })
}
