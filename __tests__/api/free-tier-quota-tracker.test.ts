import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDefaultQuota, isProviderAvailable, recordProviderUsage, getQuotaStatus, getOrderedFreeProviders, _resetAllQuotasForTests } from '@/lib/ai-router/free-tier-quota-tracker';

// Mock Redis — always disconnected (use in-memory)
vi.mock('@/lib/redis', () => ({
  isRedisConnected: () => false,
  redisGet: vi.fn().mockResolvedValue(null),
  redisSet: vi.fn(),
  redisIncr: vi.fn(),
  redisExpire: vi.fn(),
  redisDel: vi.fn(),
}));

beforeEach(() => {
  _resetAllQuotasForTests();
});

describe('getDefaultQuota', () => {
  it('returns conservative defaults for known providers', () => {
    expect(getDefaultQuota('groq')).toEqual({ limit: 10_000, period: 'daily' });
    expect(getDefaultQuota('openrouter-free')).toEqual({ limit: 200, period: 'daily' });
    expect(getDefaultQuota('deepseek')).toEqual({ limit: 1_000, period: 'monthly' });
    expect(getDefaultQuota('mistral')).toEqual({ limit: 1_000, period: 'monthly' });
    expect(getDefaultQuota('qwen')).toEqual({ limit: 200, period: 'monthly' });
    expect(getDefaultQuota('github-models')).toEqual({ limit: 50, period: 'daily' });
  });

  it('returns unlimited (limit=0) for self-hosted Ollama', () => {
    expect(getDefaultQuota('ollama')).toEqual({ limit: 0, period: 'daily' });
  });

  it('falls back to a conservative default for unknown providers', () => {
    expect(getDefaultQuota('unknown-provider')).toEqual({ limit: 500, period: 'daily' });
  });
});

describe('isProviderAvailable', () => {
  it('returns true for unlimited providers (Ollama)', async () => {
    expect(await isProviderAvailable('ollama-1', 'ollama')).toBe(true);
  });

  it('returns true when no usage has been recorded', async () => {
    expect(await isProviderAvailable('groq-1', 'groq')).toBe(true);
  });

  it('returns false after the quota is exhausted', async () => {
    // Groq default: 10,000/day — record 10,000 uses
    for (let i = 0; i < 10_000; i++) {
      await recordProviderUsage('groq-test', 'groq');
    }
    expect(await isProviderAvailable('groq-test', 'groq')).toBe(false);
  });

  it('returns true for a different provider after one is exhausted', async () => {
    for (let i = 0; i < 200; i++) {
      await recordProviderUsage('or-1', 'openrouter-free');
    }
    expect(await isProviderAvailable('or-1', 'openrouter-free')).toBe(false);
    expect(await isProviderAvailable('or-2', 'openrouter-free')).toBe(true);
  });
});

describe('recordProviderUsage', () => {
  it('increments the counter per provider', async () => {
    await recordProviderUsage('p1', 'groq');
    await recordProviderUsage('p1', 'groq');
    await recordProviderUsage('p1', 'groq');
    const status = await getQuotaStatus('p1', 'groq');
    expect(status.used).toBe(3);
    expect(status.remaining).toBe(9_997);
    expect(status.exhausted).toBe(false);
  });

  it('does not count for unlimited providers (Ollama)', async () => {
    await recordProviderUsage('ollama-1', 'ollama');
    const status = await getQuotaStatus('ollama-1', 'ollama');
    expect(status.used).toBe(0); // unlimited — not tracked
    expect(status.remaining).toBe(Infinity);
    expect(status.exhausted).toBe(false);
  });
});

describe('getQuotaStatus', () => {
  it('reports the correct reset time based on the period', async () => {
    const dailyStatus = await getQuotaStatus('p1', 'groq');
    expect(dailyStatus.period).toBe('daily');
    expect(dailyStatus.resetsAt).toBeGreaterThan(Date.now());

    const monthlyStatus = await getQuotaStatus('p2', 'deepseek');
    expect(monthlyStatus.period).toBe('monthly');
    expect(monthlyStatus.resetsAt).toBeGreaterThan(Date.now());
  });

  it('marks exhausted when used >= limit', async () => {
    // github-models: limit=50/day
    for (let i = 0; i < 50; i++) {
      await recordProviderUsage('gh-1', 'github-models');
    }
    const status = await getQuotaStatus('gh-1', 'github-models');
    expect(status.exhausted).toBe(true);
    expect(status.remaining).toBe(0);
  });
});

