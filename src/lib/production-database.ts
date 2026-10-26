/**
 * Production datasource policy — the authoritative answer to "which database is
 * this process allowed to talk to?"
 *
 * WHY THIS EXISTS
 * ---------------
 * MySQL/MariaDB is mandatory in production. SQLite is a local development and
 * test convenience only: it is not an acceptable production datasource, not a
 * fallback, and not an alternative production mode.
 *
 * Before this module existed there were two ways for production to end up on
 * SQLite without anyone deciding that:
 *
 *   1. `DATABASE_URL=file:...` in the production environment. `new PrismaClient()`
 *      accepts it silently, and — because the default `prisma generate` reads
 *      the SQLite schema — the generated client matches, so nothing complains.
 *   2. `PRISMA_SQLITE_ADAPTER=1` left over from an engine-less sandbox build.
 *
 * Both are silent. This module makes both fail closed instead, with an error
 * that names the offending value and the fix.
 *
 * DESIGN CONSTRAINT — must not break `next build`
 * -----------------------------------------------
 * CI runs the production build with `NODE_ENV=production` and a throw-away
 * `DATABASE_URL=file:./ci.db`, and Next.js imports this module while collecting
 * page data. Throwing at *module load* would therefore break every build. The
 * policy is expressed as pure functions plus an explicit
 * {@link assertProductionDatasource} that server startup and the readiness
 * endpoint call, and that the client factory calls on first use.
 *
 * Nothing in this file touches the network or the filesystem, so it is safe to
 * import from any runtime and trivially unit-testable.
 */

/** Datasource providers this application recognises. */
export type DatasourceProvider = 'mysql' | 'mariadb' | 'sqlite' | 'postgresql' | 'unknown';

/** The provider(s) production is permitted to run on. */
export const PRODUCTION_ALLOWED_PROVIDERS = ['mysql', 'mariadb'] as const;

/** The Prisma schema that production must be generated from. */
export const PRODUCTION_PRISMA_SCHEMA = 'prisma/schema.mysql.prisma';

export interface ParsedDatasource {
  provider: DatasourceProvider;
  /** The raw URL, with any password redacted. Never log the raw value. */
  redactedUrl: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
}

/** True when this process is meant to be the production runtime. */
export function isProductionRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'production';
}

/**
 * Strip credentials from a connection URL so it is safe to put in a log line,
 * an error message, or an audit record.
 */
export function redactDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '****';
    if (parsed.username) parsed.username = parsed.username;
    return parsed.toString();
  } catch {
    // Not a URL (e.g. `file:./db/custom.db`) — strip anything that looks like
    // credentials rather than risk echoing them.
    return url.replace(/:([^:@/]+)@/, ':****@');
  }
}

/**
 * Classify a `DATABASE_URL`. Returns `unknown` rather than throwing so callers
 * can produce a precise diagnostic.
 */
