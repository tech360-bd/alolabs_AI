import { NextResponse } from 'next/server'
import { v1Handler, V1Error } from '@/lib/v1'
import { db } from '@/lib/db'
import {
  generateMonthlyBilling,
  issueMonthlyBilling,
  parsePriceBook,
  periodBounds,
  periodKeyFor,
} from '@/lib/voice/billing'
import { tenantVoiceConfigJson } from '@/lib/voice/quotas'

/**
 * /api/v1/voice/billing — usage → billing records (master prompt §20).
 * GET  : billing records for a period (voice:read)
 * POST : { action: "generate" | "issue", periodKey? } (voice:write)
 *        generate = aggregate metered usage into draft VoiceBillingRecord rows
 *        issue    = freeze the draft rows for the period (immutable afterwards)
 */
export const dynamic = 'force-dynamic'

function resolvePeriodKey(request: Request): string {
  const url = new URL(request.url)
  const raw = url.searchParams.get('periodKey')
  if (!raw) return periodKeyFor()
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) {
    throw new V1Error('periodKey must be "YYYY-MM"', 400, 'BAD_REQUEST')
  }
  return raw
}

export const GET = v1Handler(async ({ identity }, request) => {
  const periodKey = resolvePeriodKey(request)
  const { start, end } = periodBounds(periodKey)
  const [records, configJson] = await Promise.all([
    db.voiceBillingRecord.findMany({
      where: { companyId: identity.companyId, periodKey },
      orderBy: { dimension: 'asc' },
    }),
    tenantVoiceConfigJson(identity.companyId),
  ])
  const priceBook = parsePriceBook(configJson)
  const totals = records.reduce(
    (acc, r) => {
      acc.billedAmount += r.amount
      acc.simulatedQuantity += r.simulatedQuantity
      return acc
    },
    { billedAmount: 0, simulatedQuantity: 0 },
  )
  return NextResponse.json({
    periodKey,
    period: { start: start.toISOString(), end: end.toISOString() },
    currency: records[0]?.currency ?? priceBook.currency,
    priceBookSource: priceBook.source,
    records,
    totals: { ...totals, billedAmount: Math.round(totals.billedAmount * 10_000) / 10_000 },
    notice:
      priceBook.source === 'default'
        ? 'Using the default informational price book (all unit prices 0). Configure Company.metadata.voicePriceBook to bill real amounts.'
        : undefined,
  })
})

export const POST = v1Handler(async ({ identity }, request) => {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    throw new V1Error('Invalid JSON body', 400, 'BAD_REQUEST')
  }
  const action = body.action
  const periodKey =
    typeof body.periodKey === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(body.periodKey)
      ? body.periodKey
      : periodKeyFor()

  if (action === 'generate') {
    const result = await generateMonthlyBilling({ companyId: identity.companyId, periodKey })
    return NextResponse.json({ action, ...result })
  }
  if (action === 'issue') {
    // Issuing requires a fresh generation so frozen rows reflect the real usage.
    const generated = await generateMonthlyBilling({ companyId: identity.companyId, periodKey })
    const issued = await issueMonthlyBilling({ companyId: identity.companyId, periodKey })
    return NextResponse.json({ action, periodKey, generated, issued })
  }
  throw new V1Error('action must be "generate" or "issue"', 400, 'BAD_REQUEST')
})
