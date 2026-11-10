/**
 * Usage → Billing layer (master prompt §20: "billing_records", monthly
 * reporting, client-level usage).
 *
 * The metering engine (`metering.ts`) records every consumed unit in
 * `VoiceUsageEntry`. This module turns those REAL metered totals into
 * per-period billing records with a configurable price book:
 *
 * - Price book source (first non-empty wins):
 *     1. TenantConfig.config JSON → `voicePriceBook: { currency: "USD", prices: { dimension: unitPrice } }`
 *     2. DEFAULT_PRICE_BOOK (all dimensions at 0 = informational reporting, nothing billed)
 * - A unit price of 0 means the dimension is reported but NOT billed — the
 *   platform never invents prices the operator has not configured.
 * - Simulated usage is reported in its own column and NEVER billed.
 * - Records are idempotent per (tenant, period, dimension); issued records
 *   are frozen — regenerate refuses to mutate them.
 */

import { db } from '@/lib/db'
import { usageSummary, VOICE_USAGE_DIMENSIONS, type VoiceUsageDimension } from './metering'
import { isVoiceUsageDimension } from './metering'

export interface VoicePriceBook {
  currency: string
  prices: Partial<Record<VoiceUsageDimension, number>>
  source: 'default' | 'tenant'
}

/** Informational price book: every unit price 0 — nothing is billed until the operator configures prices. */
export const DEFAULT_PRICE_BOOK: VoicePriceBook = {
  currency: 'USD',
  prices: Object.fromEntries(VOICE_USAGE_DIMENSIONS.map((d) => [d, 0])) as VoicePriceBook['prices'],
  source: 'default',
}

/** Pure: parse the tenant price book from a tenant JSON config string. */
export function parsePriceBook(companyMetadata: string | null | undefined): VoicePriceBook {
  if (!companyMetadata) return { ...DEFAULT_PRICE_BOOK, prices: { ...DEFAULT_PRICE_BOOK.prices } }
  try {
    const meta = JSON.parse(companyMetadata) as {
      voicePriceBook?: { currency?: string; prices?: Record<string, unknown> }
    }
    const raw = meta.voicePriceBook
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_PRICE_BOOK, prices: { ...DEFAULT_PRICE_BOOK.prices } }
    const prices: VoicePriceBook['prices'] = {}
    for (const [dim, value] of Object.entries(raw.prices ?? {})) {
      if (isVoiceUsageDimension(dim) && typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        prices[dim] = value
      }
    }
    return {
      currency: typeof raw.currency === 'string' && raw.currency.trim() ? raw.currency.trim().toUpperCase().slice(0, 8) : 'USD',
      prices,
      source: 'tenant',
    }
  } catch {
    return { ...DEFAULT_PRICE_BOOK, prices: { ...DEFAULT_PRICE_BOOK.prices } }
  }
}

export interface UsageTotalsRow {
  dimension: string
  total: number
  simulatedTotal: number
  unit: string
}

export interface BillingLine {
  dimension: string
  unit: string
  quantity: number
  simulatedQuantity: number
  billableQuantity: number
  unitPrice: number
  amount: number
  currency: string
  priceBookSource: 'default' | 'tenant'
}

/** Pure: turn metered totals into billing lines (simulated usage never billed). */
export function computeBillingLines(usage: UsageTotalsRow[], priceBook: VoicePriceBook): BillingLine[] {
  return usage.map((row) => {
    const unitPrice = isVoiceUsageDimension(row.dimension) ? priceBook.prices[row.dimension] ?? 0 : 0
    const billableQuantity = Math.max(0, row.total - row.simulatedTotal)
    return {
      dimension: row.dimension,
      unit: row.unit,
      quantity: row.total,
      simulatedQuantity: row.simulatedTotal,
      billableQuantity,
      unitPrice,
      amount: roundMoney(billableQuantity * unitPrice),
      currency: priceBook.currency,
      priceBookSource: priceBook.source,
    }
  })
}

