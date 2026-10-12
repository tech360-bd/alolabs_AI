/**
 * PostgreSQL Adapter
 * ALO Labs AIOS — Database adapter using pg with connection pooling.
 * Reads configuration from POSTGRES_* environment variables or a provided config.
 */

import type {
  DatabaseConfig,
  DatabaseHealth,
  QueryResult,
  MigrationStep,
  BaseDatabaseAdapter,
} from './types';
import {
  DatabaseAdapterError,
  DatabaseConnectionError,
  MigrationError,
} from './types';

// ─── Dynamic pg types ───────────────────────────────────────────────

interface PgPoolLike {
  query(sql: string, params?: unknown[]): Promise<{
    rows: unknown[];
    rowCount: number | null;
  }>;
  connect(): Promise<PgPoolClientLike>;
  end(): Promise<void>;
  totalCount: number;
  idleCount: number;
}

interface PgPoolClientLike {
  query(sql: string, params?: unknown[]): Promise<{
    rows: unknown[];
    rowCount: number | null;
  }>;
  release(): void;
}

// ─── Helpers ────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build a connection string from individual environment variables.
 */
function buildConnectionString(config: DatabaseConfig): string {
  if (config.url) return config.url;

  const host = config.host ?? process.env.POSTGRES_HOST ?? '127.0.0.1';
  const port = config.port ?? parseInt(process.env.POSTGRES_PORT ?? '5432', 10);
  const database = config.database ?? process.env.POSTGRES_DB ?? 'aios';
  const user = config.user ?? process.env.POSTGRES_USER ?? 'postgres';
  const password = config.password ?? process.env.POSTGRES_PASSWORD ?? '';
  const ssl = config.ssl ?? process.env.POSTGRES_SSL === 'true';

  const auth = password ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}` : user;
  const sslParam = ssl ? '?sslmode=require' : '';
  return `postgresql://${auth}@${host}:${port}/${database}${sslParam}`;
}

// ─── Adapter ────────────────────────────────────────────────────────

export class PostgreSQLAdapter implements BaseDatabaseAdapter {
  readonly type = 'postgresql' as const;
  private config: DatabaseConfig;
  private _pool: PgPoolLike | null = null;
  private _connected = false;
  private _version = '';

  constructor(config?: DatabaseConfig) {
    this.config = config ?? {
      type: 'postgresql',
      host: process.env.POSTGRES_HOST ?? '127.0.0.1',
      port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
      database: process.env.POSTGRES_DB ?? 'aios',
      user: process.env.POSTGRES_USER ?? 'postgres',
      password: process.env.POSTGRES_PASSWORD ?? '',
      ssl: process.env.POSTGRES_SSL === 'true',
      pool: { min: 2, max: 10 },
    };
  }

  get connected(): boolean {
    return this._connected;
  }

  // ─── Pool Info ──────────────────────────────────────────────────

  readonly pool = {
    getSize: (): number => {
      const p = (this as unknown as { _pool: PgPoolLike | null })._pool;
      return p ? p.totalCount : 0;
    },
    getActive: (): number => {
      const p = (this as unknown as { _pool: PgPoolLike | null })._pool;
      if (!p) return 0;
      return p.totalCount - p.idleCount;
    },
    getIdle: (): number => {
      const p = (this as unknown as { _pool: PgPoolLike | null })._pool;
      return p ? p.idleCount : 0;
    },
  };

  // ─── Connect ────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this._connected) return;

    let PoolClass: new (config: Record<string, unknown>) => PgPoolLike;

    try {
      const pgModule = await import('pg');
      PoolClass = pgModule.Pool;
    } catch {
      throw new DatabaseConnectionError(
        'postgresql',
        new Error('pg package is not installed. Install it with: npm install pg'),
      );
    }

    const connectionString = buildConnectionString(this.config);

