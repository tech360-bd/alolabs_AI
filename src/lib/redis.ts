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
  db?: number;
  keyPrefix?: string;
  maxRetriesPerRequest?: number;
}

let client: Redis | null = null;
let connected = false;
let connectionError: string | null = null;

// In-memory fallback stores
const memoryCache = new Map<string, { value: string; expiresAt: number }>();
const memorySets = new Map<string, Set<string>>();
const memoryHashes = new Map<string, Map<string, string>>();
const memoryCounters = new Map<string, number>();

// Cleanup expired memory entries every 60 seconds
if (typeof globalThis !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryCache.entries()) {
      if (entry.expiresAt > 0 && now > entry.expiresAt) {
        memoryCache.delete(key);
      }
    }
  }, 60_000);
}

export async function connectRedis(config?: RedisConfig): Promise<{ success: boolean; error?: string; latencyMs?: number; version?: string }> {
  const startTime = Date.now();

  try {
    const resolvedConfig = config || getDefaultConfig();

    if (!resolvedConfig) {
      connectionError = 'Redis: No configuration provided. Set REDIS_URL or REDIS_HOST env var.';
      connected = false;
      return { success: false, error: connectionError };
    }

    if (client) {
      client.disconnect();
    }

    client = new Redis({
      host: resolvedConfig.host,
      port: resolvedConfig.port,
      password: resolvedConfig.password,
      db: resolvedConfig.db || 0,
      keyPrefix: resolvedConfig.keyPrefix || 'alohub:',
      maxRetriesPerRequest: resolvedConfig.maxRetriesPerRequest || 3,
      retryStrategy: (times) => Math.min(times * 200, 5000),
      lazyConnect: false,
      connectTimeout: 5000,
    });

    client.on('error', (err) => {
      console.error('[Redis] Error:', err.message);
      connectionError = err.message;
      connected = false;
    });

    client.on('connect', () => {
      connected = true;
      connectionError = null;
    });

    // Wait for ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Redis connection timeout')), 5000);
      client!.once('ready', () => { clearTimeout(timeout); resolve(); });
      client!.once('error', () => { clearTimeout(timeout); reject(new Error(connectionError || 'Connection failed')); });
    });

    const latencyMs = Date.now() - startTime;
    const info = await client.info('server');
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
    connected = false;
    connectionError = error;
    client = null;

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
  if (client) {
    client.disconnect();
    client = null;
    connected = false;
  }
}

export function isRedisConnected(): boolean {
  return connected;
}

export function getRedisError(): string | null {
  return connectionError;
}

// ─── Key-Value Operations ────────────────────────────────────────────────────

export async function redisGet(key: string): Promise<string | null> {
  if (connected && client) {
    try {
      return await client.get(key);
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
  if (connected && client) {
    try {
      if (ttlSeconds) {
        await client.setex(key, ttlSeconds, value);
      } else {
        await client.set(key, value);
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
  if (connected && client) {
    try {
      return await client.del(...(Array.isArray(key) ? key : [key]));
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
  if (connected && client) {
    try {
      return (await client.exists(key)) === 1;
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
  if (connected && client) {
    try {
      return (await client.expire(key, seconds)) === 1;
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
  if (connected && client) {
    try { return await client.hget(key, field); } catch { /* fallback */ }
  }
  return memoryHashes.get(key)?.get(field) || null;
}

export async function redisHSet(key: string, field: string, value: string): Promise<void> {
  if (connected && client) {
    try { await client.hset(key, field, value); return; } catch { /* fallback */ }
  }
  if (!memoryHashes.has(key)) memoryHashes.set(key, new Map());
  memoryHashes.get(key)!.set(field, value);
}

export async function redisHGetAll(key: string): Promise<Record<string, string>> {
  if (connected && client) {
    try { return await client.hgetall(key); } catch { /* fallback */ }
  }
  const hash = memoryHashes.get(key);
  if (!hash) return {};
  return Object.fromEntries(hash);
}

export async function redisHDel(key: string, field: string): Promise<boolean> {
  if (connected && client) {
    try { return (await client.hdel(key, field)) === 1; } catch { /* fallback */ }
  }
  return memoryHashes.get(key)?.delete(field) || false;
}

// ─── Set Operations ──────────────────────────────────────────────────────────

export async function redisSAdd(key: string, ...members: string[]): Promise<number> {
  if (connected && client) {
    try { return await client.sadd(key, ...members); } catch { /* fallback */ }
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
  if (connected && client) {
    try { return await client.smembers(key); } catch { /* fallback */ }
  }
  return Array.from(memorySets.get(key) || []);
}

export async function redisSRem(key: string, ...members: string[]): Promise<number> {
  if (connected && client) {
    try { return await client.srem(key, ...members); } catch { /* fallback */ }
  }
  const set = memorySets.get(key);
  if (!set) return 0;
  let removed = 0;
  for (const m of members) { if (set.delete(m)) removed++; }
  return removed;
}

// ─── Counter Operations ──────────────────────────────────────────────────────

export async function redisIncr(key: string): Promise<number> {
  if (connected && client) {
    try { return await client.incr(key); } catch { /* fallback */ }
  }
  const current = memoryCounters.get(key) || 0;
  const next = current + 1;
  memoryCounters.set(key, next);
  return next;
}

export async function redisIncrBy(key: string, amount: number): Promise<number> {
  if (connected && client) {
    try { return await client.incrby(key, amount); } catch { /* fallback */ }
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

  if (connected && client) {
    try {
      const pipeline = client.pipeline();
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
  if (connected && client) {
    try { return await client.publish(channel, message); } catch { /* ignore */ }
  }
  // In-memory fallback: no-op (no subscribers in memory)
  return 0;
}

export function redisSubscribe(channel: string, callback: (message: string) => void): () => void {
  if (connected && client) {
    const sub = client.duplicate();
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
  if (!connected || !client) {
    return { connected: false };
  }

  try {
    const info = await client.info();
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
  if (!connected || !client) {
    return { success: false, latencyMs: 0, error: 'Not connected' };
  }

  const startTime = Date.now();
  try {
    await client.ping();
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
        password: url.password || undefined,
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