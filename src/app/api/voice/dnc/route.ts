import { db } from '@/lib/db'
import { readJson, requireString, optionalString, withCompany } from '@/lib/voice/api-helpers'
import { normalizePhoneNumber } from '@/lib/voice/consent'

export const dynamic = 'force-dynamic'

/** Do-Not-Call registry (Module F compliance). Opt-outs are honored structurally. */
export async function GET() {
  return withCompany(async (auth) => {
    const entries = await db.dncEntry.findMany({
      where: { companyId: auth.companyId },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    return { data: entries, total: entries.length }
  })
}

export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const raw = requireString(body, 'phoneNumber')
    const phoneNumber = normalizePhoneNumber(raw)
    if (!/^\+?\d{6,15}$/.test(phoneNumber)) throw new Error('Invalid request: phoneNumber must be 6–15 digits')
    const entry = await db.dncEntry.upsert({
      where: { companyId_phoneNumber: { companyId: auth.companyId, phoneNumber } },
      create: {
        companyId: auth.companyId,
        phoneNumber,
        reason: optionalString(body, 'reason') ?? 'customer_request',
        addedById: auth.userId,
      },
      update: { reason: optionalString(body, 'reason') ?? 'customer_request', addedById: auth.userId },
    })
    return { data: entry }
  })
}

export async function DELETE(request: Request) {
  return withCompany(async (auth) => {
    const { searchParams } = new URL(request.url)
    const raw = searchParams.get('phoneNumber')
    if (!raw) throw new Error('Invalid request: phoneNumber query param required')
    const phoneNumber = normalizePhoneNumber(raw)
    const result = await db.dncEntry.deleteMany({
      where: { companyId: auth.companyId, phoneNumber, reason: { not: 'customer_request' } },
    })
    if (result.count === 0) {
      throw new Error(
        'refused: this entry is a customer-request opt-out. Removing an explicit opt-out requires deleting the DncEntry row by an administrator directly — the API never does it implicitly.',
      )
    }
    return { data: { ok: true, removed: result.count } }
  })
}
