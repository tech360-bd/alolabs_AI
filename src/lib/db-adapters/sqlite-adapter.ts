/**
 * SQLite Adapter
 * ALO Labs AIOS — Database adapter for development use.
 * Wraps the existing Prisma SQLite setup with the BaseDatabaseAdapter interface.
 * Stores database files in the db/ directory.
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

import { createRequire } from 'node:module';
import { join } from 'path';

// ─── Helpers ────────────────────────────────────────────────────────

function getDbPath(config: DatabaseConfig): string {
  if (config.url) {
    return config.url.startsWith('file:') ? config.url.slice(5) : config.url;
  }
  if (config.database) {
    return config.database;
  }
  return join(process.cwd(), 'db', 'dev.db');
}

// ─── Adapter ────────────────────────────────────────────────────────

export class SQLiteAdapter implements BaseDatabaseAdapter {
  readonly type = 'sqlite' as const;
  private config: DatabaseConfig;
  private _db: any = null;
  private _connected = false;
  private _version = '';

  constructor(config?: DatabaseConfig) {
    this.config = config ?? {
      type: 'sqlite',
      database: join(process.cwd(), 'db', 'dev.db'),
    };
  }

  get connected(): boolean {
    return this._connected;
  }

  // ─── Pool Info (SQLite is single-connection) ──────────────────

  readonly pool = {
    getSize: (): number => {
      return (this as unknown as { _connected: boolean })._connected ? 1 : 0;
    },
    getActive: (): number => {
      return (this as unknown as { _connected: boolean })._connected ? 1 : 0;
    },
    getIdle: (): number => 0,
  };

  // ─── Connect ────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this._connected) return;

    const dbPath = getDbPath(this.config);

    try {
      const req = createRequire(join(process.cwd(), 'package.json'));
      const Database = req('better-sqlite3');

      this._db = new Database(dbPath);
      this._db.pragma('journal_mode = WAL');
      this._db.pragma('foreign_keys = ON');

      try {
        const result = this._db.pragma('compile_options');
        if (Array.isArray(result)) {
          this._version = `SQLite (better-sqlite3)`;
        }
      } catch {
        this._version = 'SQLite';
      }

      this._connected = true;
    } catch (err) {
      this._db = null;
      throw new DatabaseConnectionError(
        'sqlite',
        new Error(
          `Failed to connect to SQLite at "${dbPath}": ${err instanceof Error ? err.message : String(err)}. Install better-sqlite3: npm install better-sqlite3`,
        ),
      );
    }
  }

  // ─── Disconnect ─────────────────────────────────────────────────

  async disconnect(): Promise<void> {
    if (this._db) {
      try {
        this._db.close();
      } catch {
        // Best-effort close
      }
      this._db = null;
    }
    this._connected = false;
  }

  // ─── Query ──────────────────────────────────────────────────────

  async query<T>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    this.requireConnection();

    const startTime = Date.now();

    try {
      const stmt = this._db.prepare(sql);

      const isSelect = sql.trimStart().toUpperCase().startsWith('SELECT');
      if (isSelect) {
        const rows = stmt.all(...params) as T[];
        return {
          rows,
          rowCount: rows.length,
          duration: Date.now() - startTime,
        };
      } else {
        const result = stmt.run(...params);
        return {
          rows: [] as T[],
          rowCount: (result as { changes: number }).changes ?? 0,
          duration: Date.now() - startTime,
        };
      }
    } catch (err) {
      throw new DatabaseAdapterError(
        `Query failed: ${err instanceof Error ? err.message : String(err)}`,
        'sqlite',
        err,
      );
    }
  }

  // ─── Transaction ────────────────────────────────────────────────

  async transaction<T>(fn: (client: BaseDatabaseAdapter) => Promise<T>): Promise<T> {
    this.requireConnection();

    return this._db.transaction(() => {
      const txClient = new SQLiteTransactionClient(this._db);
      return fn(txClient);
    })();
  }

  // ─── Migrate ────────────────────────────────────────────────────

  async migrate(migrations: MigrationStep[]): Promise<void> {
    this.requireConnection();

    this._db.exec(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        version TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT DEFAULT (datetime('now'))
      )
    `);

    const applied = this._db
      .prepare('SELECT version FROM _schema_migrations ORDER BY version')
      .all() as Array<{ version: string }>;
    const appliedVersions = new Set(applied.map((r) => r.version));

    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) continue;

      try {
        this._db.transaction(() => {
          this._db.exec(migration.up);
          this._db
            .prepare(
              'INSERT INTO _schema_migrations (version, name) VALUES (?, ?)',
            )
            .run(migration.version, migration.name);
        })();
      } catch (err) {
        throw new MigrationError('sqlite', migration.version, err);
      }
    }
  }

  // ─── Health Check ───────────────────────────────────────────────

  async healthCheck(): Promise<DatabaseHealth> {
    const startTime = Date.now();

    if (!this._connected || !this._db) {
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
      this._db.prepare('SELECT 1').get();
      return {
        connected: true,
        latencyMs: Date.now() - startTime,
        poolSize: 1,
        activeConnections: 1,
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
    if (!this._connected || !this._db) {
      throw new DatabaseAdapterError(
        'SQLite adapter is not connected. Call connect() first.',
        'sqlite',
      );
    }
  }
}

// ─── Transaction Client Wrapper ─────────────────────────────────────

class SQLiteTransactionClient implements BaseDatabaseAdapter {
  readonly type = 'sqlite' as const;

  readonly pool = {
    getSize: () => 0,
    getActive: () => 0,
    getIdle: () => 0,
  };

  constructor(private db: any) {}

  async connect(): Promise<void> {
    throw new DatabaseAdapterError(
      'Transaction client cannot connect independently.',
      'sqlite',
    );
  }

  async disconnect(): Promise<void> {
    throw new DatabaseAdapterError(
      'Transaction client cannot disconnect independently.',
      'sqlite',
    );
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const startTime = Date.now();
    const stmt = this.db.prepare(sql);

    const isSelect = sql.trimStart().toUpperCase().startsWith('SELECT');
    if (isSelect) {
      const rows = stmt.all(...params) as T[];
      return {
        rows,
        rowCount: rows.length,
        duration: Date.now() - startTime,
      };
    } else {
      const result = stmt.run(...params);
      return {
        rows: [] as T[],
        rowCount: (result as { changes: number }).changes ?? 0,
        duration: Date.now() - startTime,
      };
    }
  }

  async transaction<T>(fn: (client: BaseDatabaseAdapter) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async migrate(_migrations: MigrationStep[]): Promise<void> {
    throw new DatabaseAdapterError(
      'Migrations cannot be run inside a transaction.',
      'sqlite',
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