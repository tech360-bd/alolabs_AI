/**
 * MySQL / MariaDB Adapter
 * ALO Labs AIOS — Database adapter using mysql2/promise with connection pooling.
 * Uses dynamic import with graceful fallback when mysql2 is not installed.
 */

import type {
  DatabaseType,
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

// ─── Dynamic mysql2 types ───────────────────────────────────────────

/** Minimal type for the mysql2/promise connection pool. */
interface MySQLPoolLike {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; affectedRows?: number; insertId?: number }>;
  execute(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; affectedRows?: number; insertId?: number; [key: string]: unknown }>;
  getConnection(): Promise<MySQLPoolConnectionLike>;
  end(): Promise<void>;
  pool: {
    _allConnections: unknown[];
    _freeConnections: unknown[];
    _connectionLimit: number;
    _minConnections?: number;
  };
}

interface MySQLPoolConnectionLike {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; affectedRows?: number; insertId?: number }>;
  execute(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; affectedRows?: number; insertId?: number; [key: string]: unknown }>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}

// ─── Helpers ────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildConnectionConfig(config: DatabaseConfig): Record<string, unknown> {
  if (config.url) {
    return { uri: config.url };
  }

  return {
    host: config.host ?? '127.0.0.1',
    port: config.port ?? 3306,
    user: config.user ?? 'root',
    password: config.password ?? '',
    database: config.database ?? 'aios',
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    waitForConnections: true,
    connectionLimit: config.pool?.max ?? 10,
    minPoolSize: config.pool?.min ?? 2,
    enableKeepAlive: true,
    keepAliveInitialDelay: 30_000,
    idleTimeout: 600_000,
  };
}

// ─── Adapter ────────────────────────────────────────────────────────

export class MySQLAdapter implements BaseDatabaseAdapter {
  readonly type: DatabaseType = 'mysql';
  private config: DatabaseConfig;
  private _connectionPool: MySQLPoolLike | null = null;
  private _connected = false;
  private _version = '';
  private mysql2Module: any = null;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  get connected(): boolean {
    return this._connected;
  }

  // ─── Pool Info (satisfies BaseDatabaseAdapter.pool) ──────────────

  readonly pool = {
    getSize: (): number => {
      const cp = (this as unknown as { _connectionPool: MySQLPoolLike | null })._connectionPool;
      if (!cp) return 0;
      return cp.pool._allConnections?.length ?? 0;
    },
    getActive: (): number => {
      const cp = (this as unknown as { _connectionPool: MySQLPoolLike | null })._connectionPool;
      if (!cp) return 0;
      const total = cp.pool._allConnections?.length ?? 0;
      const idle = cp.pool._freeConnections?.length ?? 0;
      return total - idle;
    },
    getIdle: (): number => {
      const cp = (this as unknown as { _connectionPool: MySQLPoolLike | null })._connectionPool;
      if (!cp) return 0;
      return cp.pool._freeConnections?.length ?? 0;
    },
  };

  // ─── Connect ────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this._connected) return;

    // Dynamic import — graceful fallback
    try {
      this.mysql2Module = await import('mysql2/promise');
    } catch {
      throw new DatabaseConnectionError(
        this.config.type,
        new Error(
          'mysql2 package is not installed. Install it with: npm install mysql2',
        ),
      );
    }

    const createPool = this.mysql2Module.createPool;
    const connConfig = buildConnectionConfig(this.config);

