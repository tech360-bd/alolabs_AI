import { describe, expect, it } from 'vitest'
import { hasExplicitZeroPricing } from '@/lib/ai-router/free-models'

describe('hasExplicitZeroPricing', () => {
  it('accepts explicit zero input and output prices from upstream catalogs', () => {
    expect(hasExplicitZeroPricing({ pricing: { prompt: '0', completion: '0' } })).toBe(true)
    expect(hasExplicitZeroPricing({ pricing: { input: 0, output: 0 } })).toBe(true)
    expect(hasExplicitZeroPricing({ costPerMillionTokens: 0 })).toBe(false)
    expect(hasExplicitZeroPricing({ cost_per_million_tokens: 0 })).toBe(false)
    expect(hasExplicitZeroPricing({ input_cost_per_million_tokens: 0, output_cost_per_million_tokens: 0 })).toBe(true)
  })

  it('fails closed for missing, partial, malformed, or non-zero pricing', () => {
    expect(hasExplicitZeroPricing({ id: 'free-tier-but-unpriced' })).toBe(false)
    expect(hasExplicitZeroPricing({ pricing: { prompt: '0', completion: '0.000001' } })).toBe(false)
    expect(hasExplicitZeroPricing({ pricing: { prompt: '0' } })).toBe(false)
    expect(hasExplicitZeroPricing({ pricing: { input: 'free', output: 0 } })).toBe(false)
    expect(hasExplicitZeroPricing(null)).toBe(false)
  })
})
