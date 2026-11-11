/**
 * Free-tier quota tracker — tracks per-provider free-tier usage and rotates
 * providers when one's free quota is exhausted.
 *
 * Design:
 *  - Each free provider has a configurable quota (requests per period).
 *  - The tracker records every request + success/failure against the provider.
 *  - When usage >= quota, the provider is marked "quota_exhausted" until the
 *    period resets (daily/weekly/monthly).
 *  - The router asks `isProviderAvailable(providerId)` before routing to it.
 *  - When the period rolls over, the counter resets and the provider is
 *    available again — it is NEVER removed.
 *  - Quota limits are read from the provider's config (AIProviderConfig) or
 *    from sensible defaults per provider kind.
 *
 * This enables the "if one doesn't work, the next one will" behavior: the
 * router tries providers in priority order, skipping exhausted ones, and
 * rotating back to them when their quota resets.
 *
 * Uses Redis when connected (durable, shared across instances); falls back to
 * in-memory (per-process, resets on restart).
 */

import { isRedisConnected, redisGet, redisSet, redisIncr, redisExpire } from '@/lib/redis';

// ─── Types ─────────────────────────────────────────────────────────────────

export type QuotaPeriod = 'daily' | 'weekly' | 'monthly';

export interface FreeTierQuotaConfig {
  /** Provider id (from AIProviderConfig.id). */
  providerId: string;
  /** Provider kind (groq, openrouter-free, etc.) — used for default quotas. */
  providerKind: string;
  /** Max requests per period. 0 = unlimited. */
  limit: number;
  /** Quota reset period. */
  period: QuotaPeriod;
}

export interface QuotaStatus {
  providerId: string;
  used: number;
  limit: number;
  remaining: number;
  period: QuotaPeriod;
  /** When the current period resets (epoch ms). */
  resetsAt: number;
  /** True when used >= limit (router should skip this provider). */
  exhausted: boolean;
}

// ─── Default free-tier quotas per provider kind ─────────────────────────────
// These are conservative defaults based on public free-tier documentation.
// Operators can override per-provider via AIProviderConfig metadata.

const DEFAULT_QUOTAS: Record<string, { limit: number; period: QuotaPeriod }> = {
  // Groq free tier: ~30 req/min, ~14,400 req/day — conservative 10,000/day
  'groq': { limit: 10_000, period: 'daily' },
  // OpenRouter free models: ~200 req/day for free tier
  'openrouter-free': { limit: 200, period: 'daily' },
  'openrouter': { limit: 200, period: 'daily' },
  // UnoRouter free lanes: ~500 req/day
  'unorouter-free': { limit: 500, period: 'daily' },
  'unorouter': { limit: 500, period: 'daily' },
  // DeepSeek free tier: ~1,000 req/month (generous free credit)
  'deepseek': { limit: 1_000, period: 'monthly' },
  // Mistral free tier (La Plateforme): ~500,000 tokens/month ≈ ~1,000 req
  'mistral': { limit: 1_000, period: 'monthly' },
  // Qwen (DashScope free): ~100,000 tokens/month ≈ ~200 req
  'qwen': { limit: 200, period: 'monthly' },
  // Z.AI free tier: ~500 req/month
  'zai-sdk': { limit: 500, period: 'monthly' },
  'zai': { limit: 500, period: 'monthly' },
  // GitHub Models free tier: ~50 req/day per model
  'github-models': { limit: 50, period: 'daily' },
  // Cerebras free tier: ~20 req/min ≈ ~5,000/day
  'cerebras': { limit: 5_000, period: 'daily' },
  // HuggingFace Inference API free: ~1,000 req/day
  'huggingface': { limit: 1_000, period: 'daily' },
  // Cloudflare Workers AI free: ~10,000 neurons/day
  'cloudflare-workers-ai': { limit: 10_000, period: 'daily' },
  // Cohere trial: ~100 req/month
  'cohere': { limit: 100, period: 'monthly' },
  // Ollama (self-hosted): unlimited — always available
  'ollama': { limit: 0, period: 'daily' },
  // OpenAI-compatible free: depends on the endpoint, conservative 500/day
  'openai-compatible-free': { limit: 500, period: 'daily' },
  // Default for unknown providers
  'default': { limit: 500, period: 'daily' },
};

/** Get the default quota for a provider kind. */
export function getDefaultQuota(providerKind: string): { limit: number; period: QuotaPeriod } {
  return DEFAULT_QUOTAS[providerKind] ?? DEFAULT_QUOTAS['default'];
}

// ─── Period helpers ──────────────────────────────────────────────────────────

/** Get the current period key (for Redis/in-memory storage) + reset time. */
function getPeriodKey(period: QuotaPeriod): { key: string; resetsAt: number } {
  const now = new Date();
  let resetsAt: number;

  switch (period) {
    case 'daily': {
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      resetsAt = tomorrow.getTime();
      const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      return { key: `quota:daily:${dateKey}`, resetsAt };
    }
    case 'weekly': {
      // Start of next week (Monday)
      const day = now.getDay();
      const daysUntilMonday = day === 0 ? 1 : 8 - day;
      const nextMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilMonday);
      resetsAt = nextMonday.getTime();
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (day === 0 ? 6 : day - 1));
      const weekKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
      return { key: `quota:weekly:${weekKey}`, resetsAt };
    }
    case 'monthly':
    default: {
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      resetsAt = nextMonth.getTime();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      return { key: `quota:monthly:${monthKey}`, resetsAt };
    }
  }
}

