import { db } from '@/lib/db'
import { readJson, requireString, withCompany, optionalString } from '@/lib/voice/api-helpers'
import { usageSummary } from '@/lib/voice/metering'

export const dynamic = 'force-dynamic'

/** Usage metering report (Module 5). Simulated usage is broken out separately. */
export async function GET() {
  return withCompany(async (auth) => {
    const summary = await usageSummary(auth.companyId)
    return {
      data: summary,
      notice: 'simulatedTotal is usage produced by the sandbox adapter / demo flows — exclude it from real billing.',
    }
  })
}

/** Record a manual usage adjustment (e.g. credits) with an audit note. */
export async function POST(request: Request) {
  return withCompany(async (auth) => {
    const body = await readJson(request)
    if (!body) throw new Error('Invalid request: JSON body required')
    const dimension = requireString(body, 'dimension')
    const quantity = typeof body.quantity === 'number' ? body.quantity : NaN
    if (!Number.isFinite(quantity)) throw new Error('Invalid request: numeric quantity required')
    const { meterUsage, isVoiceUsageDimension } = await import('@/lib/voice/metering')
    if (!isVoiceUsageDimension(dimension)) throw new Error(`Invalid request: unknown dimension "${dimension}"`)
    const id = await meterUsage({
      companyId: auth.companyId,
      dimension,
      quantity,
      unit: optionalString(body, 'unit') ?? 'unit',
      metadata: { manual: true, note: optionalString(body, 'note') ?? '', byUserId: auth.userId },
    })
    return { data: { id } }
  })
}
