/**
 * ALO Open AI Platform — shared routing state (cooldowns, health, quota).
 *
 * REQUIREMENT
 * -----------
 * "Use Redis-backed shared state for routing health and cooldowns." and, in the
 * acceptance tests, "Rate limits work across multiple application replicas."
 *
 * DESIGN
 * ------
 * Redis is the fast, shared, cross-replica store. This module never assumes it
 * exists: when `REDIS_URL` is unset (a single-instance self-hosted install, the
 * default for a local-first deployment) every operation falls through to a
 * database-backed `AiRoutingState` table. That table is what makes the *same*
 * code correct on one box and on ten, and it is also what the Super Admin panel
 * reads to explain "why is this model not being selected right now".
 *
 * The Redis path uses a pipeline-free single round trip per operation
 * (`SET key value PX ttl`), which is atomic and needs no Lua.
 *
 * FAILURE POLICY
 * --------------
 * If Redis is configured but a call fails, we log once and use the database.
 * Routing state is advisory (it affects *preference*, not authorisation), so a
 * short-lived inconsistency must never fail a user's request.
 */

import { db } from '@/lib/db';
import { redisDel, redisGet, redisSet, getRedisError } from '@/lib/redis';

export type HealthStatus = 'healthy' | 'degraded' | 'unreachable' | 'unknown';

export interface DeploymentHealth {
  status: HealthStatus;
  /** Consecutive failures since the last success. */
  consecutiveFailures: number;
  lastErrorClass?: string;
  lastError?: string;
  lastFailureAt?: string;
  lastSuccessAt?: string;
  /** Exponentially weighted success rate in [0,1]. */
  successRate: number;
  /** Exponentially weighted latency in ms. */
  avgLatencyMs: number;
  updatedAt: string;
}

export const DEFAULT_HEALTH: DeploymentHealth = {
  status: 'unknown',
  consecutiveFailures: 0,
  successRate: 1,
  avgLatencyMs: 0,
  updatedAt: new Date(0).toISOString(),
};

const HEALTH_TTL_MS = 24 * 60 * 60 * 1000;
const COOLDOWN_KEY_PREFIX = 'alo:ai:cooldown:';
const HEALTH_KEY_PREFIX = 'alo:ai:health:';
const QUOTA_KEY_PREFIX = 'alo:ai:quota:';

function deploymentKey(provider: string, model: string): string {
  return `${provider}::${model}`;
}

function cooldownKey(provider: string, model: string): string {
  return `${COOLDOWN_KEY_PREFIX}${deploymentKey(provider, model)}`;
}

function healthKey(provider: string, model: string): string {
  return `${HEALTH_KEY_PREFIX}${deploymentKey(provider, model)}`;
}

let redisWarned = false;
function noteRedisFailure(operation: string): void {
  if (redisWarned) return;
  redisWarned = true;
  console.warn(
    `[routing-state] Redis ${operation} failed (${getRedisError() ?? 'unknown'}); ` +
      'using the database-backed routing state. Cooldowns stay correct, they are just slower.',
  );
}

// ─── Cooldowns ─────────────────────────────────────────────────────────────

export interface CooldownInfo {
  active: boolean;
  until?: number;
  reason?: string;
  errorClass?: string;
}

/**
 * Is this deployment currently in cooldown?
 *
 * A cooldown is *not* a circuit breaker: it is a short, error-driven pause
 * derived from the provider's own Retry-After when it gives one. Once it
 * expires the deployment is candidate again without any manual action.
 */
export async function getCooldown(provider: string, model: string): Promise<CooldownInfo> {
  const key = cooldownKey(provider, model);
  const raw = await redisGet(key).catch(() => {
    noteRedisFailure('get');
    return null;
  });
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { until: number; reason?: string; errorClass?: string };
      if (parsed.until > Date.now()) {
        return { active: true, until: parsed.until, reason: parsed.reason, errorClass: parsed.errorClass };
      }
    } catch {
      // Corrupt value: treat as absent and let the DB answer.
    }
  }

  const row = await db.aiRoutingState.findUnique({ where: { key } });
  if (row?.expiresAt && row.expiresAt.getTime() > Date.now()) {
    try {
      const parsed = JSON.parse(row.value) as { reason?: string; errorClass?: string };
      return { active: true, until: row.expiresAt.getTime(), reason: parsed.reason, errorClass: parsed.errorClass };
    } catch {
      return { active: true, until: row.expiresAt.getTime() };
    }
  }
  return { active: false };
}

