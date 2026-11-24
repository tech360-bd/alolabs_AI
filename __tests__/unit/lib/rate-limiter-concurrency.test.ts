import { describe, it, expect } from 'vitest'
import { checkRateLimit } from '@/lib/rate-limiter'

/**
 * Concurrency contract for the rate limiter.
 *
 * The previous implementation counted rows and then inserted one in two
 * separate statements, so `limit` concurrent callers all read the same count
 * and all passed. These tests fire requests concurrently and assert the limit
 * actually holds — the property a sequential test cannot detect.
 *
 * Each test uses its own bucket key: the limiter is process-global, so sharing
 * a key across cases would leak state between them.
 */

describe('checkRateLimit holds under concurrency', () => {
  it('allows exactly `limit` of 50 concurrent requests', async () => {
    const LIMIT = 10
    const results = await Promise.all(
      Array.from({ length: 50 }, () => checkRateLimit('t:burst', LIMIT, 60_000)),
    )
    expect(results.filter((r) => r.allowed).length).toBe(LIMIT)
  })

  it('grants a distinct descending slot per request', async () => {
    const LIMIT = 5
    const results = await Promise.all(
      Array.from({ length: LIMIT }, () => checkRateLimit('t:slots', LIMIT, 60_000)),
    )
    const remaining = results.filter((r) => r.allowed).map((r) => r.remaining)
    expect(remaining.sort((a, b) => b - a)).toEqual([4, 3, 2, 1, 0])
  })

  it('keeps separate keys independent', async () => {
    const [a, b] = await Promise.all([
      checkRateLimit('t:indep:a', 1, 60_000),
      checkRateLimit('t:indep:b', 1, 60_000),
    ])
    expect(a.allowed).toBe(true)
    expect(b.allowed).toBe(true)
  })

  it('denies once the window is exhausted', async () => {
    await checkRateLimit('t:exhaust', 1, 60_000)
    const second = await checkRateLimit('t:exhaust', 1, 60_000)
    expect(second.allowed).toBe(false)
    expect(second.remaining).toBe(0)
  })

  it('returns a future resetAt', async () => {
    const r = await checkRateLimit('t:reset', 1, 60_000)
    expect(r.resetAt.getTime()).toBeGreaterThan(Date.now())
  })
})
