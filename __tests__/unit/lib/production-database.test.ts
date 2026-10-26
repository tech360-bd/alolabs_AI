// @vitest-environment node
/**
 * The production datasource policy is a safety control, so its defaults are the
 * product: a wrong default silently puts production on SQLite. These cases pin
 * the fail-closed contract, including the two specific ways production used to
 * be able to end up on SQLite without anyone deciding that.
 */
import { describe, expect, it } from 'vitest';
import {
  assertProductionDatasource,
  evaluateProductionDatasource,
  isMySqlCompatible,
  isProductionRuntime,
  parseDatasource,
  productionDatasourceStatus,
  redactDatabaseUrl,
  PRODUCTION_PRISMA_SCHEMA,
} from '@/lib/production-database';

const MYSQL_URL = 'mysql://alo_user:s3cr3t@db.internal:3306/alolabs_prod';
const MARIADB_URL = 'mariadb://alo_user:s3cr3t@db.internal:3306/alolabs_prod';
const SQLITE_URL = 'file:/srv/alo-data/custom.db';

const prod = (over: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  DATABASE_URL: MYSQL_URL,
  ...over,
});

describe('parseDatasource', () => {
  it('classifies mysql and mariadb, defaulting the port to 3306', () => {
    expect(parseDatasource(MYSQL_URL)).toMatchObject({
      provider: 'mysql',
      host: 'db.internal',
      port: 3306,
      database: 'alolabs_prod',
      user: 'alo_user',
    });
    expect(parseDatasource(MARIADB_URL)?.provider).toBe('mariadb');
    expect(parseDatasource('mysql://u:p@h:3307/d')?.port).toBe(3307);
  });

  it('classifies sqlite file URLs and bare file paths', () => {
    expect(parseDatasource(SQLITE_URL)?.provider).toBe('sqlite');
    expect(parseDatasource('file:./db/custom.db')?.provider).toBe('sqlite');
    expect(parseDatasource('/srv/alo-data/custom.db')?.provider).toBe('sqlite');
    expect(parseDatasource(':memory:')?.provider).toBe('sqlite');
  });

  it('classifies postgresql and rejects unknown schemes rather than guessing', () => {
    expect(parseDatasource('postgresql://u:p@h:5432/d')?.provider).toBe('postgresql');
    expect(parseDatasource('postgres://u:p@h/d')?.provider).toBe('postgresql');
    expect(parseDatasource('mongodb://u:p@h/d')?.provider).toBe('unknown');
    expect(parseDatasource('not a url at all')?.provider).toBe('unknown');
  });

  it('returns null for unset or blank DATABASE_URL', () => {
    expect(parseDatasource(undefined)).toBeNull();
    expect(parseDatasource('')).toBeNull();
    expect(parseDatasource('   ')).toBeNull();
  });

  it('treats MySQL/MariaDB as the compatible providers', () => {
    expect(isMySqlCompatible(parseDatasource(MYSQL_URL))).toBe(true);
    expect(isMySqlCompatible(parseDatasource(MARIADB_URL))).toBe(true);
    expect(isMySqlCompatible(parseDatasource(SQLITE_URL))).toBe(false);
    expect(isMySqlCompatible(null)).toBe(false);
  });
});

describe('redactDatabaseUrl', () => {
  it('hides the password but keeps enough to identify the target', () => {
    const redacted = redactDatabaseUrl(MYSQL_URL);
    expect(redacted).not.toContain('s3cr3t');
    expect(redacted).toContain('db.internal');
    expect(redacted).toContain('alolabs_prod');
  });

  it('never leaks a password for any input shape', () => {
    for (const url of [
      MYSQL_URL,
      'mysql://alo_user:p@ss!word@db.internal:3306/d',
      'file:./db/custom.db',
      'garbage',
    ]) {
      expect(redactDatabaseUrl(url)).not.toContain('s3cr3t');
    }
  });
});

