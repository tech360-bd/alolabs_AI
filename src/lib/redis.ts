/**
 * Redis Adapter
 * Provides Redis client for caching, sessions, pub/sub, and rate limiting.
 * Falls back to in-memory Map-based storage when Redis is not available.
 */

import Redis from 'ioredis';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  username?: string;
  tls?: boolean;
  db?: number;
  keyPrefix?: string;
  maxRetriesPerRequest?: number;
}

// Instrumentation and route handlers can live in separate Next module graphs.
// Share the actual connection across them, including during dev hot reload.
type RedisState = { client: Redis | null; connected: boolean; connectionError: string | null; connecting?: Promise<unknown> };
const runtime = globalThis as typeof globalThis & { __aloRedis?: RedisState };
const pool: RedisState = runtime.__aloRedis ??= {client: null, connected: false, connectionError: null};

// In-memory fallback stores
const memoryCache = new Map<string, { value: string; expiresAt: number }>();
const memorySets = new Map<string, Set<string>>();
const memoryHashes = new Map<string, Map<string, string>>();
const memoryCounters = new Map<string, number>();

// Cleanup expired memory entries every 60 seconds.
//
// `unref()` matters: without it this timer is the only thing keeping a Node
// process alive, so every CLI script, worker and test that merely *imports*
// the db/redis graph hangs on exit instead of finishing. The timer is
// housekeeping, not work, so it must never hold the loop open.
if (typeof globalThis !== 'undefined') {
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryCache.entries()) {
      if (entry.expiresAt > 0 && now > entry.expiresAt) {
        memoryCache.delete(key);
      }
    }
  }, 60_000);
  cleanup.unref?.();
}

export async function connectRedis(config?: RedisConfig): Promise<{ success: boolean; error?: string; latencyMs?: number; version?: string }> {
  const startTime = Date.now();

  try {
    const resolvedConfig = config || getDefaultConfig();

    if (!resolvedConfig) {
      pool.connectionError = 'Redis: No configuration provided. Set REDIS_URL or REDIS_HOST env var.';
      pool.connected = false;
      return { success: false, error: pool.connectionError };
    }

    if (pool.client) {
      pool.client.disconnect();
    }

    pool.client = new Redis({
      host: resolvedConfig.host,
      port: resolvedConfig.port,
      username: resolvedConfig.username,
      password: resolvedConfig.password,
      ...(resolvedConfig.tls ? { tls: {} } : {}),
      db: resolvedConfig.db || 0,
      keyPrefix: resolvedConfig.keyPrefix || 'alohub:',
      maxRetriesPerRequest: resolvedConfig.maxRetriesPerRequest || 3,
      retryStrategy: (times) => Math.min(times * 200, 5000),
      lazyConnect: false,
      connectTimeout: 5000,
    });

    pool.client.on('error', (err) => {
      console.error('[Redis] Error:', err.message);
      pool.connectionError = err.message;
      pool.connected = false;
    });

    pool.client.on('connect', () => {
      pool.connected = true;
      pool.connectionError = null;
    });

    // Wait for ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Redis connection timeout')), 5000);
      pool.client!.once('ready', () => { clearTimeout(timeout); resolve(); });
      pool.client!.once('error', () => { clearTimeout(timeout); reject(new Error(pool.connectionError || 'Connection failed')); });
    });

    const latencyMs = Date.now() - startTime;
    const info = await pool.client.info('server');
    const versionMatch = info.match(/redis_version:([^\r\n]+)/);
    const version = versionMatch ? versionMatch[1] : 'unknown';

    // Update InfraService
    try {
      const { db } = await import('./db');
      await db.infraService.upsert({
        where: { type: 'redis' },
        create: {
          name: 'Redis',
          type: 'redis',
          host: resolvedConfig.host,
          port: resolvedConfig.port,
          status: 'connected',
          connectedAt: new Date(),
          lastPingAt: new Date(),
          latencyMs,
          version,
        },
        update: {
          host: resolvedConfig.host,
          port: resolvedConfig.port,
          status: 'connected',
          connectedAt: new Date(),
          lastPingAt: new Date(),
          latencyMs,
          version,
          errorCount: 0,
          lastError: null,
        },
      });
    } catch { /* ignore */ }

    return { success: true, latencyMs, version };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    pool.connected = false;
    pool.connectionError = error;
    pool.client?.disconnect();
    pool.client = null;

    try {
      const { db } = await import('./db');
      await db.infraService.upsert({
        where: { type: 'redis' },
        create: { name: 'Redis', type: 'redis', status: 'disconnected', lastError: error, errorCount: 1 },
        update: { status: 'disconnected', lastError: error, errorCount: { increment: 1 } },
      });
    } catch { /* ignore */ }

    return { success: false, error, latencyMs: Date.now() - startTime };
  }
}