describe('getOrderedFreeProviders', () => {
  it('sorts available providers first, by most remaining quota', async () => {
    // Use two providers with different quotas
    // groq: 10,000/day, github-models: 50/day
    await recordProviderUsage('groq-1', 'groq');
    await recordProviderUsage('gh-1', 'github-models');

    const ordered = await getOrderedFreeProviders([
      { id: 'gh-1', kind: 'github-models', isLocal: false },
      { id: 'groq-1', kind: 'groq', isLocal: false },
    ]);

    // groq-1 has 9,999 remaining; gh-1 has 49 remaining.
    // Both are available, but groq-1 should be first (more remaining).
    expect(ordered[0].id).toBe('groq-1');
    expect(ordered[0].available).toBe(true);
    expect(ordered[1].id).toBe('gh-1');
    expect(ordered[1].available).toBe(true);
  });

  it('places exhausted providers last (still listed, not removed)', async () => {
    for (let i = 0; i < 50; i++) {
      await recordProviderUsage('gh-exhausted', 'github-models');
    }

    const ordered = await getOrderedFreeProviders([
      { id: 'gh-exhausted', kind: 'github-models', isLocal: false },
      { id: 'groq-fresh', kind: 'groq', isLocal: false },
    ]);

    // groq-fresh is available → first; gh-exhausted is exhausted → last
    expect(ordered[0].id).toBe('groq-fresh');
    expect(ordered[0].available).toBe(true);
    expect(ordered[1].id).toBe('gh-exhausted');
    expect(ordered[1].available).toBe(false);
  });

  it('includes local (Ollama) providers as always available', async () => {
    const ordered = await getOrderedFreeProviders([
      { id: 'ollama-1', kind: 'ollama', isLocal: true },
    ]);
    expect(ordered[0].available).toBe(true);
    expect(ordered[0].remaining).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('Rotation behavior (if one does not work, the next one will)', () => {
  it('exhausting provider A does not remove it — it returns next period', async () => {
    // Exhaust provider A
    for (let i = 0; i < 50; i++) {
      await recordProviderUsage('provider-a', 'github-models');
    }
    expect(await isProviderAvailable('provider-a', 'github-models')).toBe(false);

    // Provider B is still available
    expect(await isProviderAvailable('provider-b', 'github-models')).toBe(true);

    // Provider A is NOT removed — it still appears in the ordered list
    const ordered = await getOrderedFreeProviders([
      { id: 'provider-a', kind: 'github-models', isLocal: false },
      { id: 'provider-b', kind: 'github-models', isLocal: false },
    ]);
    expect(ordered).toHaveLength(2);
    expect(ordered.find(p => p.id === 'provider-a')).toBeDefined();
    expect(ordered.find(p => p.id === 'provider-a')?.available).toBe(false);
  });

  it('multiple providers with different quotas all rotate independently', async () => {
    // Setup: groq (10k/day), openrouter-free (200/day), deepseek (1k/month)
    // Exhaust openrouter-free
    for (let i = 0; i < 200; i++) {
      await recordProviderUsage('or-free-1', 'openrouter-free');
    }

    // groq and deepseek are still available
    expect(await isProviderAvailable('groq-1', 'groq')).toBe(true);
    expect(await isProviderAvailable('ds-1', 'deepseek')).toBe(true);
    expect(await isProviderAvailable('or-free-1', 'openrouter-free')).toBe(false);

    // Ordered: groq (most remaining) → deepseek → openrouter-free (exhausted, last)
    const ordered = await getOrderedFreeProviders([
      { id: 'or-free-1', kind: 'openrouter-free', isLocal: false },
      { id: 'ds-1', kind: 'deepseek', isLocal: false },
      { id: 'groq-1', kind: 'groq', isLocal: false },
    ]);

    expect(ordered.map(p => p.id)).toEqual(['groq-1', 'ds-1', 'or-free-1']);
  });
});