/** Start (or extend) a cooldown. Zero or negative duration is a no-op. */
export async function setCooldown(
  provider: string,
  model: string,
  durationMs: number,
  reason: string,
  errorClass?: string,
): Promise<void> {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return;
  const key = cooldownKey(provider, model);
  const until = Date.now() + durationMs;
  const value = JSON.stringify({ until, reason, ...(errorClass ? { errorClass } : {}) });

  await redisSet(key, value, Math.ceil(durationMs / 1000)).catch(() => noteRedisFailure('set'));
  await db.aiRoutingState
    .upsert({
      where: { key },
      create: { key, value, expiresAt: new Date(until) },
      update: { value, expiresAt: new Date(until) },
    })
    .catch(() => undefined);
}

export async function clearCooldown(provider: string, model: string): Promise<void> {
  const key = cooldownKey(provider, model);
  await redisDel(key).catch(() => noteRedisFailure('del'));
  await db.aiRoutingState.deleteMany({ where: { key } }).catch(() => undefined);
}

/** Every cooldown currently in force — used by the Super Admin panel. */
export async function listActiveCooldowns(): Promise<Array<{ provider: string; model: string; until: number; reason?: string }>> {
  const rows = await db.aiRoutingState.findMany({
    where: { key: { startsWith: COOLDOWN_KEY_PREFIX }, expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: 'desc' },
    take: 200,
  });
  return rows.flatMap((row) => {
    const [provider, model] = row.key.slice(COOLDOWN_KEY_PREFIX.length).split('::');
    if (!provider || !model) return [];
    let reason: string | undefined;
    try {
      reason = (JSON.parse(row.value) as { reason?: string }).reason;
    } catch {
      reason = undefined;
    }
    return [{ provider, model, until: row.expiresAt?.getTime() ?? 0, ...(reason ? { reason } : {}) }];
  });
}

// ─── Health ────────────────────────────────────────────────────────────────

export async function getHealth(provider: string, model: string): Promise<DeploymentHealth> {
  const key = healthKey(provider, model);
  const raw = await redisGet(key).catch(() => {
    noteRedisFailure('get');
    return null;
  });
  if (raw) {
    try {
      return { ...DEFAULT_HEALTH, ...(JSON.parse(raw) as Partial<DeploymentHealth>) };
    } catch {
      // fall through to the database
    }
  }
  const row = await db.aiRoutingState.findUnique({ where: { key } });
  if (!row) return DEFAULT_HEALTH;
  try {
    return { ...DEFAULT_HEALTH, ...(JSON.parse(row.value) as Partial<DeploymentHealth>) };
  } catch {
    return DEFAULT_HEALTH;
  }
}

/**
 * Fold one outcome into the deployment's health.
 *
 * The success rate and latency are exponentially weighted (α = 0.3) so a
 * deployment recovers visibly within a few requests instead of being punished
 * for a bad hour, and `status` is derived rather than set:
 *   unreachable — 3+ consecutive failures
 *   degraded    — 1-2 consecutive failures, or a success rate under 50%
 *   healthy     — otherwise, once we have seen a success
 */
export async function recordOutcome(
  provider: string,
  model: string,
  outcome: { ok: boolean; latencyMs?: number; errorClass?: string; error?: string },
): Promise<DeploymentHealth> {
  const key = healthKey(provider, model);
  const previous = await getHealth(provider, model);
  const now = new Date().toISOString();
  const alpha = 0.3;

  const consecutiveFailures = outcome.ok ? 0 : previous.consecutiveFailures + 1;
  const successSample = outcome.ok ? 1 : 0;
  const successRate = previous.updatedAt === new Date(0).toISOString()
    ? successSample
    : previous.successRate * (1 - alpha) + successSample * alpha;

  let avgLatencyMs = previous.avgLatencyMs;
  if (outcome.ok && typeof outcome.latencyMs === 'number' && outcome.latencyMs >= 0) {
    avgLatencyMs = previous.avgLatencyMs === 0
      ? outcome.latencyMs
      : previous.avgLatencyMs * (1 - alpha) + outcome.latencyMs * alpha;
  }

  const status: HealthStatus = consecutiveFailures >= 3
    ? 'unreachable'
    : consecutiveFailures > 0 || successRate < 0.5
      ? 'degraded'
      : 'healthy';

  const next: DeploymentHealth = {
    status,
    consecutiveFailures,
    successRate: Math.round(successRate * 1000) / 1000,
    avgLatencyMs: Math.round(avgLatencyMs),
    updatedAt: now,
    ...(previous.lastFailureAt ? { lastFailureAt: previous.lastFailureAt } : {}),
    ...(previous.lastSuccessAt ? { lastSuccessAt: previous.lastSuccessAt } : {}),
    ...(outcome.ok
      ? { lastSuccessAt: now }
      : {
          ...(previous.lastSuccessAt ? { lastSuccessAt: previous.lastSuccessAt } : {}),
          lastFailureAt: now,
          ...(outcome.errorClass ? { lastErrorClass: outcome.errorClass } : {}),
          // Keep the message short and credential-free.
          ...(outcome.error ? { lastError: outcome.error.slice(0, 300) } : {}),
        }),
  };

  const serialized = JSON.stringify(next);
  await redisSet(key, serialized, Math.ceil(HEALTH_TTL_MS / 1000)).catch(() => noteRedisFailure('set'));
  await db.aiRoutingState
    .upsert({
      where: { key },
      create: { key, value: serialized, expiresAt: new Date(Date.now() + HEALTH_TTL_MS) },
      update: { value: serialized, expiresAt: new Date(Date.now() + HEALTH_TTL_MS) },
    })
    .catch(() => undefined);

  return next;
}