export async function disconnectRedis(): Promise<void> {
  if (pool.client) {
    pool.client.disconnect();
    pool.client = null;
    pool.connected = false;
  }
}

export function isRedisConnected(): boolean {
  return pool.connected;
}

/** NULL means no shared backend is available; callers must enforce a local limit. */
export async function evalLimitScript(script: string, key: string, ...args: number[]): Promise<number[] | null> {
  if (pool.client?.status !== 'ready') return null;
  try {
    return await pool.client.eval(script, 1, key, ...args) as number[];
  } catch {
    return null;
  }
}

export function getRedisError(): string | null {
  return pool.connectionError;
}

// ─── Key-Value Operations ────────────────────────────────────────────────────

export async function redisGet(key: string): Promise<string | null> {
  if (pool.connected && pool.client) {
    try {
      return await pool.client.get(key);
    } catch (err: unknown) {
      console.error('[Redis] GET error:', err instanceof Error ? err.message : err);
    }
  }
  // Fallback to memory
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

export async function redisSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  if (pool.connected && pool.client) {
    try {
      if (ttlSeconds) {
        await pool.client.setex(key, ttlSeconds, value);
      } else {
        await pool.client.set(key, value);
      }
      return;
    } catch (err: unknown) {
      console.error('[Redis] SET error:', err instanceof Error ? err.message : err);
    }
  }
  // Fallback to memory
  memoryCache.set(key, {
    value,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0,
  });
}

export async function redisDel(key: string | string[]): Promise<number> {
  if (pool.connected && pool.client) {
    try {
      return await pool.client.del(...(Array.isArray(key) ? key : [key]));
    } catch (err: unknown) {
      console.error('[Redis] DEL error:', err instanceof Error ? err.message : err);
    }
  }
  const keys = Array.isArray(key) ? key : [key];
  let count = 0;
  for (const k of keys) {
    count += memoryCache.delete(k) ? 1 : 0;
  }
  return count;
}

export async function redisExists(key: string): Promise<boolean> {
  if (pool.connected && pool.client) {
    try {
      return (await pool.client.exists(key)) === 1;
    } catch {
      // fallback
    }
  }
  const entry = memoryCache.get(key);
  if (!entry) return false;
  if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return false;
  }
  return true;
}

export async function redisExpire(key: string, seconds: number): Promise<boolean> {
  if (pool.connected && pool.client) {
    try {
      return (await pool.client.expire(key, seconds)) === 1;
    } catch {
      // fallback
    }
  }
  const entry = memoryCache.get(key);
  if (entry) {
    entry.expiresAt = Date.now() + seconds * 1000;
    return true;
  }
  return false;
}

// ─── Hash Operations ─────────────────────────────────────────────────────────

export async function redisHGet(key: string, field: string): Promise<string | null> {
  if (pool.connected && pool.client) {
    try { return await pool.client.hget(key, field); } catch { /* fallback */ }
  }
  return memoryHashes.get(key)?.get(field) || null;
}

export async function redisHSet(key: string, field: string, value: string): Promise<void> {
  if (pool.connected && pool.client) {
    try { await pool.client.hset(key, field, value); return; } catch { /* fallback */ }
  }
  if (!memoryHashes.has(key)) memoryHashes.set(key, new Map());
  memoryHashes.get(key)!.set(field, value);
}