describe('evaluateProductionDatasource', () => {
  it('accepts a MySQL datasource', () => {
    const r = evaluateProductionDatasource(prod());
    expect(r.ok).toBe(true);
    expect(r.provider).toBe('mysql');
  });

  it('accepts MariaDB', () => {
    expect(evaluateProductionDatasource(prod({ DATABASE_URL: MARIADB_URL })).ok).toBe(true);
  });

  it('rejects a missing DATABASE_URL', () => {
    const r = evaluateProductionDatasource(prod({ DATABASE_URL: '' }));
    expect(r.ok).toBe(false);
    expect(r.provider).toBe('unset');
    expect(r.reason).toMatch(/DATABASE_URL is not set/);
  });

  it('rejects a SQLite datasource — SQLite is not a production fallback', () => {
    const r = evaluateProductionDatasource(prod({ DATABASE_URL: SQLITE_URL }));
    expect(r.ok).toBe(false);
    expect(r.provider).toBe('sqlite');
    expect(r.reason).toMatch(/SQLite is not an acceptable production/);
    expect(r.reason).toContain(PRODUCTION_PRISMA_SCHEMA);
  });

  it('rejects PostgreSQL, which is also not the mandated production provider', () => {
    const r = evaluateProductionDatasource(prod({ DATABASE_URL: 'postgresql://u:p@h:5432/d' }));
    expect(r.ok).toBe(false);
    expect(r.provider).toBe('postgresql');
  });

  it('rejects PRISMA_SQLITE_ADAPTER even when the URL is MySQL', () => {
    // This is the subtle case: the URL looks correct, but the driver adapter
    // override forces SQLite regardless, so the process would quietly use it.
    const r = evaluateProductionDatasource(prod({ PRISMA_SQLITE_ADAPTER: '1' }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/PRISMA_SQLITE_ADAPTER=1 is set/);
  });

  it('rejects a MySQL URL that names no database', () => {
    const r = evaluateProductionDatasource(prod({ DATABASE_URL: 'mysql://u:p@db.internal:3306' }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/does not name a database/);
  });

  it('rejects an unrecognised scheme', () => {
    const r = evaluateProductionDatasource(prod({ DATABASE_URL: 'mongodb://u:p@h/d' }));
    expect(r.ok).toBe(false);
    expect(r.provider).toBe('unknown');
  });

  it('never includes the password in a failure reason', () => {
    const r = evaluateProductionDatasource(prod({ DATABASE_URL: SQLITE_URL }));
    const withSecret = evaluateProductionDatasource(
      prod({ DATABASE_URL: 'mysql://u:topsecret@h:3306' }),
    );
    expect(r.reason).not.toContain('s3cr3t');
    expect(withSecret.reason).not.toContain('topsecret');
    expect(withSecret.redactedUrl).not.toContain('topsecret');
  });
});

describe('assertProductionDatasource', () => {
  it('throws in production on a SQLite datasource', () => {
    expect(() => assertProductionDatasource(prod({ DATABASE_URL: SQLITE_URL }))).toThrow(
      /Refusing to start/,
    );
  });

  it('throws in production on the SQLite driver-adapter override', () => {
    expect(() => assertProductionDatasource(prod({ PRISMA_SQLITE_ADAPTER: '1' }))).toThrow(
      /PRISMA_SQLITE_ADAPTER/,
    );
  });

  it('does not throw in production on MySQL', () => {
    expect(() => assertProductionDatasource(prod())).not.toThrow();
  });

  it('does not throw outside production, so development keeps working on SQLite', () => {
    for (const env of [
      { NODE_ENV: 'development', DATABASE_URL: SQLITE_URL },
      { NODE_ENV: 'test', DATABASE_URL: SQLITE_URL },
      { NODE_ENV: 'development', PRISMA_SQLITE_ADAPTER: '1', DATABASE_URL: SQLITE_URL },
    ]) {
      expect(() => assertProductionDatasource(env as NodeJS.ProcessEnv)).not.toThrow();
    }
  });

  it('names the offending value and the schema to generate from', () => {
    let message = '';
    try {
      assertProductionDatasource(prod({ DATABASE_URL: SQLITE_URL }));
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain('sqlite');
    expect(message).toContain(PRODUCTION_PRISMA_SCHEMA);
  });
});

describe('productionDatasourceStatus', () => {
  it('reports enforcement and the redacted URL for health output', () => {
    const s = productionDatasourceStatus(prod());
    expect(s.enforced).toBe(true);
    expect(s.ok).toBe(true);
    expect(s.provider).toBe('mysql');
    expect(s.redactedUrl).not.toContain('s3cr3t');
  });

  it('does not fail readiness outside production', () => {
    const s = productionDatasourceStatus({
      NODE_ENV: 'development',
      DATABASE_URL: SQLITE_URL,
    } as NodeJS.ProcessEnv);
    expect(s.enforced).toBe(false);
    expect(s.ok).toBe(true);
    // The underlying evaluation still reports the truth, for diagnostics.
    expect(s.provider).toBe('sqlite');
  });

  it('fails readiness in production on SQLite', () => {
    const s = productionDatasourceStatus(prod({ DATABASE_URL: SQLITE_URL }));
    expect(s.enforced).toBe(true);
    expect(s.ok).toBe(false);
  });
});

describe('isProductionRuntime', () => {
  it('keys off NODE_ENV only', () => {
    expect(isProductionRuntime({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isProductionRuntime({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(false);
    expect(isProductionRuntime({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toBe(false);
    expect(isProductionRuntime({} as NodeJS.ProcessEnv)).toBe(false);
  });
});
