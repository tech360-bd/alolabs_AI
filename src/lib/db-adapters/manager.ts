/**
 * Database Adapter Manager
 * ALO Labs AIOS — Multi-database support with automatic environment-based
 * configuration, health monitoring, and unified migration execution.
 */

import { createRequire } from 'node:module';
import type {
  DatabaseType,
  DatabaseConfig,
  DatabaseHealth,
  QueryResult,
  MigrationStep,
  BaseDatabaseAdapter,
} from './types';
import { DatabaseAdapterError } from './types';
import { MySQLAdapter } from './mysql-adapter';

// ─── Adapter Registry Entry ─────────────────────────────────────────

interface AdapterEntry {
  name: string;
  adapter: BaseDatabaseAdapter;
  isPrimary: boolean;
}

// ─── Manager ────────────────────────────────────────────────────────

export class DatabaseManager {
  private adapters = new Map<string, AdapterEntry>();
  private primaryName: string | null = null;
  private _autoConfigured = false;

  // ─── Auto-Configuration ─────────────────────────────────────────

  /**
   * Reads environment variables and automatically registers adapters.
   * - DATABASE_URL=file:...  → SQLite (adapter name: 'primary')
   * - DATABASE_URL=postgresql:... → PostgreSQL (adapter name: 'primary')
   * - DATABASE_URL=mysql:... → MySQL (adapter name: 'primary')
   * - POSTGRES_URL=... → also registers as 'analytics' adapter
   */
  async autoConfigure(): Promise<void> {
    if (this._autoConfigured) return;

    const databaseUrl = process.env.DATABASE_URL;
    const postgresUrl = process.env.POSTGRES_URL;

    if (databaseUrl) {
      const { type, config } = parseDatabaseUrl(databaseUrl);
      if (config) {
        await this.registerAdapter('primary', config);
        this.switchPrimary('primary');
      }
    }

    if (postgresUrl && postgresUrl !== databaseUrl) {
      const { type: _type, config } = parseDatabaseUrl(postgresUrl);
      if (config) {
        await this.registerAdapter('analytics', config);
      }
    }

    this._autoConfigured = true;
  }

  // ─── Adapter Registration ───────────────────────────────────────

  async registerAdapter(name: string, config: DatabaseConfig): Promise<void> {
    if (this.adapters.has(name)) {
      throw new DatabaseAdapterError(
        `Database adapter "${name}" is already registered.`,
        config.type,
      );
    }

    const adapter = this.createAdapter(config);
    this.adapters.set(name, { name, adapter, isPrimary: false });

    // Automatically set the first registered adapter as primary
    if (!this.primaryName) {
      this.switchPrimary(name);
    }
  }

  /**
   * Register a pre-constructed adapter (useful for testing or custom adapters).
   */
  registerAdapterInstance(name: string, adapter: BaseDatabaseAdapter): void {
    if (this.adapters.has(name)) {
      throw new DatabaseAdapterError(
        `Database adapter "${name}" is already registered.`,
        adapter.type,
      );
    }
    this.adapters.set(name, { name, adapter, isPrimary: false });

    if (!this.primaryName) {
      this.switchPrimary(name);
    }
  }

  // ─── Adapter Access ─────────────────────────────────────────────

  getAdapter(name?: string): BaseDatabaseAdapter {
    const key = name ?? this.primaryName ?? 'primary';
    const entry = this.adapters.get(key);

    if (!entry) {
      throw new DatabaseAdapterError(
        `Database adapter "${key}" is not registered.`,
        key === 'primary' ? 'sqlite' : 'postgresql',
      );
    }

    return entry.adapter;
  }

  getAdapterNames(): string[] {
    return Array.from(this.adapters.keys());
  }

  getPrimaryName(): string | null {
    return this.primaryName;
  }

  // ─── Primary Switching ──────────────────────────────────────────

  switchPrimary(name: string): void {
    const entry = this.adapters.get(name);
    if (!entry) {
      throw new DatabaseAdapterError(
        `Cannot switch primary to "${name}": adapter not registered.`,
        'postgresql',
      );
    }

    // Demote current primary
    if (this.primaryName) {
      const current = this.adapters.get(this.primaryName);
      if (current) current.isPrimary = false;
    }

    // Promote new primary
    entry.isPrimary = true;
    this.primaryName = name;
  }