    try {
      this._connectionPool = createPool(connConfig) as unknown as MySQLPoolLike;

      // Test connection and fetch version
      const result = await this._connectionPool.query('SELECT VERSION() as version');
      const rows = result.rows as Record<string, unknown>[];
      this._version = String(rows[0]?.version ?? 'unknown');
      this._connected = true;
    } catch (err) {
      this._connectionPool = null;
      throw new DatabaseConnectionError(this.config.type, err);
    }
  }

  // ─── Disconnect ─────────────────────────────────────────────────

  async disconnect(): Promise<void> {
    if (this._connectionPool) {
      try {
        await this._connectionPool.end();
      } catch {
        // Best-effort close
      }
      this._connectionPool = null;
    }
    this._connected = false;
  }

  // ─── Query ──────────────────────────────────────────────────────

  async query<T>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    this.requireConnection();

    const startTime = Date.now();

    try {
      const result = await this._connectionPool!.execute(sql, params);
      const rows = (result as { rows: unknown[] }).rows as T[];
      const duration = Date.now() - startTime;

      return {
        rows,
        rowCount: rows.length,
        duration,
      };
    } catch (err) {
      // Attempt auto-reconnect on connection loss
      if (isConnectionLost(err)) {
        await this.attemptReconnect();
        return this.query<T>(sql, params);
      }
      throw new DatabaseAdapterError(
        `Query failed: ${err instanceof Error ? err.message : String(err)}`,
        this.config.type,
        err,
      );
    }
  }

  // ─── Transaction ────────────────────────────────────────────────

  async transaction<T>(fn: (client: BaseDatabaseAdapter) => Promise<T>): Promise<T> {
    this.requireConnection();

    const connection = await this._connectionPool!.getConnection();
    try {
      await connection.beginTransaction();
      const txClient = new MySQLTransactionClient(connection, this.config.type);
      const result = await fn(txClient);
      await connection.commit();
      return result;
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  // ─── Migrate ────────────────────────────────────────────────────

  async migrate(migrations: MigrationStep[]): Promise<void> {
    this.requireConnection();

    // Ensure migrations table exists
    await this._connectionPool!.execute(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Fetch already-applied migrations
    const applied = await this._connectionPool!.query(
      'SELECT version FROM _schema_migrations ORDER BY version',
    );
    const appliedVersions = new Set(
      (applied.rows as Record<string, string>[]).map((r) => r.version),
    );

    // Apply pending migrations in order
    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) continue;

      try {
        const conn = await this._connectionPool!.getConnection();
        try {
          await conn.beginTransaction();
          await conn.execute(migration.up);
          await conn.execute(
            'INSERT INTO _schema_migrations (version, name) VALUES (?, ?)',
            [migration.version, migration.name],
          );
          await conn.commit();
        } catch (err) {
          await conn.rollback();
          throw new MigrationError(this.config.type, migration.version, err);
        } finally {
          conn.release();
        }
      } catch (err) {
        if (err instanceof MigrationError) throw err;
        throw new MigrationError(this.config.type, migration.version, err);
      }
    }
  }

  // ─── Health Check ───────────────────────────────────────────────

  async healthCheck(): Promise<DatabaseHealth> {
    const startTime = Date.now();

    if (!this._connected || !this._connectionPool) {
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
      await this._connectionPool.query('SELECT 1');
      const latencyMs = Date.now() - startTime;

      const cp = this._connectionPool;
      const total = cp.pool._allConnections?.length ?? 0;
      const idle = cp.pool._freeConnections?.length ?? 0;

      return {
        connected: true,
        latencyMs,
        poolSize: total,
        activeConnections: total - idle,
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
    if (!this._connected || !this._connectionPool) {
      throw new DatabaseAdapterError(
        'MySQL adapter is not connected. Call connect() first.',
        this.config.type,
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
      this.config.type,
    );
  }
}

// ─── Transaction Client Wrapper ─────────────────────────────────────

class MySQLTransactionClient implements BaseDatabaseAdapter {
  readonly type: DatabaseType;

  readonly pool = {
    getSize: () => 0,
    getActive: () => 0,
    getIdle: () => 0,
  };

  constructor(
    private connection: MySQLPoolConnectionLike,
    dbType: DatabaseType,
  ) {
    this.type = dbType;
  }

  async connect(): Promise<void> {
    throw new DatabaseAdapterError('Transaction client cannot connect independently.', this.type);
  }

  async disconnect(): Promise<void> {
    throw new DatabaseAdapterError('Transaction client cannot disconnect independently.', this.type);
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const startTime = Date.now();
    const result = await this.connection.execute(sql, params);
    const rows = (result as { rows: unknown[] }).rows as T[];
    return {
      rows,
      rowCount: rows.length,
      duration: Date.now() - startTime,
    };
  }

  async transaction<T>(fn: (client: BaseDatabaseAdapter) => Promise<T>): Promise<T> {
    // Nested transactions are not supported — run in the same transaction
    return fn(this);
  }

  async migrate(_migrations: MigrationStep[]): Promise<void> {
    throw new DatabaseAdapterError(
      'Migrations cannot be run inside a transaction.',
      this.type,
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
    const codes = [
      'econnreset',
      'econnrefused',
      'protocol_connection_lost',
      'conn_refused',
      'not_connected',
      'etimedout',
      'fatal',
    ];
    return codes.some((c) => msg.includes(c));
  }
  return false;
}