    try {
      this._pool = new PoolClass({
        connectionString,
        ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined,
        max: this.config.pool?.max ?? 10,
        min: this.config.pool?.min ?? 2,
        connectionTimeoutMillis: 5_000,
        idleTimeoutMillis: 30_000,
        allowExitOnIdle: true,
      } as unknown as Record<string, unknown>);

      // Test connection and fetch version
      const result = await this._pool.query('SELECT version() as v');
      const rows = result.rows as Array<Record<string, unknown>>;
      const v = rows[0]?.v;
      this._version = typeof v === 'string' ? v.split(',')[0] : 'unknown';
      this._connected = true;
    } catch (err) {
      this._pool = null;
      throw new DatabaseConnectionError('postgresql', err);
    }
  }

  // ─── Disconnect ─────────────────────────────────────────────────

  async disconnect(): Promise<void> {
    if (this._pool) {
      try {
        await this._pool.end();
      } catch {
        // Best-effort close
      }
      this._pool = null;
    }
    this._connected = false;
  }

  // ─── Query ──────────────────────────────────────────────────────

  async query<T>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    this.requireConnection();

    const startTime = Date.now();

    try {
      const result = await this._pool!.query(sql, params);
      const rows = result.rows as T[];
      const duration = Date.now() - startTime;

      return {
        rows,
        rowCount: result.rowCount ?? rows.length,
        duration,
      };
    } catch (err) {
      if (isConnectionLost(err)) {
        await this.attemptReconnect();
        return this.query<T>(sql, params);
      }
      throw new DatabaseAdapterError(
        `Query failed: ${err instanceof Error ? err.message : String(err)}`,
        'postgresql',
        err,
      );
    }
  }

  // ─── Transaction ────────────────────────────────────────────────

  async transaction<T>(fn: (client: BaseDatabaseAdapter) => Promise<T>): Promise<T> {
    this.requireConnection();

    const connection = await this._pool!.connect();
    try {
      await connection.query('BEGIN');
      const txClient = new PgTransactionClient(connection);
      const result = await fn(txClient);
      await connection.query('COMMIT');
      return result;
    } catch (err) {
      await connection.query('ROLLBACK');
      throw err;
    } finally {
      connection.release();
    }
  }

  // ─── Migrate ────────────────────────────────────────────────────

  async migrate(migrations: MigrationStep[]): Promise<void> {
    this.requireConnection();

    await this._pool!.query(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const applied = await this._pool!.query(
      'SELECT version FROM _schema_migrations ORDER BY version',
    );
    const appliedVersions = new Set(
      (applied.rows as Record<string, string>[]).map((r) => r.version),
    );

    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) continue;

      const client = await this._pool!.connect();
      try {
        await client.query('BEGIN');
        await client.query(migration.up);
        await client.query(
          'INSERT INTO _schema_migrations (version, name) VALUES ($1, $2)',
          [migration.version, migration.name],
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new MigrationError('postgresql', migration.version, err);
      } finally {
        client.release();
      }
    }
  }

  // ─── Health Check ───────────────────────────────────────────────

  async healthCheck(): Promise<DatabaseHealth> {
    const startTime = Date.now();

    if (!this._connected || !this._pool) {
      return {
        connected: false,
        latencyMs: 0,
        poolSize: 0,
        activeConnections: 0,
        version: '',
        error: 'Not connected',
      };
    }

    try {
      await this._pool!.query('SELECT 1');
      const latencyMs = Date.now() - startTime;

      return {
        connected: true,
        latencyMs,
        poolSize: this._pool.totalCount,
        activeConnections: this._pool.totalCount - this._pool.idleCount,
        version: this._version,
      };
    } catch (err) {
      return {
        connected: false,
        latencyMs: Date.now() - startTime,
        poolSize: 0,
        activeConnections: 0,
        version: this._version,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ─── Private ────────────────────────────────────────────────────

  private requireConnection(): void {
    if (!this._connected || !this._pool) {
      throw new DatabaseAdapterError(
        'PostgreSQL adapter is not connected. Call connect() first.',
        'postgresql',
      );
    }
  }

  private async attemptReconnect(): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.disconnect();
        await sleep(500 * (attempt + 1));
        await this.connect();
        return;
      } catch {
        continue;
      }
    }
    throw new DatabaseAdapterError(
      'Auto-reconnect failed after 3 attempts.',
      'postgresql',
    );
  }
}

// ─── Transaction Client Wrapper ─────────────────────────────────────

class PgTransactionClient implements BaseDatabaseAdapter {
  readonly type = 'postgresql' as const;

  readonly pool = {
    getSize: () => 0,
    getActive: () => 0,
    getIdle: () => 0,
  };

  constructor(private connection: PgPoolClientLike) {}

  async connect(): Promise<void> {
    throw new DatabaseAdapterError(
      'Transaction client cannot connect independently.',
      'postgresql',
    );
  }

  async disconnect(): Promise<void> {
    throw new DatabaseAdapterError(
      'Transaction client cannot disconnect independently.',
      'postgresql',
    );
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const startTime = Date.now();
    const result = await this.connection.query(sql, params);
    const rows = result.rows as T[];
    return {
      rows,
      rowCount: result.rowCount ?? rows.length,
      duration: Date.now() - startTime,
    };
  }

  async transaction<T>(fn: (client: BaseDatabaseAdapter) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async migrate(_migrations: MigrationStep[]): Promise<void> {
    throw new DatabaseAdapterError(
      'Migrations cannot be run inside a transaction.',
      'postgresql',
    );
  }

  async healthCheck(): Promise<DatabaseHealth> {
    return {
      connected: true,
      latencyMs: 0,
      poolSize: 0,
      activeConnections: 1,
      version: '',
    };
  }
}

// ─── Connection Error Detection ─────────────────────────────────────

function isConnectionLost(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('connection ') ||
      msg.includes('terminated') ||
      msg.includes('etimedout') ||
      msg.includes('too many clients') ||
      msg.includes('pool') ||
      msg.includes('socket hang up')
    );
  }
  return false;
}