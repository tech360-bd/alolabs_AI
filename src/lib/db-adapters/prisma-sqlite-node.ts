/**
 * Prisma driver adapter over `node:sqlite` — zero native compilation.
 *
 * WHY THIS EXISTS
 * ---------------
 * The repository's offline path (`scripts/dev-generate-client.sh`) generates an
 * `engineType = "client"` Prisma client that runs on the WASM query compiler.
 * That client requires a *driver adapter*, and the only one the repository
 * shipped (`@prisma/adapter-better-sqlite3`) needs the `better-sqlite3` native
 * addon. When node-gyp cannot reach nodejs.org — no build toolchain, no
 * prebuilt binary, air-gapped CI, a locked-down sandbox — every DB-touching
 * test and the dev server are blocked by a dependency that is not actually
 * required: Node 22 already ships a synchronous SQLite driver in core.
 *
 * This adapter implements Prisma's `SqlDriverAdapter` contract directly on
 * `node:sqlite`, so the offline path needs no compiler at all.
 *
 * CONTRACT NOTES (why the shape below is what it is)
 * --------------------------------------------------
 *  - Prisma's query compiler speaks `$1, $2, …` positionals. `node:sqlite`
 *    binds either positionally (values as separate arguments) or by name. We
 *    pass the array spread as positional arguments, which keeps the compiler's
 *    ordering intact and avoids re-writing SQL.
 *  - Integers must arrive as BigInt (the compiler widens them itself), and
 *    `setReturnArrays(true)` gives us rows as arrays in column order — the
 *    exact shape `SqlResultSet.rows` requires. Reading them as objects would
 *    lose duplicate column names from JOINs.
 *  - `columnTypes` is derived from the *declared* SQLite column types when
 *    available, and inferred from values otherwise. This mirrors
 *    `@prisma/adapter-better-sqlite3`'s `getColumnTypes` so both adapters
 *    produce identical results for the same schema — meaning a test that passes
 *    on the native adapter also passes on the better-sqlite3 path used in CI.
 *  - Every connection is configured with the same integrity pragmas
 *    (`foreign_keys`, `busy_timeout`, WAL) that `src/lib/db.ts` applies to the
 *    better-sqlite3 adapter. Foreign-key enforcement must never depend on which
 *    adapter a process happened to load.
 *
 * Only sqlite is supported. Production is MySQL/MariaDB and never takes this
 * path — `src/lib/db.ts` still refuses a SQLite datasource in production.
 */

import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { DatabaseSync as DatabaseSyncType, StatementSync } from 'node:sqlite';

// Loaded through `createRequire` rather than a static ESM import so Vite's
// client/jsdom module graph never tries to bundle `node:sqlite` when a UI or
// unit test transitively imports `@/lib/db`.
const nodeRequire = createRequire(import.meta.url);
function loadDatabaseSync(): typeof DatabaseSyncType {
  const sqlite = nodeRequire('node:sqlite') as { DatabaseSync: typeof DatabaseSyncType };
  return sqlite.DatabaseSync;
}
import type {
  ArgType,
  ColumnType,
  SqlDriverAdapter,
  SqlDriverAdapterFactory,
  SqlMigrationAwareDriverAdapterFactory,
  SqlQuery,
  SqlQueryable,
  SqlResultSet,
  Transaction,
  TransactionOptions,
} from '@prisma/driver-adapter-utils';
import { ColumnTypeEnum } from '@prisma/driver-adapter-utils';
import { DriverAdapterError } from '@prisma/driver-adapter-utils';

// ─── Column-type mapping (identical to the better-sqlite3 adapter) ──────────

const { Int32, Int64, Float, Double, Numeric, Boolean, Text, Date: DateType, Time, DateTime, Json, Bytes } =
  ColumnTypeEnum;

function mapDeclaredType(declared: string | null): ColumnType | null {
  if (declared === null) return null;
  switch (declared.toUpperCase()) {
    case '':
      return null;
    case 'DECIMAL':
      return Numeric;
    case 'FLOAT':
      return Float;
    case 'DOUBLE':
    case 'DOUBLE PRECISION':
    case 'NUMERIC':
    case 'REAL':
      return Double;
    case 'TINYINT':
    case 'SMALLINT':
    case 'MEDIUMINT':
    case 'INT':
    case 'INTEGER':
    case 'SERIAL':
    case 'INT2':
      return Int32;
    case 'BIGINT':
    case 'UNSIGNED BIG INT':
    case 'INT8':
      return Int64;
    case 'DATETIME':
    case 'TIMESTAMP':
      return DateTime;
    case 'TIME':
      return Time;
    case 'DATE':
      return DateType;
    case 'TEXT':
    case 'CLOB':
    case 'CHARACTER':
    case 'VARCHAR':
    case 'VARYING CHARACTER':
    case 'NCHAR':
    case 'NATIVE CHARACTER':
    case 'NVARCHAR':
      return Text;
    case 'BLOB':
      return Bytes;
    case 'BOOLEAN':
      return Boolean;
    case 'JSONB':
      return Json;
    default:
      return null;
  }
}

