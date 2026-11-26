import { PrismaClient } from '@prisma/client'
import { PrismaNodeSqlite } from './db-adapters/prisma-sqlite-node'
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

/**
 * Can the optional `better-sqlite3` native addon actually be loaded?
 *
 * `require('@prisma/adapter-better-sqlite3')` succeeds even when the addon is
 * missing — the binding is only resolved inside `connect()`. Probing the
 * module itself here would therefore pick the faster adapter and then fail at
 * first query. This loads the addon directly, once, and caches the answer, so
 * an air-gapped sandbox degrades to `node:sqlite` on the first call instead of
 * on the first request.
 */
let betterSqlite3Probe: boolean | undefined;

/**
 * The single default SQLite location, shared by every SQLite path here so an
 * unset `DATABASE_URL` and an explicit adapter choice cannot disagree.
 */
const DEFAULT_SQLITE_URL = 'file:./db/custom.db'

function betterSqlite3Available(): boolean {
  if (betterSqlite3Probe !== undefined) return betterSqlite3Probe;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3') as new (path: string) => { close(): void };
    const probe = new Database(':memory:');
    probe.close();
    betterSqlite3Probe = true;
  } catch {
    betterSqlite3Probe = false;
    console.warn(
      '[db] better-sqlite3 native addon unavailable; using the node:sqlite adapter ' +
        '(no native build required, same integrity pragmas).',
    );
  }
  return betterSqlite3Probe;
}

function createPrismaClient(): PrismaClient {
  // Fail closed before opening any connection: in production this throws
  // unless DATABASE_URL is MySQL/MariaDB and the SQLite adapter is off.
  assertProductionDatasource()

  const datasource = parseDatasource(process.env.DATABASE_URL)

  if (process.env.PRISMA_SQLITE_ADAPTER === '1') {
    const url = process.env.DATABASE_URL ?? DEFAULT_SQLITE_URL
    // Adapter selection, in order of preference:
    //   1. better-sqlite3  — the documented path; fastest, needs a native addon.
    //   2. node:sqlite     — Node 22 core driver; no compilation, same
    //                        integrity pragmas. Used automatically when the
    //                        native addon is unavailable (air-gapped sandbox, no
    //                        toolchain, a CI image without a prebuilt binding).
    //   3. engine default  — Prisma's own bundled engine, if one is present.
    // The fallback is logged once so an operator can tell which path is live;
    // it never silently downgrades foreign-key enforcement (both adapters run
    // the same pragmas).
    const preferNodeSqlite = process.env.PRISMA_SQLITE_DRIVER === 'node';
    if (!preferNodeSqlite && betterSqlite3Available()) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PrismaBetterSQLite3 } = require('@prisma/adapter-better-sqlite3') as typeof import('@prisma/adapter-better-sqlite3')
      const adapter = withSqliteIntegrityPragmas(new PrismaBetterSQLite3({ url }))
      return new PrismaClient({ log: ['error'], adapter })
    }
    return new PrismaClient({ log: ['error'], adapter: new PrismaNodeSqlite({ url }) })
  }

  // Production path. Prisma's own MySQL connection limit is deliberately left
  // at its default; the pool is sized by connection_limit in DATABASE_URL so
  // that it is visible in the deployment configuration rather than hidden here.
  if (isMySqlCompatible(datasource)) {
    return new PrismaClient({
      log: ['error'],
    })
  }

  // Development/test on SQLite without an explicit adapter selection.
  //
  // Prisma 6 client-only builds refuse to construct without a driver adapter
  // ("Missing configured driver adapter"), and a bare throw here is a landmine:
  // importing `@/lib/db` from any module in a test or a script fails, and the
  // stack points at Prisma rather than at the missing configuration. Two
  // behaviours, both honest:
  //
  //   · SQLite URL   → fall back to the node:sqlite adapter we ship, with one
  //                    loud warning telling the operator to set
  //                    PRISMA_SQLITE_ADAPTER=1 so the choice is deliberate.
  //   · non-SQLite   → keep Prisma's own engine, which is correct for a
  //                    server-backed datasource.
  //
  // The production datasource policy above has already refused this path when
  // it matters, so this cannot downgrade a production deployment.
  // An *unset* DATABASE_URL is handled by the same branch, deliberately. Every
  // other SQLite path in this file already defaults to DEFAULT_SQLITE_URL, so
  // leaving `datasource` null fell through to a bare `new PrismaClient()` —
  // which Prisma 6's client-only engine refuses ("Missing configured driver
  // adapter") and which then broke anything that merely imported `@/lib/db`
  // without a configured URL (scripts, tests, a fresh clone). A missing URL is
  // not a reason to hand the process a connection that cannot exist.
  //
  // This cannot weaken production: `assertProductionDatasource()` above has
  // already thrown unless DATABASE_URL is a real MySQL/MariaDB server URL, so
  // an unset URL never reaches this line in a production runtime.
  if (datasource === null || datasource.provider === 'sqlite') {
    const url = process.env.DATABASE_URL ?? DEFAULT_SQLITE_URL
    if (process.env.PRISMA_SQLITE_ADAPTER !== '1') {
      console.warn(
        '[db] PRISMA_SQLITE_ADAPTER is not set; using the node:sqlite adapter for a SQLite URL. ' +
          'Set PRISMA_SQLITE_ADAPTER=1 to make this explicit and silence this warning.',
      )
    }
    return new PrismaClient({ log: ['error'], adapter: new PrismaNodeSqlite({ url }) })
  }

  return new PrismaClient({
    log: ['error'],
  })
}

// Instrumentation, handlers and server components may be distinct module
// graphs in the same process. They must still share one connection pool.
function resolveClient(): PrismaClient {
  return globalForPrisma.prisma ??= createPrismaClient()
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
