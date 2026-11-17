import { db } from '@/lib/db'
import { readJson, requireString, optionalString, withCompany } from '@/lib/voice/api-helpers'
import { recordVoicemail, markVoicemail } from '@/lib/voice/telephony-config'
import { normalizeBdPhoneNumber } from '@/lib/voice/customers'

export const dynamic = 'force-dynamic'

/**
 * Voicemail box (Module A — voicemail, missed-call recovery).
 *
 * GET    — list messages (filter status); media is only present when a real
 *          adapter delivered audio
 * POST   — record a message { fromNumber, callSessionId?, durationSeconds?,
 *          storageKey?, transcript? } — used by the telephony webhook/worker
 * PATCH  — { voicemailId, status: unread|read|archived, assignedUserId? }
 *
 * A sandbox/missed call produces a row with NO storageKey; the UI shows
 * "no audio recorded" instead of an unplayable player.
 */
export async function GET(request: Request) {
  return withCompany(async (auth) => {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const where = {
      companyId: auth.companyId,
      ...(status ? { status } : {}),
    }
    const [total, data] = await Promise.all([
      db.voicemail.count({ where: { companyId: auth.companyId } }),
      db.voicemail.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 }),
    ])
    return {
      data: data.map((v) => ({
        ...v,
        hasMedia: Boolean(v.storageKey),
        fromNumberNormalized: normalizeBdPhoneNumber(v.fromNumber)?.e164 ?? v.fromNumber,
      })),
      total,
    }
  })
}

export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const fromNumber = requireString(body, 'fromNumber')

    // A callSessionId must belong to this tenant or the link is dropped.
    const callSessionId = optionalString(body, 'callSessionId')
    let contactId: string | null = null
    let simulated = false
    if (callSessionId) {
      const call = await db.callSession.findFirst({
        where: { id: callSessionId, companyId: auth.companyId },
        select: { id: true, contactId: true, simulated: true },
      })
      if (!call) throw new Error(`call ${callSessionId} not found for this tenant`)
      contactId = call.contactId
      simulated = call.simulated
    }

    const created = await recordVoicemail({
      companyId: auth.companyId,
      fromNumber,
      phoneNumberId: optionalString(body, 'phoneNumberId'),
      callSessionId,
      contactId,
      durationSeconds: typeof body.durationSeconds === 'number' ? body.durationSeconds : 0,
      storageKey: optionalString(body, 'storageKey') ?? null,
      transcript: optionalString(body, 'transcript') ?? null,
      simulated,
    })
    return {
      data: created,
      notice: created.hasMedia
        ? 'Voicemail stored with audio.'
        : 'Voicemail recorded without audio — no adapter delivered media for this leg.',
    }
  })
}

export async function PATCH(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    await markVoicemail(
      auth.companyId,
      requireString(body, 'voicemailId'),
      requireString(body, 'status'),
      optionalString(body, 'assignedUserId'),
    )
    return { data: { ok: true } }
  })
}
