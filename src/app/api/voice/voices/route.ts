import { db } from '@/lib/db'
import { readJson, requireString, optionalString, withCompany } from '@/lib/voice/api-helpers'
import { voiceCloneAllowed } from '@/lib/voice/consent'

export const dynamic = 'force-dynamic'

/**
 * Voice library (Module C): TTS voices available to the tenant, including
 * authorized clones. Creating a clone REQUIRES a verified, unrevoked consent
 * record — the gate lives in consent.ts and cannot be bypassed from the API.
 */
export async function GET() {
  return withCompany(async (auth) => {
    const voices = await db.voiceLibraryItem.findMany({
      where: { companyId: auth.companyId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return { data: voices, total: voices.length }
  })
}

export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const name = requireString(body, 'name')
    const providerVoiceId = requireString(body, 'providerVoiceId')
    const isClone = body.isClone === true

    let consentRecordId: string | null | undefined
    if (isClone) {
      const consentId = requireString(body, 'consentRecordId')
      const consent = await db.voiceConsent.findFirst({
        where: { id: consentId, companyId: auth.companyId },
      })
      const check = voiceCloneAllowed(consent)
      if (!check.allowed) {
        throw new Error(`refused: voice clone consent invalid — ${check.reason}`)
      }
      consentRecordId = consent!.id
    }

    const voice = await db.voiceLibraryItem.create({
      data: {
        companyId: auth.companyId,
        name,
        language: optionalString(body, 'language') ?? 'bn-BD',
        gender: optionalString(body, 'gender') ?? 'female',
        style: optionalString(body, 'style'),
        provider: optionalString(body, 'provider') ?? 'local',
        providerVoiceId,
        isClone,
        consentRecordId: consentRecordId ?? null,
        status: 'active',
      },
    })
    return { data: voice }
  })
}

export async function PATCH(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const id = requireString(body, 'id')
    const data: Record<string, string> = {}
    for (const field of ['name', 'style', 'status'] as const) {
      const v = optionalString(body, field)
      if (v !== undefined) data[field] = v
    }
    const result = await db.voiceLibraryItem.updateMany({ where: { id, companyId: auth.companyId }, data })
    if (result.count === 0) throw new Error(`voice ${id} not found for this tenant`)
    return { data: { ok: true } }
  })
}
