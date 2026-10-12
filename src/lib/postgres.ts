/**
 * PostgreSQL Adapter
 * Provides a PostgreSQL client with connection pooling.
 * Falls back gracefully when PostgreSQL is not available.
 */

import { Pool, PoolClient, PoolConfig } from 'pg';

export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
  idleTimeoutMs?: number;
}

let pool: Pool | null = null;
let connected = false;
let connectionError: string | null = null;

function getPoolConfig(config: PostgresConfig): PoolConfig {
  return {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl
      ? (process.env.PG_ALLOW_INSECURE_SSL === 'true' ? { rejectUnauthorized: false } : true)
      : undefined,
    max: config.maxConnections || 10,
    idleTimeoutMillis: config.idleTimeoutMs || 30000,
    connectionTimeoutMillis: 5000,
    allowExitOnIdle: true,
  };
}

export async function connectPostgres(config?: PostgresConfig): Promise<{ success: boolean; error?: string; latencyMs?: number }> {
  const startTime = Date.now();

  try {
    const resolvedConfig = config || getDefaultConfig();

    if (!resolvedConfig) {
      connectionError = 'PostgreSQL: No configuration provided. Set POSTGRES_URL or POSTGRES_* env vars.';
      connected = false;
      return { success: false, error: connectionError };
    }

    if (pool) {
      await pool.end();
    }

    pool = new Pool(getPoolConfig(resolvedConfig));

    // Test the connection
    const result = await pool.query('SELECT version() as version, now() as connected_at');
    const latencyMs = Date.now() - startTime;

    connected = true;
    connectionError = null;

    // Update InfraService in DB
    try {
      const { db } = await import('./db');
      await db.infraService.upsert({
        where: { type: 'postgresql' },
        create: {
          name: 'PostgreSQL',
          type: 'postgresql',
          host: resolvedConfig.host,
          port: resolvedConfig.port,
          status: 'connected',
          connectedAt: new Date(),
          lastPingAt: new Date(),
          latencyMs,
          version: result.rows[0]?.version?.split(',')[0] || 'unknown',
        },
        update: {
          host: resolvedConfig.host,
          port: resolvedConfig.port,
          status: 'connected',
          connectedAt: new Date(),
          lastPingAt: new Date(),
          latencyMs,
          version: result.rows[0]?.version?.split(',')[0] || 'unknown',
          errorCount: 0,
          lastError: null,
        },
      });
    } catch { /* ignore DB update errors */ }

    return { success: true, latencyMs };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    connected = false;
    connectionError = error;
    pool = null;

    try {
      const { db } = await import('./db');
      await db.infraService.upsert({
        where: { type: 'postgresql' },
        create: {
          name: 'PostgreSQL',
          type: 'postgresql',
          status: 'error',
          lastError: error,
          errorCount: 1,
        },
        update: {
          status: 'error',
          lastError: error,
          errorCount: { increment: 1 },
        },
      });
    } catch { /* ignore */ }

    return { success: false, error, latencyMs: Date.now() - startTime };
  }
}

export async function disconnectPostgres(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    connected = false;
  }
}

export function isPostgresConnected(): boolean {
  return connected;
}

export function getPostgresError(): string | null {
  return connectionError;
}

export async function query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
  if (!pool || !connected) {
    throw new Error('PostgreSQL not connected');
  }

  const startTime = Date.now();
  const result = await pool.query(sql, params);
  const latencyMs = Date.now() - startTime;

  try {
    const { db } = await import('./db');
    await db.infraService.update({
      where: { type: 'postgresql' },
      data: { lastPingAt: new Date(), latencyMs },
    });
  } catch { /* ignore */ }

  return { rows: result.rows, rowCount: result.rowCount ?? 0 };
}

export async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!pool || !connected) {
    throw new Error('PostgreSQL not connected');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getPostgresStats(): Promise<{
  connected: boolean;
  database?: string;
  sizeBytes?: bigint;
  activeConnections?: number;
  totalConnections?: number;
  version?: string;
  uptimeSeconds?: number;
}> {
  if (!pool || !connected) {
    return { connected: false };
  }

  try {
    const [dbSize, connections, version, uptime] = await Promise.all([
      pool.query('SELECT pg_database_size(current_database()) as size').catch(() => ({ rows: [] })),
      pool.query('SELECT count(*) as total, sum(CASE WHEN state = \'active\' THEN 1 ELSE 0 END) as active FROM pg_stat_activity WHERE datname = current_database()').catch(() => ({ rows: [] })),
      pool.query('SELECT version() as v').catch(() => ({ rows: [] })),
      pool.query('SELECT extract(epoch from now() - pg_postmaster_start_time()) as uptime').catch(() => ({ rows: [] })),
    ]);

    return {
      connected: true,
      database: pool.options.database,
      sizeBytes: dbSize.rows[0]?.size ? BigInt(dbSize.rows[0].size) : undefined,
      activeConnections: Number(connections.rows[0]?.active || 0),
      totalConnections: Number(connections.rows[0]?.total || 0),
      version: version.rows[0]?.v?.split(',')[0] || 'unknown',
      uptimeSeconds: Number(uptime.rows[0]?.uptime || 0),
    };
  } catch {
    return { connected: true };
  }
}

export async function pingPostgres(): Promise<{ success: boolean; latencyMs: number; error?: string }> {
  if (!pool || !connected) {
    return { success: false, latencyMs: 0, error: 'Not connected' };
  }

  const startTime = Date.now();
  try {
    await pool.query('SELECT 1');
    const latencyMs = Date.now() - startTime;

    try {
      const { db } = await import('./db');
      await db.infraService.update({
        where: { type: 'postgresql' },
        data: { lastPingAt: new Date(), latencyMs, status: 'connected' },
      });
    } catch { /* ignore */ }

    return { success: true, latencyMs };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    try {
      const { db } = await import('./db');
      await db.infraService.update({
        where: { type: 'postgresql' },
        data: { status: 'error', lastError: error, errorCount: { increment: 1 } },
      });
    } catch { /* ignore */ }
    return { success: false, latencyMs: Date.now() - startTime, error };
  }
}

function getDefaultConfig(): PostgresConfig | null {
  // Support POSTGRES_URL connection string
  if (process.env.POSTGRES_URL) {
    try {
      const url = new URL(process.env.POSTGRES_URL);
      return {
        host: url.hostname,
        port: parseInt(url.port || '5432', 10),
        database: url.pathname.slice(1),
        user: url.username,
        password: url.password,
        ssl: url.protocol === 'postgres+ssl:' || process.env.POSTGRES_SSL === 'true',
      };
    } catch {
      return null;
    }
  }

  // Support individual env vars
  if (process.env.POSTGRES_HOST) {
    return {
      host: process.env.POSTGRES_HOST,
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      database: process.env.POSTGRES_DB || 'agent_hub',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || '',
      ssl: process.env.POSTGRES_SSL === 'true',
      maxConnections: parseInt(process.env.POSTGRES_POOL_SIZE || '10', 10),
    };
  }

  return null;
}

export function getPostgresConfig(): PostgresConfig | null {
  return getDefaultConfig();
}