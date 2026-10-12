/**
 * Minimal ambient declaration for better-sqlite3.
 * The sandbox build of better-sqlite3 ships without bundled type declarations
 * and @types/better-sqlite3 cannot be fetched in this environment. Only the
 * surface used by @prisma/adapter-better-sqlite3 is declared.
 */
declare module 'better-sqlite3' {
  export interface Options {
    readonly?: boolean;
    fileMustExist?: boolean;
    timeout?: number;
    nativeBinding?: string;
    verbose?: (message: unknown, ...args: unknown[]) => void;
  }
  export interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }
  export interface Statement {
    run(...params: unknown[]): RunResult;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    iterate(...params: unknown[]): IterableIterator<unknown>;
    pluck(toggle?: boolean): Statement;
    raw(toggle?: boolean): Statement;
    bind(...params: unknown[]): Statement;
  }
  export class Database {
    constructor(filename?: string, options?: Options);
    prepare(source: string): Statement;
    exec(source: string): Database;
    pragma(source: string, options?: { simple?: boolean }): unknown;
    close(): void;
    readonly name: string;
    readonly open: boolean;
    readonly inTransaction: boolean;
  }
  export default Database;
}
