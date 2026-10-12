/**
 * Database Adapters — Public API
 * ALO Labs AIOS
 *
 * Re-exports all types, adapters, and the manager.
 */

// ─── Types ──────────────────────────────────────────────────────────
export type {
  DatabaseType,
  DatabaseConfig,
  DatabasePoolConfig,
  QueryResult,
  DatabaseHealth,
  MigrationStep,
  BaseDatabaseAdapter,
} from './types';

export {
  DatabaseAdapterError,
  DatabaseConnectionError,
  MigrationError,
} from './types';

// ─── Adapters ───────────────────────────────────────────────────────
export { MySQLAdapter } from './mysql-adapter';

// ─── Manager ────────────────────────────────────────────────────────
export { DatabaseManager } from './manager';