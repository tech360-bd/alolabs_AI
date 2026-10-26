import { PrismaClient } from '@prisma/client'
import {
  assertProductionDatasource,
  isMySqlCompatible,
  parseDatasource,
  redactDatabaseUrl,
} from './production-database'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * ALO Labs AgentOS — Prisma client singleton.
 *
 * PRODUCTION (mandatory): MySQL / MariaDB.
 *   The client is the standard library query engine, configured entirely
 *   through `DATABASE_URL` (`mysql://` or `mariadb://`), and must be generated
 *   from `prisma/schema.mysql.prisma`. A SQLite datasource is refused outright
 *   — see src/lib/production-database.ts.
 *
 * DEVELOPMENT / TEST: SQLite.
 *   `PRISMA_SQLITE_ADAPTER=1` selects the WASM query compiler with the
 *   better-sqlite3 driver adapter, so the app runs without downloading Prisma
 *   engine binaries. Requires a client generated with
 *   `engineType = "client"` (see scripts/dev-generate-client.sh).
 *
 * WHY THE CLIENT IS LAZY
 * ----------------------
 * `next build` runs with `NODE_ENV=production` and a throw-away SQLite
 * `DATABASE_URL` while Next.js collects page data, which imports this module.
 * Constructing — or asserting — at import time would break every build. The
 * exported `db` is therefore a thin proxy that resolves the real client on
 * first use, so the policy is enforced the moment anything actually touches
 * the database, and never before.
 *
 * SQLite INTEGRITY
 * ----------------
 * SQLite does NOT enforce declared foreign keys unless `PRAGMA foreign_keys =
 * ON` is issued on every connection, and the better-sqlite3 driver adapter does
 * not do that by itself. The adapter factory below is wrapped so every
 * connection enforces foreign keys, uses WAL journaling and waits (rather than
 * failing immediately) on a busy database. Without this, relation integrity
 * would silently depend on application code alone.
 */

const SQLITE_CONNECTION_PRAGMAS = [
  'PRAGMA foreign_keys = ON;',
  'PRAGMA busy_timeout = 5000;',
  'PRAGMA journal_mode = WAL;',
  'PRAGMA synchronous = NORMAL;',
].join('\n')

type AdapterFactoryLike = {
  provider: string
  adapterName: string
  connect: () => Promise<{ executeScript: (script: string) => Promise<void> }>
  connectToShadowDb?: () => Promise<{ executeScript: (script: string) => Promise<void> }>
}

/**
 * Wrap a Prisma driver-adapter factory so that every connection runs the
 * SQLite integrity pragmas before it is handed to the query compiler.
 */
export function withSqliteIntegrityPragmas<T extends AdapterFactoryLike>(factory: T): T {
  const wrapped: AdapterFactoryLike = {
    provider: factory.provider,
    adapterName: factory.adapterName,
    connect: async () => {
      const adapter = await factory.connect()
      await adapter.executeScript(SQLITE_CONNECTION_PRAGMAS)
      return adapter
    },
    ...(factory.connectToShadowDb
      ? {
          connectToShadowDb: async () => {
            const adapter = await factory.connectToShadowDb!()
            await adapter.executeScript(SQLITE_CONNECTION_PRAGMAS)
            return adapter
          },
        }
      : {}),
  }
  return wrapped as unknown as T
}

function createPrismaClient(): PrismaClient {
  // Fail closed before opening any connection: in production this throws
  // unless DATABASE_URL is MySQL/MariaDB and the SQLite adapter is off.
  assertProductionDatasource()

  const datasource = parseDatasource(process.env.DATABASE_URL)

  if (process.env.PRISMA_SQLITE_ADAPTER === '1') {
    // Lazy require so production (library engine) never loads the adapter.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaBetterSQLite3 } = require('@prisma/adapter-better-sqlite3') as typeof import('@prisma/adapter-better-sqlite3')
    const url = process.env.DATABASE_URL ?? 'file:./db/custom.db'
    const adapter = withSqliteIntegrityPragmas(new PrismaBetterSQLite3({ url }))
    return new PrismaClient({
      log: ['error'],
      adapter,
    })
  }

  // Production path. Prisma's own MySQL connection limit is deliberately left
  // at its default; the pool is sized by connection_limit in DATABASE_URL so
  // that it is visible in the deployment configuration rather than hidden here.
  if (isMySqlCompatible(datasource)) {
    return new PrismaClient({
      log: ['error'],
    })
  }

  // Development on SQLite via the library engine (no driver adapter).
  return new PrismaClient({
    log: ['error'],
  })
}

function resolveClient(): PrismaClient {
  const cached = globalForPrisma.prisma
  if (cached) return cached

  const client = createPrismaClient()
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = client
  return client
}

/**
 * The application's Prisma client.
 *
 * Behaves exactly like a `PrismaClient` instance, but defers construction (and
 * therefore the production datasource assertion) until the first property is
 * touched. Cached after first resolution, so the proxy is not on the hot path
 * for repeated property reads on a warm process.
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    return Reflect.get(resolveClient(), property, receiver)
  },
  has(_target, property) {
    return Reflect.has(resolveClient(), property)
  },
  getPrototypeOf() {
    return Reflect.getPrototypeOf(resolveClient())
  },
})

/**
 * Describe the datasource this process is configured for, for logging and
 * health output. Never includes credentials.
 */
export function describeDatasource(): { provider: string; redactedUrl: string } {
  const datasource = parseDatasource(process.env.DATABASE_URL)
  return {
    provider: datasource?.provider ?? 'unset',
    redactedUrl: datasource?.redactedUrl ?? redactDatabaseUrl(process.env.DATABASE_URL ?? ''),
  }
}
