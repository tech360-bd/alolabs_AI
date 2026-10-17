/**
 * Restorable SQL dump generation — pure functions, no I/O.
 *
 * The previous backup path (`DatabaseManager.backup`) emitted a schema
 * commentary file with row *counts* and no `INSERT` statements, so nothing it
 * produced could ever be restored. These helpers build a real logical dump:
 * a driver-independent representation of tables is rendered into portable SQL
 * that can be replayed.
 *
 * Supported dialects: SQLite, MySQL/MariaDB, PostgreSQL.
 */

export type SqlDialect = 'sqlite' | 'mysql' | 'postgresql';

export interface TableDump {
  /** Table name exactly as stored in the catalog. */
  name: string;
  /** `CREATE TABLE` statement when the source can provide one. */
  schema: string | null;
  /** Ordered column names, used for the INSERT column lists. */
  columns: string[];
  /** Row values in `columns` order. Values may be null/string/number/bigint/boolean/Date/Buffer. */
  rows: readonly (readonly unknown[])[];
}

export interface DumpMeta {
  dialect: SqlDialect;
  database: string;
  generatedAt?: Date;
  /** Optional human-readable source note (host, file path, adapter name). */
  source?: string;
}

export interface RenderedDump {
  sql: string;
  tables: number;
  rows: number;
  statements: number;
}

const IDENT_QUOTES: Record<SqlDialect, string> = {
  sqlite: '"',
  mysql: '`',
  postgresql: '"',
};

/** Quote an identifier, rejecting embedded quote characters. */
export function quoteIdent(name: string, dialect: SqlDialect): string {
  if (typeof name !== 'string' || name.length === 0) throw new Error('Identifier must be a non-empty string');
  if (name.includes('\0')) throw new Error('Identifier contains a NUL byte');
  const quote = IDENT_QUOTES[dialect];
  if (name.includes(quote)) throw new Error(`Identifier contains a reserved quote character: ${name}`);
  return `${quote}${name}${quote}`;
}

/**
 * Render a JavaScript value as a SQL literal for the target dialect.
 * Unknown objects are serialised as JSON rather than silently coerced.
 */
export function sqlLiteral(value: unknown, dialect: SqlDialect): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Cannot serialise a non-finite number');
    return String(value);
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'boolean') {
    if (dialect === 'postgresql') return value ? 'TRUE' : 'FALSE';
    return value ? '1' : '0';
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error('Cannot serialise an invalid Date');
    return quoteString(value.toISOString(), dialect);
  }
  if (value instanceof Uint8Array) {
    const hex = Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (dialect === 'sqlite') return `X'${hex}'`;
    if (dialect === 'mysql') return `0x${hex}`;
    return `decode('${hex}', 'hex')`;
  }
  if (typeof value === 'string') return quoteString(value, dialect);
  if (typeof value === 'object') return quoteString(JSON.stringify(value), dialect);
  throw new Error(`Unsupported SQL value type: ${typeof value}`);
}

/** Dialect-aware string literal quoting. */
export function quoteString(value: string, dialect: SqlDialect): string {
  if (value.includes('\0')) throw new Error('String value contains a NUL byte');
  if (dialect === 'mysql') {
    // MySQL treats backslash as an escape character unless
    // NO_BACKSLASH_ESCAPES is set, so escape it before the quote.
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
  }
  if (dialect === 'postgresql' && value.includes('\\')) {
    // E'' strings make backslash handling explicit; double any backslash.
    return `E'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
  }
  return `'${value.replace(/'/g, "''")}'`;
}

/** Build one multi-row INSERT (chunked by the caller). */
export function insertStatement(
  table: string,
  columns: readonly string[],
  rows: readonly (readonly unknown[])[],
  dialect: SqlDialect,
): string {
  if (columns.length === 0) throw new Error(`Table ${table} has no columns`);
  if (rows.length === 0) throw new Error('insertStatement requires at least one row');
  const columnList = columns.map((c) => quoteIdent(c, dialect)).join(', ');
  const values = rows
    .map((row) => {
      if (row.length !== columns.length) {
        throw new Error(`Row for ${table} has ${row.length} values, expected ${columns.length}`);
      }
      return `(${row.map((v) => sqlLiteral(v, dialect)).join(', ')})`;
    })
    .join(',\n  ');
  return `INSERT INTO ${quoteIdent(table, dialect)} (${columnList}) VALUES\n  ${values};`;
}