export function parseDatasource(rawUrl: string | undefined | null): ParsedDatasource | null {
  const url = rawUrl?.trim();
  if (!url) return null;

  const redactedUrl = redactDatabaseUrl(url);

  // SQLite: `file:` (optionally `file://`), plus in-memory forms.
  if (/^file:/i.test(url) || url === ':memory:' || /\.sqlite3?$/i.test(url) || /\.db$/i.test(url)) {
    return { provider: 'sqlite', redactedUrl };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { provider: 'unknown', redactedUrl };
  }

  const protocol = parsed.protocol.replace(/:$/, '').toLowerCase();
  let provider: DatasourceProvider;
  let port: number | undefined;

  switch (protocol) {
    case 'mysql':
      provider = 'mysql';
      port = parsed.port ? Number(parsed.port) : 3306;
      break;
    case 'mariadb':
      provider = 'mariadb';
      port = parsed.port ? Number(parsed.port) : 3306;
      break;
    case 'postgresql':
    case 'postgres':
      provider = 'postgresql';
      port = parsed.port ? Number(parsed.port) : 5432;
      break;
    default:
      return { provider: 'unknown', redactedUrl };
  }

  return {
    provider,
    redactedUrl,
    host: parsed.hostname || undefined,
    port,
    database: parsed.pathname.replace(/^\//, '') || undefined,
    user: parsed.username ? decodeURIComponent(parsed.username) : undefined,
  };
}

/** True when the parsed datasource is MySQL or MariaDB. */
export function isMySqlCompatible(ds: ParsedDatasource | null): boolean {
  return ds?.provider === 'mysql' || ds?.provider === 'mariadb';
}

export interface DatasourcePolicyResult {
  ok: boolean;
  /** Machine-readable reason, safe to log. */
  reason: string;
  provider: DatasourceProvider | 'unset';
  redactedUrl: string;
}

/**
 * Evaluate the production datasource policy without throwing.
 *
 * The checks, in order:
 *  1. `DATABASE_URL` must be set.
 *  2. It must parse to a known provider.
 *  3. The provider must be MySQL or MariaDB.
 *  4. `PRISMA_SQLITE_ADAPTER` must not be enabled — it forces the better-sqlite3
 *     driver adapter regardless of the URL, which is how a SQLite client can
 *     otherwise survive into production unnoticed.
 *  5. It must not point at a local loopback-only file path (covered by 3).
 */
export function evaluateProductionDatasource(
  env: NodeJS.ProcessEnv = process.env,
): DatasourcePolicyResult {
  const raw = env.DATABASE_URL;
  const ds = parseDatasource(raw);

  if (!ds) {
    return {
      ok: false,
      provider: 'unset',
      redactedUrl: '',
      reason:
        'DATABASE_URL is not set. Production requires a MySQL connection string ' +
        'of the form mysql://USER:PASSWORD@HOST:3306/DATABASE.',
    };
  }

  if (ds.provider === 'unknown') {
    return {
      ok: false,
      provider: 'unknown',
      redactedUrl: ds.redactedUrl,
      reason:
        `DATABASE_URL (${ds.redactedUrl}) is not a recognised datasource. ` +
        'Production requires mysql:// or mariadb://.',
    };
  }

  if (env.PRISMA_SQLITE_ADAPTER === '1') {
    return {
      ok: false,
      provider: ds.provider,
      redactedUrl: ds.redactedUrl,
      reason:
        'PRISMA_SQLITE_ADAPTER=1 is set, which forces the SQLite driver adapter. ' +
        'SQLite is not permitted in production; unset it and generate the client ' +
        `from ${PRODUCTION_PRISMA_SCHEMA}.`,
    };
  }

  if (!isMySqlCompatible(ds)) {
    return {
      ok: false,
      provider: ds.provider,
      redactedUrl: ds.redactedUrl,
      reason:
        `Production datasource is "${ds.provider}" (${ds.redactedUrl}), but only ` +
        `MySQL/MariaDB is permitted. SQLite is not an acceptable production ` +
        `datasource or fallback. Set DATABASE_URL to a mysql:// connection string ` +
        `and generate the Prisma client from ${PRODUCTION_PRISMA_SCHEMA}.`,
    };
  }

  if (!ds.database) {
    return {
      ok: false,
      provider: ds.provider,
      redactedUrl: ds.redactedUrl,
      reason:
        `DATABASE_URL (${ds.redactedUrl}) does not name a database. ` +
        'Use mysql://USER:PASSWORD@HOST:3306/DATABASE.',
    };
  }

  return { ok: true, provider: ds.provider, redactedUrl: ds.redactedUrl, reason: 'ok' };
}

/**
 * Throw unless the production datasource policy is satisfied.
 *
 * Safe to call outside production — it returns immediately, so development and
 * tests keep working against SQLite.
 *
 * Deliberately throws rather than returning a value: every call site needs the
 * process or request to stop, and a returned boolean invites a caller to log a
 * warning and carry on with the wrong database.
 */
export function assertProductionDatasource(env: NodeJS.ProcessEnv = process.env): void {
  if (!isProductionRuntime(env)) return;

  const result = evaluateProductionDatasource(env);
  if (!result.ok) {
    throw new Error(
      `Refusing to start: ${result.reason}\n` +
        'See docs/PRODUCTION_MYSQL.md. SQLite is never an acceptable production ' +
        'datasource, and this process will not silently fall back to it.',
    );
  }
}

/**
 * Non-throwing variant for health/readiness endpoints, which must report
 * "not ready" rather than crash the request.
 */
export function productionDatasourceStatus(
  env: NodeJS.ProcessEnv = process.env,
): { enforced: boolean } & DatasourcePolicyResult {
  const enforced = isProductionRuntime(env);
  const result = evaluateProductionDatasource(env);
  // Outside production the policy is not enforced, so it cannot fail readiness.
  return { ...result, enforced, ok: enforced ? result.ok : true };
}