export async function redisHGetAll(key: string): Promise<Record<string, string>> {
  if (pool.connected && pool.client) {
    try { return await pool.client.hgetall(key); } catch { /* fallback */ }
  }
  const hash = memoryHashes.get(key);
  if (!hash) return {};
  return Object.fromEntries(hash);
}

export async function redisHDel(key: string, field: string): Promise<boolean> {
  if (pool.connected && pool.client) {
    try { return (await pool.client.hdel(key, field)) === 1; } catch { /* fallback */ }
  }
  return memoryHashes.get(key)?.delete(field) || false;
}

// ─── Set Operations ──────────────────────────────────────────────────────────

export async function redisSAdd(key: string, ...members: string[]): Promise<number> {
  if (pool.connected && pool.client) {
    try { return await pool.client.sadd(key, ...members); } catch { /* fallback */ }
  }
  if (!memorySets.has(key)) memorySets.set(key, new Set());
  const set = memorySets.get(key)!;
  let added = 0;
  for (const m of members) {
    if (!set.has(m)) { set.add(m); added++; }
  }
  return added;
}

export async function redisSMembers(key: string): Promise<string[]> {
  if (pool.connected && pool.client) {
    try { return await pool.client.smembers(key); } catch { /* fallback */ }
  }
  return Array.from(memorySets.get(key) || []);
}

export async function redisSRem(key: string, ...members: string[]): Promise<number> {
  if (pool.connected && pool.client) {
    try { return await pool.client.srem(key, ...members); } catch { /* fallback */ }
  }
  const set = memorySets.get(key);
  if (!set) return 0;
  let removed = 0;
  for (const m of members) { if (set.delete(m)) removed++; }
  return removed;
}

// ─── Counter Operations ──────────────────────────────────────────────────────

export async function redisIncr(key: string): Promise<number> {
  if (pool.connected && pool.client) {
    try { return await pool.client.incr(key); } catch { /* fallback */ }
  }
  const current = memoryCounters.get(key) || 0;
  const next = current + 1;
  memoryCounters.set(key, next);
  return next;
}

export async function redisIncrBy(key: string, amount: number): Promise<number> {
  if (pool.connected && pool.client) {
    try { return await pool.client.incrby(key, amount); } catch { /* fallback */ }
  }
  const current = memoryCounters.get(key) || 0;
  const next = current + amount;
  memoryCounters.set(key, next);
  return next;
}

// ─── Rate Limiting ───────────────────────────────────────────────────────────

export async function rateLimitCheck(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const rlKey = `rl:${key}`;
  const now = Math.floor(Date.now() / 1000);
  const windowKey = `${rlKey}:${now - (now % windowSeconds)}`;

  if (pool.connected && pool.client) {
    try {
      const pipeline = pool.client.pipeline();
      pipeline.incr(windowKey);
      pipeline.expire(windowKey, windowSeconds + 1);
      pipeline.ttl(windowKey);
      const results = await pipeline.exec();

      const count = (results?.[0]?.[1] as number) || 0;
      const ttl = (results?.[2]?.[1] as number) || windowSeconds;
      const remaining = Math.max(0, limit - count);
      const resetAt = now + ttl;

      if (count > limit) {
        return { allowed: false, remaining: 0, resetAt };
      }
      return { allowed: true, remaining, resetAt };
    } catch {
      // fallback to memory
    }
  }

  // Memory fallback
  const current = memoryCounters.get(windowKey) || 0;
  if (current >= limit) {
    return { allowed: false, remaining: 0, resetAt: (Math.floor(Date.now() / (windowSeconds * 1000)) + 1) * windowSeconds };
  }
  memoryCounters.set(windowKey, current + 1);
  return { allowed: true, remaining: limit - current - 1, resetAt: (Math.floor(Date.now() / (windowSeconds * 1000)) + 1) * windowSeconds };
}

// ─── Pub/Sub ─────────────────────────────────────────────────────────────────

export async function redisPublish(channel: string, message: string): Promise<number> {
  if (!pool.client && process.env.REDIS_URL) {
    pool.connecting ??= connectRedis().finally(() => { pool.connecting = undefined; });
    await pool.connecting;
  }
  if (pool.connected && pool.client) {
    try { return await pool.client.publish(channel, message); } catch { /* ignore */ }
  }
  // In-memory fallback: no-op (no subscribers in memory)
  return 0;
}

