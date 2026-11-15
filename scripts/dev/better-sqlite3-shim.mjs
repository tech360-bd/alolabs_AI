/**
 * Sandbox-only compatibility shim: implements the small `better-sqlite3`
 * surface that `@prisma/adapter-better-sqlite3` uses, on top of Node's
 * built-in `node:sqlite` (available in Node >= 22.5).
 *
 * WHY THIS EXISTS
 * ---------------
 * `npm ci --ignore-scripts` cannot build the native `better-sqlite3` addon in
 * this sandbox (node-gyp needs to download Node headers and that host is not
 * reachable). Prisma's SQLite driver adapter only calls a handful of methods:
 *
 *   new Database(path, opts)   db.prepare(sql).bind(args).run()/all()/columns()/raw()
 *   db.exec(sql)               db.close()      db.defaultSafeIntegers(bool)
 *
 * This module provides exactly those, so DB-backed verification (workforce
 * provisioning, quota snapshots, routing decisions) can run here.
 *
 * IT IS NOT PRODUCTION CODE. It is only activated when
 * `SANDBOX_SQLITE_SHIM=1` is set (see `scripts/dev/with-sqlite-shim.mjs`) and
 * it is not imported by any application module.
 */

export interface StatementColumns {
  name: string;
  type: string | null;
}

function normaliseArgs(args: unknown[]): unknown[] {
  return args.map((value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'bigint') return Number(value);
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    return value as unknown;
  });
}

export class SandboxStatement {
  private bound: unknown[] = [];

  constructor(
    private readonly db: { prepare: (sql: string) => any },
    private readonly sql: string,
  ) {}

  bind(args: unknown[] | unknown): this {
    const list = Array.isArray(args) ? args : [args];
    this.bound = normaliseArgs(list);
    return this;
  }

  private prepared() {
    return this.db.prepare(this.sql);
  }

  get reader(): boolean {
    const statement = this.prepared();
    // node:sqlite does not expose `reader`; any statement whose SQL returns
    // rows has a `columns()` result with entries. Probing columns is safe for
    // non-SELECT statements (it returns []).
    try {
      return statement.columns().length > 0;
    } catch {
      return false;
    }
  }

  run(): { changes: number; lastInsertRowid: number } {
    const result = this.prepared().run(...(this.bound as never[]));
    return {
      changes: Number(result?.changes ?? 0),
      lastInsertRowid: Number(result?.lastInsertRowid ?? 0),
    };
  }

  all(): unknown[][] {
    return this.raw().all();
  }

  get(): unknown[] | undefined {
    return this.prepared().get(...(this.bound as never[])) as unknown[] | undefined;
  }

  columns(): StatementColumns[] {
    try {
      const columns = this.prepared().columns() as Array<{ name: string; type?: string | null; column?: string | null }>;
      return columns.map((column) => ({ name: column.name, type: column.type ?? null }));
    } catch {
      return [];
    }
  }

  raw(): { all: () => unknown[][]; get: () => unknown[] | undefined } {
    return {
      all: () => {
        const statement = this.prepared();
        const rows = statement.all(...(this.bound as never[])) as Array<Record<string, unknown>>;
        const order = statement.columns().map((column: { name: string }) => column.name);
        return rows.map((row) => order.map((name) => row[name] ?? null));
      },
      get: () => {
        const statement = this.prepared();
        const row = statement.get(...(this.bound as never[])) as Record<string, unknown> | undefined;
        if (!row) return undefined;
        const order = statement.columns().map((column: { name: string }) => column.name);
        return order.map((name) => row[name] ?? null);
      },
    };
  }
}

export class SandboxDatabase {
  private readonly db: any;
  private safeIntegers = false;

  constructor(path: string, options: { timeout?: number } = {}) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require('node:sqlite');
    this.db = new DatabaseSync(path);
    if (typeof options.timeout === 'number') {
      this.pragma(`busy_timeout = ${Math.max(0, Math.trunc(options.timeout))}`);
    }
  }

  prepare(sql: string): SandboxStatement {
    return new SandboxStatement(this.db, sql);
  }

  exec(sql: string): this {
    this.db.exec(sql);
    return this;
  }

  pragma(statement: string): unknown {
    try {
      return this.db.prepare(`PRAGMA ${statement}`).all();
    } catch {
      return undefined;
    }
  }

  defaultSafeIntegers(enabled = true): this {
    this.safeIntegers = enabled;
    return this;
  }

  transaction<T>(fn: (...args: never[]) => T): (...args: never[]) => T {
    return (...args: never[]) => {
      this.db.exec('BEGIN');
      try {
        const result = fn(...args);
        this.db.exec('COMMIT');
        return result;
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    };
  }

  close(): this {
    this.db.close();
    return this;
  }
}

export default SandboxDatabase;
