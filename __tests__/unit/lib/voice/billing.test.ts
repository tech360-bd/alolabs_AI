import { describe, it, expect } from 'vitest'
import {
  parsePriceBook,
  computeBillingLines,
  periodKeyFor,
  periodBounds,
  DEFAULT_PRICE_BOOK,
} from '@/lib/voice/billing'

describe('parsePriceBook', () => {
  it('returns the informational default book when nothing is configured', () => {
    const book = parsePriceBook(null)
    expect(book.source).toBe('default')
    expect(book.currency).toBe('USD')
    expect(Object.values(book.prices).every((p) => p === 0)).toBe(true)
  })

  it('reads a tenant price book from the tenant config JSON', () => {
    const book = parsePriceBook(JSON.stringify({
      voicePriceBook: { currency: 'bdt', prices: { ai_call_minutes: 2.5, pstn_minutes: 1 } },
    }))
    expect(book.source).toBe('tenant')
    expect(book.currency).toBe('BDT')
    expect(book.prices.ai_call_minutes).toBe(2.5)
  })

  it('ignores unknown dimensions and invalid prices', () => {
    const book = parsePriceBook(JSON.stringify({
      voicePriceBook: { prices: { not_a_dimension: 9, ai_call_minutes: -3, tts_characters: 'x' } },
    }))
    expect(book.prices.not_a_dimension).toBeUndefined()
    expect(book.prices.ai_call_minutes).toBeUndefined()
  })

  it('falls back to the default book on invalid JSON', () => {
    expect(parsePriceBook('not-json').source).toBe('default')
  })
})

describe('computeBillingLines', () => {
  it('bills quantity × unit price and excludes simulated usage', () => {
    const lines = computeBillingLines(
      [{ dimension: 'ai_call_minutes', unit: 'minute', total: 100, simulatedTotal: 20 }],
      { currency: 'BDT', prices: { ai_call_minutes: 2 }, source: 'tenant' },
    )
    expect(lines[0].billableQuantity).toBe(80)
    expect(lines[0].amount).toBe(160)
    expect(lines[0].simulatedQuantity).toBe(20)
  })

  it('prices unknown dimensions at 0 (never invents a price)', () => {
    const lines = computeBillingLines(
      [{ dimension: 'mystery_dimension', unit: 'unit', total: 50, simulatedTotal: 0 }],
      DEFAULT_PRICE_BOOK,
    )
    expect(lines[0].unitPrice).toBe(0)
    expect(lines[0].amount).toBe(0)
  })

  it('rounds money to 4 decimals', () => {
    const lines = computeBillingLines(
      [{ dimension: 'ai_call_minutes', unit: 'minute', total: 1, simulatedTotal: 0 }],
      { currency: 'USD', prices: { ai_call_minutes: 0.333333 }, source: 'tenant' },
    )
    expect(lines[0].amount).toBe(0.3333)
  })
})

describe('period helpers', () => {
  it('formats the period key in UTC', () => {
    expect(periodKeyFor(new Date('2026-11-11T23:30:00Z'))).toBe('2026-11')
    expect(periodKeyFor(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01')
  })

  it('parses period bounds and rejects garbage', () => {
    const { start, end } = periodBounds('2026-11')
    expect(start.toISOString()).toBe('2026-11-01T00:00:00.000Z')
    expect(end.toISOString()).toBe('2026-12-01T00:00:00.000Z')
    expect(() => periodBounds('2026-13')).toThrow()
    expect(() => periodBounds('november')).toThrow()
  })
})