/** "2026-11" for a date in UTC. */
export function periodKeyFor(at: Date = new Date()): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`
}

export function periodBounds(periodKey: string): { start: Date; end: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(periodKey)
  if (!m) throw new Error(`invalid periodKey "${periodKey}" — expected "YYYY-MM"`)
  const year = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12) throw new Error(`invalid periodKey "${periodKey}" — month out of range`)
  const start = new Date(Date.UTC(year, month - 1, 1))
  const end = new Date(Date.UTC(year, month, 1))
  return { start, end }
}

function roundMoney(v: number): number {
  return Math.round(v * 10_000) / 10_000
}

export interface GenerateBillingResult {
  periodKey: string
  priceBookSource: 'default' | 'tenant'
  currency: string
  lines: BillingLine[]
  recordsWritten: number
  recordsSkippedIssued: number
  totalAmount: number
}

/**
 * Aggregate a tenant's metered usage for a period into VoiceBillingRecord
 * rows (draft status). Idempotent: re-running updates draft rows and skips
 * already-issued dimensions so an issued invoice is never silently mutated.
 */
export async function generateMonthlyBilling(params: {
  companyId: string
  periodKey?: string
  priceBook?: VoicePriceBook
  at?: Date
}): Promise<GenerateBillingResult> {
  const at = params.at ?? new Date()
  const periodKey = params.periodKey ?? periodKeyFor(at)
  const { start, end } = periodBounds(periodKey)

  const priceBook = params.priceBook ?? (await loadPriceBook(params.companyId))
  const rows = await db.voiceUsageEntry.groupBy({
    by: ['dimension', 'unit'],
    where: { companyId: params.companyId, recordedAt: { gte: start, lt: end } },
    _sum: { quantity: true },
  })
  const simRows = await db.voiceUsageEntry.groupBy({
    by: ['dimension'],
    where: { companyId: params.companyId, simulated: true, recordedAt: { gte: start, lt: end } },
    _sum: { quantity: true },
  })
  const simByDim = new Map(simRows.map((r) => [r.dimension, r._sum.quantity ?? 0]))

  const lines = computeBillingLines(
    rows.map((r) => ({
      dimension: r.dimension,
      unit: r.unit,
      total: r._sum.quantity ?? 0,
      simulatedTotal: simByDim.get(r.dimension) ?? 0,
    })),
    priceBook,
  )

  let recordsWritten = 0
  let recordsSkippedIssued = 0
  for (const line of lines) {
    const existing = await db.voiceBillingRecord.findUnique({
      where: { companyId_periodKey_dimension: { companyId: params.companyId, periodKey, dimension: line.dimension } },
      select: { status: true },
    })
    if (existing?.status === 'issued') {
      recordsSkippedIssued += 1
      continue
    }
    await db.voiceBillingRecord.upsert({
      where: { companyId_periodKey_dimension: { companyId: params.companyId, periodKey, dimension: line.dimension } },
      create: {
        companyId: params.companyId,
        periodKey,
        dimension: line.dimension,
        unit: line.unit,
        quantity: line.quantity,
        simulatedQuantity: line.simulatedQuantity,
        unitPrice: line.unitPrice,
        amount: line.amount,
        currency: line.currency,
        priceBookSource: line.priceBookSource,
        status: 'draft',
      },
      update: {
        unit: line.unit,
        quantity: line.quantity,
        simulatedQuantity: line.simulatedQuantity,
        unitPrice: line.unitPrice,
        amount: line.amount,
        currency: line.currency,
        priceBookSource: line.priceBookSource,
      },
    })
    recordsWritten += 1
  }

  return {
    periodKey,
    priceBookSource: priceBook.source,
    currency: priceBook.currency,
    lines,
    recordsWritten,
    recordsSkippedIssued,
    totalAmount: roundMoney(lines.reduce((sum, l) => sum + l.amount, 0)),
  }
}

/** Freeze the draft billing rows of a period (issued rows are immutable). */
export async function issueMonthlyBilling(params: { companyId: string; periodKey: string }): Promise<{ issued: number }> {
  const result = await db.voiceBillingRecord.updateMany({
    where: { companyId: params.companyId, periodKey: params.periodKey, status: 'draft' },
    data: { status: 'issued', issuedAt: new Date() },
  })
  return { issued: result.count }
}

async function loadPriceBook(companyId: string): Promise<VoicePriceBook> {
  const { tenantVoiceConfigJson } = await import('./quotas')
  return parsePriceBook(await tenantVoiceConfigJson(companyId))
}

/** Small helper re-exported so callers do not import metering internals. */
export { usageSummary }