/** Health for every deployment we have observed. */
export async function listHealth(): Promise<Array<{ provider: string; model: string; health: DeploymentHealth }>> {
  const rows = await db.aiRoutingState.findMany({
    where: { key: { startsWith: HEALTH_KEY_PREFIX } },
    orderBy: { updatedAt: 'desc' },
    take: 500,
  });
  return rows.flatMap((row) => {
    const [provider, model] = row.key.slice(HEALTH_KEY_PREFIX.length).split('::');
    if (!provider || !model) return [];
    try {
      return [{ provider, model, health: { ...DEFAULT_HEALTH, ...(JSON.parse(row.value) as Partial<DeploymentHealth>) } }];
    } catch {
      return [];
    }
  });
}

// ─── Quota ─────────────────────────────────────────────────────────────────

export interface QuotaState {
  /** Requests used in the current window. */
  used: number;
  limit: number;
  windowMs: number;
  windowStartedAt: number;
  exhausted: boolean;
  resetAt: number;
}

/**
 * Consume one unit of a provider's free-tier quota.
 *
 * This is a *local* accounting of what this deployment has sent, not a claim
 * about upstream limits — we can never know a remote provider's real remaining
 * balance. It exists so that when a provider tells us we are out (`429`), the
 * remaining requests in the window go straight to a fallback instead of being
 * spent re-discovering the same error. Returned state is advisory; the caller
 * must still treat a real 429 as authoritative.
 */
export async function consumeQuota(
  provider: string,
  model: string,
  limits: { limit: number; windowMs: number },
): Promise<QuotaState> {
  const key = `${QUOTA_KEY_PREFIX}${deploymentKey(provider, model)}`;
  const now = Date.now();
  const current = await readQuota(key);

  if (!current || now - current.windowStartedAt >= limits.windowMs) {
    const fresh: QuotaState = { used: 1, limit: limits.limit, windowMs: limits.windowMs, windowStartedAt: now, exhausted: false, resetAt: now + limits.windowMs };
    await writeQuota(key, fresh, limits.windowMs);
    return fresh;
  }

  const used = current.used + 1;
  const next: QuotaState = {
    ...current,
    used,
    limit: limits.limit,
    windowMs: limits.windowMs,
    exhausted: used >= limits.limit,
  };
  await writeQuota(key, next, Math.max(1000, current.resetAt - now));
  return next;
}

async function readQuota(key: string): Promise<QuotaState | null> {
  const raw = await redisGet(key).catch(() => {
    noteRedisFailure('get');
    return null;
  });
  if (raw) {
    try {
      return JSON.parse(raw) as QuotaState;
    } catch {
      // fall through
    }
  }
  const row = await db.aiRoutingState.findUnique({ where: { key } });
  if (!row) return null;
  try {
    return JSON.parse(row.value) as QuotaState;
  } catch {
    return null;
  }
}

async function writeQuota(key: string, state: QuotaState, ttlMs: number): Promise<void> {
  const serialized = JSON.stringify(state);
  await redisSet(key, serialized, Math.max(1, Math.ceil(ttlMs / 1000))).catch(() => noteRedisFailure('set'));
  await db.aiRoutingState
    .upsert({
      where: { key },
      create: { key, value: serialized, expiresAt: new Date(Date.now() + ttlMs) },
      update: { value: serialized, expiresAt: new Date(Date.now() + ttlMs) },
    })
    .catch(() => undefined);
}

export async function getQuota(provider: string, model: string): Promise<QuotaState | null> {
  return readQuota(`${QUOTA_KEY_PREFIX}${deploymentKey(provider, model)}`);
}

/** Housekeeping for the scheduler: drop expired routing rows. */
export async function purgeExpiredRoutingState(): Promise<number> {
  const result = await db.aiRoutingState.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return result.count;
}
