/**
 * Backup sources and replay targets.
 *
 * Reads DATABASE_URL and produces a driver-backed source that streams real
 * schema + row data. Drivers are loaded lazily so the module is safe to import
 * in environments that only use one database.
 *
 * Failure policy: if the database cannot be reached, or the driver for the
 * configured engine is not installed, the error is surfaced verbatim. No
 * placeholder dump is ever produced.
 */

import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { SqlDialect, TableDump } from './dump';
import { insertStatement, quoteIdent } from './dump';

const requireFromHere = createRequire(join(process.cwd(), 'package.json'));

export interface TableMeta {
  name: string;
  schema: string | null;
  columns: string[];
}

export interface BackupSource {
  dialect: SqlDialect;
  database: string;
  sourceNote: string;
  listTables(): Promise<TableMeta[]>;
  readRows(table: TableMeta, offset: number, limit: number): Promise<unknown[][]>;
  close(): Promise<void>;
}

export interface ReplayTarget {
  dialect: SqlDialect;
  /** Execute one or more complete SQL statements. */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

interface ParsedUrl {
  dialect: SqlDialect;
  database: string;
  raw: string;
}

export function parseDatabaseUrl(url: string | undefined): ParsedUrl | null {
  if (!url) return null;
  if (url.startsWith('file:')) {
    const path = url.slice('file:'.length);
    return { dialect: 'sqlite', database: path, raw: url };
  }
  if (url.startsWith('mysql:') || url.startsWith('mariadb:')) {
    const parsed = new URL(url);
    return { dialect: 'mysql', database: parsed.pathname.replace(/^\//, ''), raw: url };
  }
  if (url.startsWith('postgresql:') || url.startsWith('postgres:')) {
    const parsed = new URL(url);
    return { dialect: 'postgresql', database: parsed.pathname.replace(/^\//, ''), raw: url };
  }
  return null;
}

/** Resolve a `file:` URL to an absolute-ish path usable by better-sqlite3. */
export function resolveSqlitePath(database: string): string {
  return database;
}

// ─── SQLite ────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

class SqliteBackupSource implements BackupSource {
  readonly dialect = 'sqlite' as const;
  readonly sourceNote: string;
  private db: any;

  constructor(readonly database: string) {
    let Database: any;
    try {
      Database = requireFromHere('better-sqlite3');
    } catch {
      throw new Error(
        'Configuration required: SQLite backups need the "better-sqlite3" driver (npm install better-sqlite3)',
      );
    }
    this.db = new Database(resolveSqlitePath(database), { readonly: true, fileMustExist: true });
    this.sourceNote = `sqlite:${database}`;
  }

  async listTables(): Promise<TableMeta[]> {
    const tables = this.db
      .prepare(
        "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Array<{ name: string; sql: string | null }>;

    return tables.map((table) => {
      const columns = (this.db.prepare(`PRAGMA table_info(${quoteIdent(table.name, 'sqlite')})`).all() as Array<{
        name: string;
      }>).map((column) => column.name);
      return { name: table.name, schema: table.sql ?? null, columns };
    });
  }

  async readRows(table: TableMeta, offset: number, limit: number): Promise<unknown[][]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM ${quoteIdent(table.name, 'sqlite')} LIMIT ? OFFSET ?`,
      )
      .raw(true)
      .all(limit, offset) as unknown[][];
    return rows;
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = null;
  }
}

// ─── MySQL ─────────────────────────────────────────────────────────────────

class MysqlBackupSource implements BackupSource {
  readonly dialect = 'mysql' as const;
  readonly sourceNote: string;
  private connection: any;

  constructor(readonly database: string, private readonly url: string) {
    let mysql: any;
    try {
      mysql = requireFromHere('mysql2/promise');
    } catch {
      throw new Error('Configuration required: MySQL backups need the "mysql2" driver');
    }
    this.connection = null;
    this.mysql = mysql;
    this.sourceNote = `mysql:${database}`;
  }

  private mysql: any;

  private async getConnection(): Promise<any> {
    if (!this.connection) {
      this.connection = await this.mysql.createConnection({ uri: this.url, multipleStatements: false });
    }
    return this.connection;
  }

  async listTables(): Promise<TableMeta[]> {
    const connection = await this.getConnection();
    const [tables] = await connection.query(
      'SELECT TABLE_NAME AS name FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = \'BASE TABLE\' ORDER BY TABLE_NAME',
    );
    const result: TableMeta[] = [];
    for (const table of tables as Array<{ name: string }>) {
      const [columns] = await connection.query(
        'SELECT COLUMN_NAME AS name FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
        [table.name],
      );
      const [create] = await connection.query(`SHOW CREATE TABLE ${quoteIdent(table.name, 'mysql')}`);
      const schema = (create as Array<Record<string, string>>)[0]?.['Create Table'] ?? null;
      result.push({
        name: table.name,
        schema,
        columns: (columns as Array<{ name: string }>).map((column) => column.name),
      });
    }
    return result;
  }

  async readRows(table: TableMeta, offset: number, limit: number): Promise<unknown[][]> {
    const connection = await this.getConnection();
    const [rows] = await connection.query(
      `SELECT * FROM ${quoteIdent(table.name, 'mysql')} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
    );
    return (rows as Array<Record<string, unknown>>).map((row) =>
      table.columns.map((column) => row[column]),
    );
  }

  async close(): Promise<void> {
    await this.connection?.end();
    this.connection = null;
  }
}

// ─── PostgreSQL ────────────────────────────────────────────────────────────

class PostgresBackupSource implements BackupSource {
  readonly dialect = 'postgresql' as const;
  readonly sourceNote: string;
  private client: any;
  private pg: any;

  constructor(readonly database: string, private readonly url: string) {
    try {
      this.pg = requireFromHere('pg');
    } catch {
      throw new Error('Configuration required: PostgreSQL backups need the "pg" driver');
    }
    this.sourceNote = `postgresql:${database}`;
  }

  private async getClient(): Promise<any> {
    if (!this.client) {
      this.client = new this.pg.Client({ connectionString: this.url });
      await this.client.connect();
    }
    return this.client;
  }

  async listTables(): Promise<TableMeta[]> {
    const client = await this.getClient();
    const tables = await client.query(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
    );
    const result: TableMeta[] = [];
    for (const table of tables.rows as Array<{ name: string }>) {
      const columns = await client.query(
        'SELECT column_name AS name FROM information_schema.columns WHERE table_schema = \'public\' AND table_name = $1 ORDER BY ordinal_position',
        [table.name],
      );
      result.push({
        name: table.name,
        schema: null,
        columns: (columns.rows as Array<{ name: string }>).map((column) => column.name),
      });
    }
    return result;
  }

  async readRows(table: TableMeta, offset: number, limit: number): Promise<unknown[][]> {
    const client = await this.getClient();
    const result = await client.query({
      text: `SELECT * FROM ${quoteIdent(table.name, 'postgresql')} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
      rowMode: 'array',
    });
    return result.rows as unknown[][];
  }

  async close(): Promise<void> {
    await this.client?.end();
    this.client = null;
  }
}

// ─── Factories ─────────────────────────────────────────────────────────────

export function createBackupSource(databaseUrl = process.env.DATABASE_URL): BackupSource {
  const parsed = parseDatabaseUrl(databaseUrl);
  if (!parsed) {
    throw new Error(
      'Configuration required: DATABASE_URL must be set to a file:, mysql: or postgresql: URL to create a backup',
    );
  }
  switch (parsed.dialect) {
    case 'sqlite':
      return new SqliteBackupSource(parsed.database);
    case 'mysql':
      return new MysqlBackupSource(parsed.database, parsed.raw);
    case 'postgresql':
      return new PostgresBackupSource(parsed.database, parsed.raw);
    default: {
      const exhaustive: never = parsed.dialect;
      throw new Error(`Unsupported database dialect: ${String(exhaustive)}`);
    }
  }
}

export class SqliteReplayTarget implements ReplayTarget {
  readonly dialect = 'sqlite' as const;
  private db: any;

  constructor(private readonly databasePath: string) {
    let Database: any;
    try {
      Database = requireFromHere('better-sqlite3');
    } catch {
      throw new Error('Configuration required: SQLite restore needs the "better-sqlite3" driver');
    }
    this.db = new Database(databasePath);
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = null;
  }
}

export class SqlReplayTarget implements ReplayTarget {
  private connection: any;

  constructor(readonly dialect: 'mysql' | 'postgresql', private readonly url: string) {}

  private async getConnection(): Promise<any> {
    if (this.connection) return this.connection;
    if (this.dialect === 'mysql') {
      const mysql = requireFromHere('mysql2/promise');
      this.connection = await mysql.createConnection({ uri: this.url, multipleStatements: true });
    } else {
      const pg = requireFromHere('pg');
      this.connection = new pg.Client({ connectionString: this.url });
      await this.connection.connect();
    }
    return this.connection;
  }

  async exec(sql: string): Promise<void> {
    const connection = await this.getConnection();
    await connection.query(sql);
  }

  async close(): Promise<void> {
    if (!this.connection) return;
    if (this.dialect === 'mysql') await this.connection.end();
    else await this.connection.end();
    this.connection = null;
  }
}

export function createReplayTarget(databaseUrl = process.env.DATABASE_URL): ReplayTarget {
  const parsed = parseDatabaseUrl(databaseUrl);
  if (!parsed) {
    throw new Error('Configuration required: DATABASE_URL must be set to replay a backup');
  }
  if (parsed.dialect === 'sqlite') return new SqliteReplayTarget(resolveSqlitePath(parsed.database));
  return new SqlReplayTarget(parsed.dialect, parsed.raw);
}

/**
 * Read a source table in batches and return the fully materialised table.
 * Used by the streaming writer; exported for tests.
 */
export async function readTable(source: BackupSource, table: TableMeta, batchSize = 500): Promise<TableDump> {
  const rows: unknown[][] = [];
  for (;;) {
    const batch = await source.readRows(table, rows.length, batchSize);
    if (batch.length === 0) break;
    rows.push(...batch);
    if (batch.length < batchSize) break;
  }
  return { name: table.name, schema: table.schema, columns: table.columns, rows };
}

/** Re-export for callers that only need the INSERT builder. */
export { insertStatement };