function inferType(value: unknown): ColumnType {
  switch (typeof value) {
    case 'string':
      return Text;
    case 'bigint':
      return Int64;
    case 'boolean':
      return Boolean;
    case 'number':
      return Number.isInteger(value) ? Int32 : Double;
    case 'object':
      if (value instanceof Uint8Array || Buffer.isBuffer(value)) return Bytes;
      return Json;
    default:
      return Text;
  }
}

/** Declared types first; any unknown column falls back to its first non-null value. */
function resolveColumnTypes(declared: Array<string | null>, rows: unknown[][]): ColumnType[] {
  const types = declared.map(mapDeclaredType);
  for (let column = 0; column < types.length; column++) {
    if (types[column] !== null) continue;
    let inferred: ColumnType | null = null;
    for (const row of rows) {
      const value = row[column];
      if (value !== null && value !== undefined) {
        inferred = inferType(value);
        break;
      }
    }
    types[column] = inferred ?? Text;
  }
  return types as ColumnType[];
}

/**
 * Convert a bound value into something `node:sqlite` accepts.
 *
 * Mirrors `mapArg` in `@prisma/adapter-better-sqlite3` so both adapters write
 * byte-identical values for the same operation:
 *  - booleans  -> 1/0
 *  - DateTime  -> ISO-8601 text with an explicit `+00:00` offset (NOT an epoch
 *                 integer: the schema stores DATETIME columns and comparisons
 *                 in `findMany({ where: { createdAt: … } })` must sort correctly
 *                 against text literals written by `CURRENT_TIMESTAMP`)
 *  - Bytes     -> Uint8Array
 *  - numbers   -> as-is, bigints as-is
 */
function bindValue(value: unknown, argType?: ArgType): null | number | bigint | string | Uint8Array {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const scalar = argType?.scalarType;
  if (typeof value === 'string' && scalar === 'int') return Number.parseInt(value, 10);
  if (typeof value === 'string' && (scalar === 'float' || scalar === 'decimal')) return Number.parseFloat(value);
  if (typeof value === 'string' && scalar === 'bigint') return BigInt(value);
  if (typeof value === 'string' && scalar === 'datetime') value = new Date(value);
  if (value instanceof Date) return value.toISOString().replace('Z', '+00:00');
  if (Array.isArray(value) && scalar === 'bytes') return new Uint8Array(value as number[]);
  if (typeof value === 'string' && scalar === 'bytes') return new Uint8Array(Buffer.from(value, 'base64'));
  if (value instanceof Uint8Array || Buffer.isBuffer(value)) return new Uint8Array(value as Uint8Array);
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string') return value;
  return JSON.stringify(value);
}

/**
 * Normalise one result row into the value shapes Prisma's interpreter expects.
 *
 * SQLite has no boolean or date type, so the wire values are integers and text.
 * `node:sqlite` returns every integer as BigInt (we asked for that, to keep
 * 64-bit ids intact); the compiler then needs them as strings, booleans as real
 * booleans, and DateTime columns as ISO strings. This is the same transformation
 * the official adapter performs in `mapRow`, extended with the Boolean case
 * (Prisma's own adapter relies on the better-sqlite3 binding's type affinity,
 * which `node:sqlite` does not reproduce).
 */
function mapRowValues(row: unknown[], columnTypes: ColumnType[]): unknown[] {
  const result: unknown[] = new Array(row.length);
  for (let i = 0; i < row.length; i++) {
    const value = row[i];
    const type = columnTypes[i];
    if (value === null || value === undefined) {
      result[i] = null;
      continue;
    }
    if (value instanceof Uint8Array || Buffer.isBuffer(value) || value instanceof ArrayBuffer) {
      result[i] = Array.from(new Uint8Array(value as ArrayBuffer));
      continue;
    }
    if (typeof value === 'bigint') {
      if (type === DateTime) result[i] = new Date(Number(value)).toISOString();
      else if (type === Boolean) result[i] = value !== BigInt(0);
      else result[i] = value.toString();
      continue;
    }
    if (typeof value === 'number') {
      if (type === DateTime) result[i] = new Date(value).toISOString();
      else if (type === Boolean) result[i] = value !== 0;
      else if ((type === Int32 || type === Int64) && !Number.isInteger(value)) result[i] = Math.trunc(value);
      else result[i] = value;
      continue;
    }
    result[i] = value;
  }
  return result;
}

// ─── Error mapping ─────────────────────────────────────────────────────────

interface SqliteError extends Error {
  code?: string;
  errcode?: number;
  errstr?: string;
}

