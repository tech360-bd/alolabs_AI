import { db } from '@/lib/db'
import { readJson, requireString, optionalString, withCompany, parseJsonColumn } from '@/lib/voice/api-helpers'
import { resolveTelephonyAdapter, isTelephonyProviderId } from '@/lib/voice/telephony/registry'

export const dynamic = 'force-dynamic'

/**
 * Telephony provider registry (master prompt §08 — configurable providers,
 * provider monitoring; §18 telephony_providers entity).
 *
 * A tenant registers one config row per adapter (sandbox, asterisk,
 * freeswitch, external_sip). Config rows hold NO credentials — connection
 * secrets live in the secret store; adapters resolve what they need.
 *
 * GET   — list provider configs with last health state
 * POST  — register { adapter, label, config? }
 * PATCH — { providerId, action: 'health' } → honest adapter health check
 */
export async function GET() {
  return withCompany(async (auth) => {
    const providers = await db.telephonyProviderConfig.findMany({
      where: { companyId: auth.companyId },
      orderBy: { createdAt: 'desc' },
    })
    return {
      data: providers.map((p) => ({
        ...p,
        config: parseJsonColumn(p.config, {}),
        capabilities: parseJsonColumn(p.capabilities, {}),
      })),
      total: providers.length,
    }
  })
}

export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const adapter = requireString(body, 'adapter')
    if (!isTelephonyProviderId(adapter)) {
      throw new Error('Invalid request: adapter must be one of sandbox, asterisk, freeswitch, external_sip')
    }
    const provider = await db.telephonyProviderConfig.upsert({
      where: { companyId_adapter: { companyId: auth.companyId, adapter } },
      create: {
        companyId: auth.companyId,
        adapter,
        label: optionalString(body, 'label') ?? adapter,
        config: JSON.stringify(typeof body.config === 'object' && body.config ? body.config : {}),
      },
      update: {
        label: optionalString(body, 'label') ?? adapter,
        ...(typeof body.config === 'object' && body.config ? { config: JSON.stringify(body.config) } : {}),
      },
    })
    return { data: provider }
  })
}

export async function PATCH(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const providerId = requireString(body, 'providerId')
    if (optionalString(body, 'action') !== 'health') {
      throw new Error('Invalid request: action must be "health"')
    }
    const provider = await db.telephonyProviderConfig.findFirst({
      where: { id: providerId, companyId: auth.companyId },
    })
    if (!provider) throw new Error(`provider ${providerId} not found for this tenant`)

    const adapter = resolveTelephonyAdapter(provider.adapter)
    const health = await adapter.health()
    const updated = await db.telephonyProviderConfig.update({
      where: { id: provider.id },
      data: {
        status: health.reachable ? 'online' : 'offline',
        lastCheckedAt: new Date(),
        lastError: health.reachable ? null : (health.detail ?? 'unreachable'),
        capabilities: JSON.stringify(adapter.info.capabilities),
      },
    })
    return {
      data: { ...updated, capabilities: adapter.info.capabilities, health },
      notice: health.reachable
        ? `Adapter ${provider.adapter} reports reachable.`
        : `Adapter ${provider.adapter} is NOT connected: ${health.detail ?? 'unreachable'}`,
    }
  })
}