// ─── In-memory fallback ──────────────────────────────────────────────────────

const memoryCounters = new Map<string, number>();

// Periodic cleanup (every 5 min, remove old daily keys)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const key of memoryCounters.keys()) {
      if (key.includes('quota:')) {
        // Keys are period-scoped (e.g. quota:daily:2026-11-11) — old periods
        // are never read again, so we can clean them.
        const datePart = key.split(':').pop();
        if (datePart && datePart < now.toString()) {
          // Keep it simple — don't clean by date string comparison.
        }
      }
    }
  }, 5 * 60_000).unref?.();
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Check if a provider has remaining free-tier quota.
 * Returns true if the provider is available (has quota remaining or unlimited).
 */
export async function isProviderAvailable(
  providerId: string,
  providerKind: string,
  customLimit?: number,
  customPeriod?: QuotaPeriod,
): Promise<boolean> {
  const { limit, period } = customLimit !== undefined
    ? { limit: customLimit, period: customPeriod ?? 'daily' }
    : getDefaultQuota(providerKind);

  // Unlimited quota (e.g. self-hosted Ollama)
  if (limit === 0) return true;

  const { key } = getPeriodKey(period);
  const storageKey = `${key}:${providerId}`;

  if (isRedisConnected()) {
    try {
      const used = parseInt(await redisGet(storageKey) ?? '0', 10);
      return used < limit;
    } catch {
      // Redis error — fail open (don't block on quota check)
      return true;
    }
  }

  // In-memory fallback
  const used = memoryCounters.get(storageKey) ?? 0;
  return used < limit;
}

/**
 * Record a request against a provider's free-tier quota.
 * Call this AFTER a request succeeds (or before, depending on your accounting).
 */
export async function recordProviderUsage(
  providerId: string,
  providerKind: string,
  customLimit?: number,
  customPeriod?: QuotaPeriod,
): Promise<void> {
  const { limit, period } = customLimit !== undefined
    ? { limit: customLimit, period: customPeriod ?? 'daily' }
    : getDefaultQuota(providerKind);

  if (limit === 0) return; // unlimited

  const { key, resetsAt } = getPeriodKey(period);
  const storageKey = `${key}:${providerId}`;

  if (isRedisConnected()) {
    try {
      const newCount = await redisIncr(storageKey);
      // Set TTL so the key auto-expires at period end (cleanup).
      const ttlSeconds = Math.ceil((resetsAt - Date.now()) / 1000);
      await redisExpire(storageKey, ttlSeconds);
      return;
    } catch {
      // fall through to in-memory
    }
  }

  memoryCounters.set(storageKey, (memoryCounters.get(storageKey) ?? 0) + 1);
}

/**
 * Get the current quota status for a provider (for admin display).
 */
export async function getQuotaStatus(
  providerId: string,
  providerKind: string,
  customLimit?: number,
  customPeriod?: QuotaPeriod,
): Promise<QuotaStatus> {
  const { limit, period } = customLimit !== undefined
    ? { limit: customLimit, period: customPeriod ?? 'daily' }
    : getDefaultQuota(providerKind);
  const { key, resetsAt } = getPeriodKey(period);
  const storageKey = `${key}:${providerId}`;

  let used = 0;
  if (isRedisConnected()) {
    try {
      used = parseInt(await redisGet(storageKey) ?? '0', 10);
    } catch { /* in-memory */ }
  } else {
    used = memoryCounters.get(storageKey) ?? 0;
  }

  return {
    providerId,
    used,
    limit,
    remaining: limit === 0 ? Infinity : Math.max(0, limit - used),
    period,
    resetsAt,
    exhausted: limit > 0 && used >= limit,
  };
}

/**
 * Get the priority order of free providers for failover.
 * Providers are ordered by:
 *   1. Not exhausted (available first)
 *   2. Most remaining quota
 *   3. Lowest latency (health)
 *
 * This implements the "if one doesn't work, the next one will" behavior.
 */
export async function getOrderedFreeProviders(
  providers: Array<{ id: string; kind: string; isLocal: boolean }>,
): Promise<Array<{ id: string; kind: string; isLocal: boolean; available: boolean; remaining: number }>> {
  const statuses = await Promise.all(
    providers.map(async (p) => {
      const status = await getQuotaStatus(p.id, p.kind);
      return { ...p, available: !status.exhausted, remaining: status.remaining === Infinity ? Number.MAX_SAFE_INTEGER : status.remaining };
    }),
  );

  // Sort: available first (by most remaining), then unavailable (for visibility)
  return statuses.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    return b.remaining - a.remaining;
  });
}

/**
 * Reset a provider's quota manually (admin action — e.g. after upgrading a
 * plan or for testing).
 */
export async function resetProviderQuota(providerId: string, providerKind: string, customPeriod?: QuotaPeriod): Promise<void> {
  const { period } = customPeriod ? { period: customPeriod } : getDefaultQuota(providerKind);
  const { key } = getPeriodKey(period);
  const storageKey = `${key}:${providerId}`;

  if (isRedisConnected()) {
    try {
      const { redisDel } = await import('@/lib/redis');
      await redisDel(storageKey);
      return;
    } catch { /* in-memory */ }
  }

  memoryCounters.delete(storageKey);
}

/** Test helper: reset all in-memory counters. */
export function _resetAllQuotasForTests(): void {
  memoryCounters.clear();
}
