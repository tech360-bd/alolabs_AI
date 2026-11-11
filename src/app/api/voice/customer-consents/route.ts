import { db } from '@/lib/db'
import { readJson, requireString, optionalString, withCompany } from '@/lib/voice/api-helpers'
import { normalizeBdPhoneNumber } from '@/lib/voice/customers'

export const dynamic = 'force-dynamic'

/**
 * Per-customer contact consent (master prompt §15/§19 — customer_consents).
 *
 * One row per (tenant, normalized number, channel, purpose). Revocation is
 * permanent: a revoked consent can be re-granted only as a NEW consent event;
 * the dialing path reads `granted && !revokedAt`.
 *
 * GET   — list consents (filter: phoneNumber)
 * POST  — record consent { phoneNumber, purpose?, method?, granted, contactId? }
 * PATCH — { consentId, action: 'revoke' } — always allowed; consent can never
 *         be forced by deleting a row.
 */
export async function GET(request: Request) {
  return withCompany(async (auth) => {
    const { searchParams } = new URL(request.url)
    const phone = searchParams.get('phoneNumber')
    const normalized = phone ? normalizeBdPhoneNumber(phone) : null
    const where = {
      companyId: auth.companyId,
      ...(normalized ? { phoneNumber: normalized.e164 } : {}),
    }
    const [total, data] = await Promise.all([
      db.customerConsent.count({ where: { companyId: auth.companyId } }),
      db.customerConsent.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 }),
    ])
    return { data, total }
  })
}

export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const phoneNumber = requireString(body, 'phoneNumber')
    const normalized = normalizeBdPhoneNumber(phoneNumber)
    if (!normalized) throw new Error('Invalid request: phoneNumber must be a valid BD number (+880…/01…)')
    const purpose = optionalString(body, 'purpose') ?? 'outbound_contact'
    const channel = optionalString(body, 'channel') ?? 'voice'
    const granted = body.granted !== false
    const existing = await db.customerConsent.findUnique({
      where: {
        companyId_phoneNumber_channel_purpose: {
          companyId: auth.companyId,
          phoneNumber: normalized.e164,
          channel,
          purpose,
        },
      },
    })
    // A revoked consent is never silently un-revoked; re-granting after a
    // revocation writes a fresh event (revokedAt cleared, grantedAt stamped).
    const data = {
      granted,
      method: optionalString(body, 'method') ?? 'verbal',
      contactId: optionalString(body, 'contactId') ?? existing?.contactId ?? null,
      grantedAt: granted ? new Date() : existing?.grantedAt ?? null,
      revokedAt: granted ? null : new Date(),
    }
    const consent = existing
      ? await db.customerConsent.update({ where: { id: existing.id }, data })
      : await db.customerConsent.create({
          data: { companyId: auth.companyId, phoneNumber: normalized.e164, channel, purpose, ...data },
        })
    return { data: consent }
  })
}

export async function PATCH(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const consentId = requireString(body, 'consentId')
    const action = requireString(body, 'action')
    if (action !== 'revoke') throw new Error('Invalid request: action must be "revoke"')
    const consent = await db.customerConsent.findFirst({
      where: { id: consentId, companyId: auth.companyId },
    })
    if (!consent) throw new Error(`consent ${consentId} not found for this tenant`)
    const updated = await db.customerConsent.update({
      where: { id: consent.id },
      data: { granted: false, revokedAt: new Date() },
    })
    // Revocation also lands on the suppression list — the customer never has
    // to opt out twice, and no campaign config can resurrect the number.
    await db.dncEntry.upsert({
      where: { companyId_phoneNumber: { companyId: auth.companyId, phoneNumber: consent.phoneNumber } },
      create: { companyId: auth.companyId, phoneNumber: consent.phoneNumber, reason: 'consent_revoked' },
      update: {},
    })
    return { data: updated, notice: 'Consent revoked and number added to the suppression list.' }
  })
}