export const DEFAULT_INSERT_BATCH_SIZE = 100;

/** Render a complete, replayable dump. */
export function renderDump(
  tables: readonly TableDump[],
  meta: DumpMeta,
  options: { batchSize?: number } = {},
): RenderedDump {
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_INSERT_BATCH_SIZE);
  const generatedAt = meta.generatedAt ?? new Date();
  const lines: string[] = [];
  let statementCount = 0;
  let rowCount = 0;

  lines.push(`-- ALO Labs AgentOS logical backup`);
  lines.push(`-- Dialect: ${meta.dialect}`);
  lines.push(`-- Database: ${meta.database}`);
  if (meta.source) lines.push(`-- Source: ${meta.source}`);
  lines.push(`-- Generated: ${generatedAt.toISOString()}`);
  lines.push(`-- Generator: src/lib/backups/dump.ts`);
  lines.push('');
  lines.push(dialectPreamble(meta.dialect));
  lines.push('');

  for (const table of tables) {
    if (table.columns.length === 0) continue;
    lines.push(`-- ── Table: ${table.name} (${table.rows.length} rows) ──`);
    if (table.schema && table.schema.trim().length > 0) {
      lines.push(`${table.schema.trim().replace(/;+\s*$/, '')};`);
      statementCount += 1;
    }
    for (let i = 0; i < table.rows.length; i += batchSize) {
      const batch = table.rows.slice(i, i + batchSize);
      lines.push(insertStatement(table.name, table.columns, batch, meta.dialect));
      statementCount += 1;
      rowCount += batch.length;
    }
    lines.push('');
  }

  lines.push(`-- End of backup — ${tables.length} table(s), ${rowCount} row(s)`);
  return { sql: lines.join('\n'), tables: tables.length, rows: rowCount, statements: statementCount };
}

function dialectPreamble(dialect: SqlDialect): string {
  switch (dialect) {
    case 'sqlite':
      return 'PRAGMA foreign_keys = OFF;\nBEGIN TRANSACTION;';
    case 'mysql':
      return 'SET FOREIGN_KEY_CHECKS = 0;\nSET NAMES utf8mb4;';
    case 'postgresql':
      return 'SET statement_timeout = 0;\nSET client_encoding = \'UTF8\';';
    default: {
      const exhaustive: never = dialect;
      throw new Error(`Unsupported dialect: ${String(exhaustive)}`);
    }
  }
}

export interface DumpValidation {
  ok: boolean;
  tables: number;
  inserts: number;
  hasTransaction: boolean;
  errors: string[];
}

/**
 * Structural validation of a dump before it is staged or replayed. This is a
 * deliberately conservative check: it proves the file contains table
 * definitions and inserts, not that the SQL is semantically valid.
 */
export function validateDump(sql: string): DumpValidation {
  const errors: string[] = [];
  if (typeof sql !== 'string' || sql.trim().length === 0) {
    return { ok: false, tables: 0, inserts: 0, hasTransaction: false, errors: ['Dump is empty'] };
  }
  if (sql.includes('\0')) errors.push('Dump contains a NUL byte');
  const withoutComments = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

  const tables = new Set<string>();
  for (const match of withoutComments.matchAll(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([A-Za-z0-9_.]+)["`]?/gi,
  )) {
    tables.add(match[1]);
  }
  const inserts = [...withoutComments.matchAll(/INSERT\s+INTO\s+["`]?([A-Za-z0-9_.]+)["`]?/gi)].length;

  if (tables.size === 0 && inserts === 0) errors.push('Dump contains no CREATE TABLE or INSERT statements');
  if (sql.length > 512 * 1024 * 1024) errors.push('Dump exceeds the 512 MiB safety limit');

  return {
    ok: errors.length === 0,
    tables: tables.size,
    inserts,
    hasTransaction: /BEGIN\s+TRANSACTION/i.test(sql),
    errors,
  };
}

/** Drop statements used by an in-place restore (order-insensitive thanks to FK checks). */
export function dropStatements(tableNames: readonly string[], dialect: SqlDialect): string[] {
  return tableNames
    .filter((name) => name.length > 0 && !name.startsWith('sqlite_'))
    .map((name) => `DROP TABLE IF EXISTS ${quoteIdent(name, dialect)};`);
}