/**
 * Translate a SQLite error into Prisma's taxonomy.
 *
 * The important ones for this codebase: P2002 (unique) and P2003/P2011
 * (foreign key) must surface as constraint violations, because tests assert on
 * those codes and because a raw "UNIQUE constraint failed" string escaping to
 * an API client leaks schema internals.
 */
/** Wrap a mapped error in the class Prisma's interpreter recognises. */
function adapterError(mapped: Record<string, unknown>): NodeSqliteDriverAdapterError {
  return new NodeSqliteDriverAdapterError(mapped);
}

/** Thrown so Prisma's interpreter maps the error to P2002/P2003/… rather than propagating a raw string. */
class NodeSqliteDriverAdapterError extends DriverAdapterError {
  constructor(mapped: Record<string, unknown>) {
    super(mapped as never);
    this.name = 'DriverAdapterError';
  }
}

function toDriverError(error: unknown): never {
  const sqliteError = error as SqliteError;
  const message = typeof sqliteError?.message === 'string' ? sqliteError.message : String(error);
  const code = typeof sqliteError?.code === 'string' ? sqliteError.code : '';
  const original = { originalCode: code || null, originalMessage: message };

  const constraintFields = (): { fields: string[] } | undefined => {
    const after = message.split('constraint failed: ')[1];
    if (!after) return undefined;
    return { fields: after.split(',').map((field) => field.trim().split('.').pop() ?? field.trim()) };
  };

  if (code === 'SQLITE_BUSY' || /database is locked/i.test(message)) {
    throw adapterError({ ...original, kind: 'SocketTimeout' });
  }
  if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || /UNIQUE constraint failed/i.test(message)) {
    throw adapterError({ ...original, kind: 'UniqueConstraintViolation', constraint: constraintFields() });
  }
  if (code === 'SQLITE_CONSTRAINT_NOTNULL' || /NOT NULL constraint failed/i.test(message)) {
    throw adapterError({ ...original, kind: 'NullConstraintViolation', constraint: constraintFields() });
  }
  if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || /FOREIGN KEY constraint failed/i.test(message)) {
    throw adapterError({ ...original, kind: 'ForeignKeyConstraintViolation', constraint: { foreignKey: {} } });
  }
  if (message.startsWith('no such table')) {
    throw adapterError({ ...original, kind: 'TableDoesNotExist', table: message.split(': ')[1] });
  }
  if (message.startsWith('no such column') || message.includes('has no column named ')) {
    throw adapterError({ ...original, kind: 'ColumnNotFound', column: message.split(': ')[1] });
  }
  throw adapterError({ ...original, kind: 'GenericJs' });
}

function bindAll(query: SqlQuery): Array<null | number | bigint | string | Uint8Array> {
  return query.args.map((arg, index) => bindValue(arg, query.argTypes?.[index]));
}

// ─── Queryable ─────────────────────────────────────────────────────────────

class NodeSqliteQueryable implements SqlQueryable {
  readonly provider = 'sqlite' as const;
  readonly adapterName = 'node-sqlite-prisma-adapter';

  constructor(protected readonly db: DatabaseSyncType) {}

  async queryRaw(query: SqlQuery): Promise<SqlResultSet> {
    const { columnNames, declaredTypes, rows } = this.runRead(query);
    const columnTypes = resolveColumnTypes(declaredTypes, rows);
    return { columnNames, columnTypes, rows: rows.map((row) => mapRowValues(row, columnTypes)) };
  }

  async executeRaw(query: SqlQuery): Promise<number> {
    return this.runWrite(query);
  }

  protected runRead(query: SqlQuery): { columnNames: string[]; declaredTypes: Array<string | null>; rows: unknown[][] } {
    let statement: StatementSync | null = null;
    try {
      statement = this.db.prepare(query.sql);
      statement.setReturnArrays(true);
      statement.setReadBigInts(true);
      // A statement without a result set (`INSERT … RETURNING` is a reader;
      // plain `INSERT` is not) still has to execute for its side effect.
      const columns = statement.columns();
      if (columns.length === 0) {
        statement.run(...bindAll(query));
        return { columnNames: [], declaredTypes: [], rows: [] };
      }
      // setReturnArrays(true) makes rows positional arrays; the driver's own
      // types still say record-shaped, so go through `unknown`.
      const rows = statement.all(...bindAll(query)) as unknown as unknown[][];
      return {
        columnNames: columns.map((column) => column.name),
        declaredTypes: columns.map((column) => column.type ?? null),
        rows,
      };
    } catch (error) {
      toDriverError(error);
    } finally {
      statement?.setReturnArrays(false);
    }
    // Unreachable: `toDriverError` throws. Present so the function has a
    // defined return for the compiler, which cannot infer `never` through the
    // try/finally pair.
    throw new Error('unreachable: runRead did not return and did not throw');
  }

