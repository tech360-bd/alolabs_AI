import { db } from '@/lib/db'
import { readJson, requireString, optionalString, withCompany } from '@/lib/voice/api-helpers'
import { voiceCloneAllowed } from '@/lib/voice/consent'

export const dynamic = 'force-dynamic'

/**
 * Voice-clone consent records (Module C compliance).
 * A clone may only be used while its consent is verified and not revoked.
 * Revocation is immediate and auditable.
 */
export async function GET() {
  return withCompany(async (auth) => {
    const consents = await db.voiceConsent.findMany({
      where: { companyId: auth.companyId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return {
      data: consents.map((c) => ({ ...c, gate: voiceCloneAllowed(c) })),
      total: consents.length,
    }
  })
}

export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const consent = await db.voiceConsent.create({
      data: {
        companyId: auth.companyId,
        ownerName: requireString(body, 'ownerName'),
        ownerContact: requireString(body, 'ownerContact'),
        consentStatement: requireString(body, 'consentStatement'),
        verificationMethod: optionalString(body, 'verificationMethod') ?? 'written',
        evidenceRef: optionalString(body, 'evidenceRef'),
        // New records always start pending — verification is a human act.
        status: 'pending',
      },
    })
    return {
      data: consent,
      notice: 'Consent is pending until a human verifier confirms it. Cloning stays blocked until then.',
    }
  })
}

/** Verify or revoke a consent record. */
export async function PATCH(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const id = requireString(body, 'id')
    const action = requireString(body, 'action')
    if (action === 'verify') {
      const result = await db.voiceConsent.updateMany({
        where: { id, companyId: auth.companyId, status: 'pending' },
        data: { status: 'verified', verifiedBy: auth.userId, verifiedAt: new Date() },
      })
      if (result.count === 0) throw new Error(`consent ${id} not found or not in pending state`)
      return { data: { ok: true, status: 'verified' } }
    }
    if (action === 'revoke') {
      const result = await db.voiceConsent.updateMany({
        where: { id, companyId: auth.companyId },
        data: { status: 'revoked', revokedAt: new Date() },
      })
      if (result.count === 0) throw new Error(`consent ${id} not found`)
      // Immediate enforcement: disable any clone voices referencing this consent.
      await db.voiceLibraryItem.updateMany({
        where: { companyId: auth.companyId, consentRecordId: id },
        data: { status: 'disabled' },
      })
      return { data: { ok: true, status: 'revoked', clonesDisabled: true } }
    }
    if (action === 'reject') {
      const result = await db.voiceConsent.updateMany({
        where: { id, companyId: auth.companyId, status: 'pending' },
        data: { status: 'rejected' },
      })
      if (result.count === 0) throw new Error(`consent ${id} not found or not in pending state`)
      return { data: { ok: true, status: 'rejected' } }
    }
    throw new Error('Invalid request: action must be verify, revoke or reject')
  })
}
