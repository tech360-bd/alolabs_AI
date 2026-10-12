/**
 * Database Adapter Type Definitions
 * ALO Labs AIOS — Unified types for multi-database support.
 */

// ─── Database Types ─────────────────────────────────────────────────

export type DatabaseType = 'sqlite' | 'postgresql' | 'mysql' | 'mariadb';

export interface DatabasePoolConfig {
  min: number;
  max: number;
}

export interface DatabaseConfig {
  type: DatabaseType;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean;
  pool?: DatabasePoolConfig;
  /** Full connection string (takes precedence over individual fields) */
  url?: string;
}

// ─── Query Results ──────────────────────────────────────────────────

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
  duration: number;
}

// ─── Health ─────────────────────────────────────────────────────────

export interface DatabaseHealth {
  connected: boolean;
  latencyMs: number;
  poolSize: number;
  activeConnections: number;
  version: string;
  error?: string;
}

// ─── Migrations ─────────────────────────────────────────────────────

export interface MigrationStep {
  version: string;
  name: string;
  up: string;
  down: string;
  appliedAt?: Date;
}

// ─── Base Adapter Interface ─────────────────────────────────────────

export interface BaseDatabaseAdapter {
  readonly type: DatabaseType;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query<T>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  transaction<T>(fn: (client: BaseDatabaseAdapter) => Promise<T>): Promise<T>;
  migrate(migrations: MigrationStep[]): Promise<void>;
  healthCheck(): Promise<DatabaseHealth>;
  pool: {
    getSize(): number;
    getActive(): number;
    getIdle(): number;
  };
}

// ─── Errors ─────────────────────────────────────────────────────────

export class DatabaseAdapterError extends Error {
  constructor(
    message: string,
    public readonly dbType: DatabaseType,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DatabaseAdapterError';
  }
}

export class DatabaseConnectionError extends DatabaseAdapterError {
  constructor(dbType: DatabaseType, cause?: unknown) {
    super(`Failed to connect to ${dbType} database`, dbType, cause);
    this.name = 'DatabaseConnectionError';
  }
}

export class MigrationError extends DatabaseAdapterError {
  constructor(dbType: DatabaseType, version: string, cause?: unknown) {
    super(`Migration "${version}" failed on ${dbType}`, dbType, cause);
    this.name = 'MigrationError';
  }
}