export function redisSubscribe(channel: string, callback: (message: string) => void): () => void {
  if (pool.connected && pool.client) {
    const sub = pool.client.duplicate();
    sub.subscribe(channel).catch(() => {});
    sub.on('message', (ch: string, msg: string) => {
      if (ch === channel) callback(msg);
    });
    return () => { sub.unsubscribe().catch(() => {}); sub.disconnect(); };
  }
  // Memory fallback: no-op
  return () => {};
}

// ─── Stats & Health ──────────────────────────────────────────────────────────

export async function getRedisStats(): Promise<{
  connected: boolean;
  version?: string;
  usedMemoryBytes?: string;
  connectedClients?: number;
  totalCommands?: string;
  keyspaceHits?: string;
  keyspaceMisses?: string;
  uptimeSeconds?: string;
  databases?: Record<string, { keys: string; expires: string }>;
}> {
  if (!pool.connected || !pool.client) {
    return { connected: false };
  }

  try {
    const info = await pool.client.info();
    const parse = (section: string) => {
      const match = info.match(new RegExp(`#${section}(?:\\r\\n|\\n)([\\s\\S]*?)(?:\\r\\n|\\n)(?=#|$)`));
      if (!match) return {};
      const map: Record<string, string> = {};
      for (const line of match[1].split(/[\r\n]+/)) {
        const [k, ...v] = line.split(':');
        if (k && v.length) map[k.trim()] = v.join(':').trim();
      }
      return map;
    };

    const server = parse('Server');
    const memory = parse('Memory');
    const clients = parse('Clients');
    const stats = parse('Stats');
    const keyspace = parse('Keyspace');
    const dbs: Record<string, { keys: string; expires: string }> = {};
    for (const [k, v] of Object.entries(keyspace)) {
      if (k.startsWith('db')) {
        const match = v.match(/keys=(\d+),expires=(\d+)/);
        if (match) dbs[k] = { keys: match[1], expires: match[2] };
      }
    }

    return {
      connected: true,
      version: server.redis_version,
      usedMemoryBytes: memory.used_memory,
      connectedClients: parseInt(clients.connected_clients || '0'),
      totalCommands: stats.total_commands_processed,
      keyspaceHits: stats.keyspace_hits,
      keyspaceMisses: stats.keyspace_misses,
      uptimeSeconds: server.uptime_in_seconds,
      databases: dbs,
    };
  } catch {
    return { connected: true };
  }
}

export async function pingRedis(): Promise<{ success: boolean; latencyMs: number; error?: string }> {
  if (!pool.connected || !pool.client) {
    return { success: false, latencyMs: 0, error: 'Not connected' };
  }

  const startTime = Date.now();
  try {
    await pool.client.ping();
    const latencyMs = Date.now() - startTime;

    try {
      const { db } = await import('./db');
      await db.infraService.update({
        where: { type: 'redis' },
        data: { lastPingAt: new Date(), latencyMs, status: 'connected' },
      });
    } catch { /* ignore */ }

    return { success: true, latencyMs };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, latencyMs: Date.now() - startTime, error };
  }
}

function getDefaultConfig(): RedisConfig | null {
  if (process.env.REDIS_URL) {
    try {
      const url = new URL(process.env.REDIS_URL);
      return {
        host: url.hostname || 'localhost',
        port: parseInt(url.port || '6379', 10),
        username: decodeURIComponent(url.username) || undefined,
        password: decodeURIComponent(url.password) || undefined,
        tls: url.protocol === 'rediss:',
        db: url.pathname ? parseInt(url.pathname.slice(1), 10) : 0,
      };
    } catch {
      return null;
    }
  }

  if (process.env.REDIS_HOST) {
    return {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      keyPrefix: process.env.REDIS_PREFIX || 'alohub:',
    };
  }

  return null;
}

export function getRedisConfig(): RedisConfig | null {
  return getDefaultConfig();
}