  protected runWrite(query: SqlQuery): number {
    try {
      const statement = this.db.prepare(query.sql);
      const result = statement.run(...bindAll(query));
      return Number(result.changes);
    } catch (error) {
      // `never`-returning; the throw below is for the compiler only.
      toDriverError(error);
    }
    throw new Error('unreachable: runWrite did not return and did not throw');
  }

  getConnectionInfo(): { supportsRelationJoins: boolean } {
    return { supportsRelationJoins: true };
  }
}

class NodeSqliteTransaction extends NodeSqliteQueryable implements Transaction {
  readonly options: TransactionOptions = { usePhantomQuery: false };

  constructor(db: DatabaseSyncType, private readonly release: () => void) {
    super(db);
  }

  async commit(): Promise<void> {
    // The driver adapter contract puts COMMIT/ROLLBACK on the *engine*, which
    // issues them as ordinary statements through this queryable. Releasing the
    // mutex here is all the adapter itself owns.
    this.release();
  }

  async rollback(): Promise<void> {
    this.release();
  }
}

/** Serialises transactions: one writer at a time, which is all SQLite allows. */
class Mutex {
  private tail: Promise<void> = Promise.resolve();

  acquire(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const current = this.tail;
    this.tail = current.then(() => next);
    return current.then(() => release);
  }
}

// ─── Integrity pragmas ─────────────────────────────────────────────────────

/**
 * Applied to every connection before it is handed to the query compiler.
 * Kept in sync with `SQLITE_CONNECTION_PRAGMAS` in `src/lib/db.ts` — SQLite does
 * not enforce declared foreign keys without this, so relation integrity would
 * otherwise depend on which adapter a process loaded.
 */
export const NODE_SQLITE_PRAGMAS = [
  'PRAGMA foreign_keys = ON;',
  'PRAGMA busy_timeout = 5000;',
  'PRAGMA journal_mode = WAL;',
  'PRAGMA synchronous = NORMAL;',
].join('\n');

function openDatabase(url: string): DatabaseSyncType {
  const path = url.replace(/^file:/, '');
  if (path && path !== ':memory:' && !path.startsWith('file::memory:')) {
    const dir = dirname(path);
    if (dir && dir !== '.') {
      mkdirSync(dir, { recursive: true });
    }
  }
  const DatabaseSync = loadDatabaseSync();
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: true });
  db.exec(NODE_SQLITE_PRAGMAS);
  return db;
}

// ─── Adapter + factory ─────────────────────────────────────────────────────

class NodeSqliteAdapter extends NodeSqliteQueryable implements SqlDriverAdapter {
  #mutex = new Mutex();

  constructor(db: DatabaseSyncType) {
    super(db);
  }

  async executeScript(script: string): Promise<void> {
    try {
      this.db.exec(script);
    } catch (error) {
      toDriverError(error);
    }
  }

  async startTransaction(isolationLevel?: string): Promise<Transaction> {
    if (isolationLevel && isolationLevel !== 'SERIALIZABLE') {
      throw Object.assign(new Error(`Unsupported isolation level: ${isolationLevel}`), {
        kind: 'InvalidIsolationLevel',
        level: isolationLevel,
      });
    }
    const release = await this.#mutex.acquire();
    try {
      this.db.exec('BEGIN');
    } catch (error) {
      release();
      toDriverError(error);
    }
    return new NodeSqliteTransaction(this.db, release);
  }

  async dispose(): Promise<void> {
    try {
      this.db.close();
    } catch {
      // Already closed by a previous dispose; nothing to release.
    }
  }
}

/**
 * Factory used by `src/lib/db.ts` when `PRISMA_SQLITE_ADAPTER=1`.
 *
 * Implements `SqlMigrationAwareDriverAdapterFactory` so it can be passed
 * wherever `PrismaBetterSQLite3` is, including future `prisma` CLI integration.
 */
export class PrismaNodeSqlite implements SqlMigrationAwareDriverAdapterFactory {
  readonly provider = 'sqlite' as const;
  readonly adapterName = 'node-sqlite-prisma-adapter';
  readonly #url: string;

  constructor(config: { url: string } | string) {
    this.#url = typeof config === 'string' ? config : config.url;
  }

  async connect(): Promise<SqlDriverAdapter> {
    return new NodeSqliteAdapter(openDatabase(this.#url));
  }

  async connectToShadowDb(): Promise<SqlDriverAdapter> {
    return new NodeSqliteAdapter(openDatabase(':memory:'));
  }
}

/** Type guard so `src/lib/db.ts` can prove the factory surface it relies on. */
export function isNodeSqliteAdapterFactory(value: unknown): value is SqlDriverAdapterFactory {
  return typeof value === 'object' && value !== null && 'connect' in value;
}