  // ─── Health Checks ──────────────────────────────────────────────

  async healthCheckAll(): Promise<Map<string, DatabaseHealth>> {
    const results = new Map<string, DatabaseHealth>();

    const checks = Array.from(this.adapters.entries()).map(
      async ([name, entry]) => {
        try {
          const health = await entry.adapter.healthCheck();
          results.set(name, health);
        } catch (err) {
          results.set(name, {
            connected: false,
            latencyMs: 0,
            poolSize: 0,
            activeConnections: 0,
            version: '',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
    );

    await Promise.all(checks);
    return results;
  }

  async healthCheck(name: string): Promise<DatabaseHealth> {
    const entry = this.adapters.get(name);
    if (!entry) {
      throw new DatabaseAdapterError(
        `Database adapter "${name}" is not registered.`,
        'postgresql',
      );
    }
    return entry.adapter.healthCheck();
  }

  // ─── Migrations ─────────────────────────────────────────────────

  async migrateAll(migrations: MigrationStep[]): Promise<void> {
    const errors: { name: string; error: unknown }[] = [];

    const ops = Array.from(this.adapters.entries()).map(
      async ([name, entry]) => {
        try {
          await entry.adapter.migrate(migrations);
        } catch (err) {
          errors.push({ name, error: err });
        }
      },
    );

    await Promise.all(ops);

    if (errors.length > 0) {
      const details = errors
        .map((e) => `  - ${e.name}: ${e.error instanceof Error ? e.error.message : String(e.error)}`)
        .join('\n');
      throw new DatabaseAdapterError(
        `Migrations failed on ${errors.length} adapter(s):\n${details}`,
        'postgresql',
      );
    }
  }

  async migrate(name: string, migrations: MigrationStep[]): Promise<void> {
    const entry = this.adapters.get(name);
    if (!entry) {
      throw new DatabaseAdapterError(
        `Database adapter "${name}" is not registered.`,
        'postgresql',
      );
    }
    await entry.adapter.migrate(migrations);
  }

  // ─── Backup ─────────────────────────────────────────────────────

  async backup(adapterName?: string): Promise<Buffer> {
    const key = adapterName ?? this.primaryName ?? 'primary';
    const entry = this.adapters.get(key);

    if (!entry) {
      throw new DatabaseAdapterError(
        `Database adapter "${key}" is not registered.`,
        'postgresql',
      );
    }

    const adapter = entry.adapter;

    switch (adapter.type) {
      case 'mysql':
      case 'mariadb':
        return this.backupMySQL(adapter);

      case 'postgresql':
      case 'sqlite':
        return this.backupSQL(adapter);

      default: {
        const _exhaustive: never = adapter.type;
        throw new DatabaseAdapterError(
          `Backup not supported for database type "${adapter.type}".`,
          adapter.type,
        );
      }
    }
  }

  // ─── Close All ──────────────────────────────────────────────────

  async closeAll(): Promise<void> {
    const ops = Array.from(this.adapters.values()).map((entry) =>
      entry.adapter.disconnect().catch(() => {
        /* best-effort */
      }),
    );
    await Promise.all(ops);
    this.adapters.clear();
    this.primaryName = null;
    this._autoConfigured = false;
  }

  // ─── Private: Adapter Factory ───────────────────────────────────

  private createAdapter(config: DatabaseConfig): BaseDatabaseAdapter {
    switch (config.type) {
      case 'mysql':
      case 'mariadb':
        return new MySQLAdapter(config);

      case 'postgresql':
        return this.createPostgreSQLAdapter(config);

      case 'sqlite':
        return this.createSQLiteAdapter(config);

      default: {
        const _exhaustive: never = config.type;
        throw new DatabaseAdapterError(
          `Unsupported database type: "${config.type}"`,
          config.type,
        );
      }
    }
  }

  // ─── Private: PostgreSQL Inline Adapter ─────────────────────────

  /**
   * Create a PostgreSQL adapter wrapping the pg Pool.
   * Reuses the same patterns as the existing src/lib/postgres.ts.
   */
  private createPostgreSQLAdapter(config: DatabaseConfig): BaseDatabaseAdapter {
    let pool: any = null;
    let connected = false;
    let version = '';

    return {
      type: 'postgresql',

      pool: {
        getSize: () => (pool ? (pool.totalCount ?? 0) : 0),
        getActive: () => {
          if (!pool) return 0;
          return (pool.totalCount ?? 0) - (pool.idleCount ?? 0);
        },
        getIdle: () => (pool ? (pool.idleCount ?? 0) : 0),
      },

      async connect(): Promise<void> {
        if (connected) return;
        const { Pool } = await import('pg');
        pool = new Pool({
          host: config.host ?? '127.0.0.1',
          port: config.port ?? 5432,
          database: config.database ?? 'aios',
          user: config.user ?? 'postgres',
          password: config.password ?? '',
          ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
          max: config.pool?.max ?? 10,
          connectionTimeoutMillis: 5_000,
          allowExitOnIdle: true,
        });
        const result = await pool.query('SELECT version() as v');
        version = result.rows[0]?.v?.split(',')[0] ?? 'unknown';
        connected = true;
      },

      async disconnect(): Promise<void> {
        if (pool) {
          await pool.end();
          pool = null;
        }
        connected = false;
      },

      async query<T>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
        if (!pool || !connected) {
          throw new DatabaseAdapterError('PostgreSQL adapter is not connected.', 'postgresql');
        }
        const startTime = Date.now();
        const result = await pool.query(sql, params);
        return {
          rows: result.rows as T[],
          rowCount: result.rowCount ?? 0,
          duration: Date.now() - startTime,
        };
      },

      async transaction<T>(fn: (client: BaseDatabaseAdapter) => Promise<T>): Promise<T> {
        if (!pool || !connected) {
          throw new DatabaseAdapterError('PostgreSQL adapter is not connected.', 'postgresql');
        }
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const txClient = createTransactionClient('postgresql', client);
          const result = await fn(txClient);
          await client.query('COMMIT');
          return result;
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      },

      async migrate(migrations: MigrationStep[]): Promise<void> {
        if (!pool || !connected) {
          throw new DatabaseAdapterError('PostgreSQL adapter is not connected.', 'postgresql');
        }

        await pool.query(`
          CREATE TABLE IF NOT EXISTS _schema_migrations (
            version VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        const applied = await pool.query('SELECT version FROM _schema_migrations ORDER BY version');
        const appliedVersions = new Set(
          (applied.rows as Array<{ version: string }>).map((r) => r.version),
        );

        for (const migration of migrations) {
          if (appliedVersions.has(migration.version)) continue;

          const client = await pool.connect();
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
            throw new DatabaseAdapterError(
              `Migration "${migration.version}" failed on PostgreSQL`,
              'postgresql',
              err,
            );
          } finally {
            client.release();
          }
        }
      },

      async healthCheck(): Promise<DatabaseHealth> {
        const startTime = Date.now();
        if (!pool || !connected) {
          return { connected: false, latencyMs: 0, poolSize: 0, activeConnections: 0, version: '' };
        }
        try {
          await pool.query('SELECT 1');
          return {
            connected: true,
            latencyMs: Date.now() - startTime,
            poolSize: pool.totalCount ?? 0,
            activeConnections: (pool.totalCount ?? 0) - (pool.idleCount ?? 0),
            version,
          };
        } catch (err) {
          return {
            connected: false,
            latencyMs: Date.now() - startTime,
            poolSize: 0,
            activeConnections: 0,
            version,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    };
  }

  // ─── Private: SQLite Inline Adapter ─────────────────────────────

  /**
   * Create a SQLite adapter using dynamic import of better-sqlite3.
   */
  private createSQLiteAdapter(config: DatabaseConfig): BaseDatabaseAdapter {
    let db: any = null;
    let connected = false;
    let version = '';

    return {
      type: 'sqlite',

      pool: {
        getSize: () => (connected ? 1 : 0),
        getActive: () => (connected ? 1 : 0),
        getIdle: () => 0,
      },

      async connect(): Promise<void> {
        if (connected) return;

        try {
          const req = createRequire(`${process.cwd()}/package.json`);
          const Database = req('better-sqlite3');
          const dbPath = config.url
            ? config.url.replace('file:', '')
            : config.database ?? ':memory:';
          db = new Database(dbPath);
          db.pragma('journal_mode = WAL');
          const compileOpts = db.pragma('compile_options');
          version = Array.isArray(compileOpts) ? (compileOpts[0]?.version ?? 'unknown') : 'unknown';
          connected = true;
        } catch (err) {
          throw new DatabaseAdapterError(
            `Failed to connect to SQLite: ${err instanceof Error ? err.message : String(err)}. Install better-sqlite3.`,
            'sqlite',
            err,
          );
        }
      },

      async disconnect(): Promise<void> {
        if (db) {
          db.close();
          db = null;
        }
        connected = false;
      },

      async query<T>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
        if (!db || !connected) {
          throw new DatabaseAdapterError('SQLite adapter is not connected.', 'sqlite');
        }
        const startTime = Date.now();
        const stmt = db.prepare(sql);

        const isSelect = sql.trimStart().toUpperCase().startsWith('SELECT');
        if (isSelect) {
          const rows = stmt.all(...params) as T[];
          return { rows, rowCount: rows.length, duration: Date.now() - startTime };
        } else {
          const result = stmt.run(...params);
          return { rows: [] as T[], rowCount: (result as { changes: number }).changes ?? 0, duration: Date.now() - startTime };
        }
      },

      async transaction<T>(fn: (client: BaseDatabaseAdapter) => Promise<T>): Promise<T> {
        if (!db || !connected) {
          throw new DatabaseAdapterError('SQLite adapter is not connected.', 'sqlite');
        }
        // better-sqlite3 transaction() is synchronous, so we wrap the async fn
        return db.transaction(() => {
          const txClient = createTransactionClient('sqlite', db);
          return fn(txClient);
        })();
      },

      async migrate(migrations: MigrationStep[]): Promise<void> {
        if (!db || !connected) {
          throw new DatabaseAdapterError('SQLite adapter is not connected.', 'sqlite');
        }

        db.exec(`
          CREATE TABLE IF NOT EXISTS _schema_migrations (
            version TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT DEFAULT (datetime('now'))
          )
        `);

        const applied = db.prepare('SELECT version FROM _schema_migrations ORDER BY version').all() as Array<{ version: string }>;
        const appliedVersions = new Set(applied.map((r) => r.version));

        for (const migration of migrations) {
          if (appliedVersions.has(migration.version)) continue;

          try {
            db.transaction(() => {
              db.exec(migration.up);
              db.prepare('INSERT INTO _schema_migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name);
            });
          } catch (err) {
            throw new DatabaseAdapterError(
              `Migration "${migration.version}" failed on SQLite`,
              'sqlite',
              err,
            );
          }
        }
      },

      async healthCheck(): Promise<DatabaseHealth> {
        const startTime = Date.now();
        if (!db || !connected) {
          return { connected: false, latencyMs: 0, poolSize: 0, activeConnections: 0, version: '' };
        }
        try {
          db.prepare('SELECT 1').get();
          return {
            connected: true,
            latencyMs: Date.now() - startTime,
            poolSize: 1,
            activeConnections: 1,
            version,
          };
        } catch (err) {
          return {
            connected: false,
            latencyMs: Date.now() - startTime,
            poolSize: 0,
            activeConnections: 0,
            version,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    };
  }

  // ─── Private: Backup Helpers ────────────────────────────────────

  private async backupMySQL(adapter: BaseDatabaseAdapter): Promise<Buffer> {
    const tables = await adapter.query<{ TABLE_NAME: string }>(
      'SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE()',
    );

    const lines: string[] = [];
    lines.push('-- MySQL/MariaDB Backup');
    lines.push(`-- Generated: ${new Date().toISOString()}`);
    lines.push('');

    for (const table of tables.rows) {
      lines.push(`-- Table: ${table.TABLE_NAME}`);
      const createResult = await adapter.query<{ 'Create Table': string }>(
        `SHOW CREATE TABLE \`${table.TABLE_NAME}\``,
      );
      if (createResult.rows[0]) {
        lines.push(createResult.rows[0]['Create Table'] ?? '');
      }
      lines.push('');

      const rows = await adapter.query<Record<string, unknown>>(
        `SELECT * FROM \`${table.TABLE_NAME}\``,
      );
      lines.push(`-- ${rows.rowCount} rows`);
      lines.push('');
    }

    return Buffer.from(lines.join('\n'), 'utf-8');
  }

  private async backupSQL(adapter: BaseDatabaseAdapter): Promise<Buffer> {
    const lines: string[] = [];
    lines.push(`-- ${adapter.type.toUpperCase()} Backup`);
    lines.push(`-- Generated: ${new Date().toISOString()}`);
    lines.push('');

    const tables = await adapter.query<{ table_name: string }>(
      adapter.type === 'postgresql'
        ? "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
        : "SELECT name AS table_name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    );

    for (const table of tables.rows) {
      const tableName = table.table_name;
      lines.push(`-- Table: ${tableName}`);
      lines.push('');

      try {
        const rows = await adapter.query<Record<string, unknown>>(
          `SELECT * FROM "${tableName}"`,
        );
        lines.push(`-- ${rows.rowCount} rows`);
      } catch {
        lines.push(`-- Could not dump table: ${tableName}`);
      }
      lines.push('');
    }

    return Buffer.from(lines.join('\n'), 'utf-8');
  }
}

// ─── Shared Helpers ─────────────────────────────────────────────────

function createTransactionClient(
  dbType: DatabaseType,
  connection: any,
): BaseDatabaseAdapter {
  return {
    type: dbType,

    pool: {
      getSize: () => 0,
      getActive: () => 0,
      getIdle: () => 0,
    },

    async connect(): Promise<void> {
      throw new DatabaseAdapterError('Transaction client cannot connect.', dbType);
    },

    async disconnect(): Promise<void> {
      throw new DatabaseAdapterError('Transaction client cannot disconnect.', dbType);
    },

    async query<T>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
      const startTime = Date.now();
      const result = await connection.query(sql, params);
      const rows = (result.rows ?? result) as T[];
      return {
        rows,
        rowCount: rows.length,
        duration: Date.now() - startTime,
      };
    },

    async transaction<T>(fn: (client: BaseDatabaseAdapter) => Promise<T>): Promise<T> {
      return fn(createTransactionClient(dbType, connection));
    },

    async migrate(): Promise<void> {
      throw new DatabaseAdapterError('Cannot run migrations inside a transaction.', dbType);
    },

    async healthCheck(): Promise<DatabaseHealth> {
      return {
        connected: true,
        latencyMs: 0,
        poolSize: 0,
        activeConnections: 1,
        version: '',
      };
    },
  };
}

function parseDatabaseUrl(
  url: string,
): { type: DatabaseType; config: DatabaseConfig | null } {
  try {
    if (url.startsWith('file:')) {
      return {
        type: 'sqlite',
        config: {
          type: 'sqlite',
          url: url.slice(5),
          database: url.slice(5),
        },
      };
    }

    const parsed = new URL(url);

    if (parsed.protocol === 'postgresql:' || parsed.protocol === 'postgres:') {
      return {
        type: 'postgresql',
        config: {
          type: 'postgresql',
          host: parsed.hostname,
          port: parseInt(parsed.port || '5432', 10),
          database: parsed.pathname.slice(1),
          user: decodeURIComponent(parsed.username),
          password: decodeURIComponent(parsed.password),
          ssl: parsed.searchParams.get('sslmode') === 'require',
        },
      };
    }

    if (parsed.protocol === 'mysql:') {
      return {
        type: 'mysql',
        config: {
          type: 'mysql',
          host: parsed.hostname,
          port: parseInt(parsed.port || '3306', 10),
          database: parsed.pathname.slice(1),
          user: decodeURIComponent(parsed.username),
          password: decodeURIComponent(parsed.password),
          ssl: parsed.searchParams.get('ssl') === 'true',
        },
      };
    }

    return { type: 'sqlite', config: null };
  } catch {
    return { type: 'sqlite', config: null };
  }
}