import { db } from '@/lib/db'
import { readJson, requireString, optionalString, withCompany } from '@/lib/voice/api-helpers'
import { resolveTelephonyAdapter } from '@/lib/voice/telephony/registry'

export const dynamic = 'force-dynamic'

/**
 * Phone number management (Module A).
 * GET  — list the tenant's numbers (never another tenant's).
 * POST — provision a number. Real PSTN provisioning requires an authorized
 *        carrier/SIP service; only the sandbox provider provisions in-app, and
 *        its numbers are stamped via provider='sandbox' + simulatedProvisioned
 *        so the UI labels them honestly.
 */
export async function GET() {
  return withCompany(async (auth) => {
    const numbers = await db.phoneNumber.findMany({
      where: { companyId: auth.companyId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return { data: numbers, total: numbers.length }
  })
}

export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const e164 = requireString(body, 'e164')
    const provider = optionalString(body, 'provider') ?? 'sandbox'
    const adapter = resolveTelephonyAdapter(provider)

    if (!adapter.info.capabilities.numberProvisioning) {
      throw new Error(
        `refused: provider "${adapter.info.id}" cannot provision numbers (${adapter.info.label}) — configure a real SIP/carrier service first`,
      )
    }
    if (!/^\+?\d{6,15}$/.test(e164)) {
      throw new Error('Invalid request: e164 must be 6–15 digits')
    }

    const simulated = adapter.info.simulated
    const number = await db.phoneNumber.create({
      data: {
        companyId: auth.companyId,
        e164,
        label: optionalString(body, 'label'),
        country: optionalString(body, 'country') ?? 'BD',
        numberType: optionalString(body, 'numberType') ?? 'local',
        provider,
        status: simulated ? 'active' : 'pending',
        monthlyCost: null, // real cost only when a real provider reports it
        timezone: optionalString(body, 'timezone') ?? 'Asia/Dhaka',
        recordingMode: optionalString(body, 'recordingMode') ?? 'disabled',
      },
    })
    return {
      data: number,
      simulatedProvisioned: simulated,
      notice: simulated
        ? 'This number exists in the sandbox only. It cannot receive or place real telephone calls. Real provisioning requires an authorized SIP/carrier connection (see docs/TELEPHONY_ARCHITECTURE.md).'
        : 'Provisioning request accepted — pending provider confirmation.',
    }
  })
}
