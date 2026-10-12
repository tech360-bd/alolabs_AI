import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * ALO Labs AgentOS — Prisma client singleton.
 *
 * Production (default): the standard library query engine, configured entirely
 * through DATABASE_URL (MySQL in production, SQLite for local development).
 *
 * Engine-less environments (PRISMA_SQLITE_ADAPTER=1):
 * Uses the WASM query compiler with the better-sqlite3 driver adapter, so the
 * app runs without downloading Prisma engine binaries. Requires the client to
 * have been generated with `engineType = "client"` (see
 * scripts/dev-generate-client.sh) and `better-sqlite3` installed.
 *
 * Integrity: SQLite does NOT enforce declared foreign keys unless
 * `PRAGMA foreign_keys = ON` is issued on every connection, and the
 * better-sqlite3 driver adapter does not do that by itself. The adapter
 * factory below is wrapped so every connection it opens enforces foreign
 * keys, uses WAL journaling and waits (rather than failing immediately) on a
 * busy database. Without this, relation integrity would silently depend on
 * application code alone.
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
  return new PrismaClient({
    log: ['error'],
  })
}

export const db =
  globalForPrisma.prisma ??
  createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
