import { db } from '@/lib/db'
import { readJson, requireString, optionalString, withCompany, parseJsonColumn } from '@/lib/voice/api-helpers'
import { resolveTelephonyAdapter, isTelephonyProviderId } from '@/lib/voice/telephony/registry'

export const dynamic = 'force-dynamic'

/**
 * SIP trunk management (master prompt §08 — SIP Management module).
 *
 * Trunk credentials live in the external secret store (`credentialRef`); this
 * route stores connection metadata only. `test` action performs an honest
 * adapter health check (never a fabricated "online").
 *
 * GET   — list trunks for the tenant
 * POST  — register a trunk
 * PATCH — { trunkId, action: 'test' } → adapter health check; or update fields
 */
export async function GET() {
  return withCompany(async (auth) => {
    const trunks = await db.sipTrunkConfig.findMany({
      where: { companyId: auth.companyId },
      orderBy: { createdAt: 'desc' },
    })
    return {
      data: trunks.map((t) => ({
        ...t,
        metadata: parseJsonColumn(t.metadata, {}),
        credentialRef: t.credentialRef ? '(external secret reference)' : null,
      })),
      total: trunks.length,
    }
  })
}

export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const name = requireString(body, 'name')
    const host = requireString(body, 'host')
    const adapter = optionalString(body, 'adapter') ?? 'external_sip'
    if (!isTelephonyProviderId(adapter) || adapter === 'sandbox') {
      throw new Error('Invalid request: adapter must be one of asterisk, freeswitch, external_sip')
    }
    const trunk = await db.sipTrunkConfig.create({
      data: {
        companyId: auth.companyId,
        name,
        host,
        adapter,
        port: Number.isFinite(body.port) ? Number(body.port) : 5060,
        transport: optionalString(body, 'transport') ?? 'udp',
        credentialRef: optionalString(body, 'credentialRef') ?? null,
      },
    })
    return {
      data: trunk,
      notice: 'Trunk registered as unverified — run the test action to verify reachability. Credentials stay in the secret store.',
    }
  })
}

export async function PATCH(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const trunkId = requireString(body, 'trunkId')
    const trunk = await db.sipTrunkConfig.findFirst({
      where: { id: trunkId, companyId: auth.companyId },
    })
    if (!trunk) throw new Error(`trunk ${trunkId} not found for this tenant`)

    if (optionalString(body, 'action') === 'test') {
      // Honest health check through the adapter registry — a NotConnected
      // adapter reports reachable=false, never a fake success.
      const adapter = resolveTelephonyAdapter(trunk.adapter)
      const health = await adapter.health()
      const updated = await db.sipTrunkConfig.update({
        where: { id: trunk.id },
        data: {
          status: health.reachable ? 'online' : 'offline',
          lastVerifiedAt: new Date(),
          lastError: health.reachable ? null : (health.detail ?? 'unreachable'),
        },
      })
      return {
        data: { ...updated, health },
        notice: health.reachable
          ? 'Trunk adapter reports reachable.'
          : `Trunk is NOT connected: ${health.detail ?? 'unreachable'}`,
      }
    }

    const updated = await db.sipTrunkConfig.update({
      where: { id: trunk.id },
      data: {
        ...(optionalString(body, 'name') ? { name: optionalString(body, 'name') } : {}),
        ...(optionalString(body, 'host') ? { host: optionalString(body, 'host') } : {}),
        ...(optionalString(body, 'transport') ? { transport: optionalString(body, 'transport') } : {}),
        ...(optionalString(body, 'credentialRef') ? { credentialRef: optionalString(body, 'credentialRef') } : {}),
      },
    })
    return { data: updated }
  })
}
