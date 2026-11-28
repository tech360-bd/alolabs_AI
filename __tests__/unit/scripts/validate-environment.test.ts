// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateEnvironment } = require('../../../scripts/validate-environment.cjs') as {
  validateEnvironment: (
    env: Record<string, string | undefined>,
    options?: { production?: boolean },
  ) => { ok: boolean; problems: string[]; production: boolean };
};

const validProdEnv = () => ({
  NODE_ENV: 'production',
  DATABASE_URL: 'mysql://agentos_app:StrongP4ssw0rd@127.0.0.1:3306/alolabs_prod?connection_limit=10',
  JWT_SECRET: 'a'.repeat(32) + '1',
  APP_SECRET: 'b'.repeat(32) + '2',
  ENCRYPTION_KEY: 'c'.repeat(32) + '3',
  CSRF_SECRET: 'd'.repeat(32) + '4',
  NEXT_PUBLIC_APP_URL: 'https://www.alolabs.net',
  ALLOWED_ORIGINS: 'https://www.alolabs.net,https://alolabs.net',
  PORT: '3011',
  APP_PORT: '3011',
  TRUST_PROXY: 'true',
});

describe('validate-environment.cjs', () => {
  it('accepts valid local SQLite configuration in development', () => {
    const res = validateEnvironment(
      { NODE_ENV: 'development', DATABASE_URL: 'file:./db/custom.db', PORT: '3011' },
      { production: false },
    );
    expect(res.ok).toBe(true);
    expect(res.problems).toEqual([]);
  });

  it('accepts valid MySQL and MariaDB production configurations', () => {
    expect(validateEnvironment(validProdEnv()).ok).toBe(true);
    expect(
      validateEnvironment({
        ...validProdEnv(),
        DATABASE_URL: 'mariadb://agentos_app:StrongP4ssw0rd@127.0.0.1:3306/alolabs_prod',
      }).ok,
    ).toBe(true);
  });

  it('rejects SQLite and PRISMA_SQLITE_ADAPTER=1 in production', () => {
    const res = validateEnvironment({
      ...validProdEnv(),
      DATABASE_URL: 'file:./db/custom.db',
      PRISMA_SQLITE_ADAPTER: '1',
    });
    expect(res.ok).toBe(false);
    expect(res.problems.some((p) => p.startsWith('DATABASE_URL:'))).toBe(true);
    expect(res.problems.some((p) => p.startsWith('PRISMA_SQLITE_ADAPTER:'))).toBe(true);
  });

  it('rejects missing, short, placeholder, or reused secrets without leaking values', () => {
    const secretVal = 'secret_value_should_never_leak_' + 'z'.repeat(16);
    const res = validateEnvironment({
      ...validProdEnv(),
      JWT_SECRET: secretVal,
      APP_SECRET: secretVal,
      ENCRYPTION_KEY: 'replace-with-key-' + 'x'.repeat(32),
      CSRF_SECRET: 'short',
    });
    expect(res.ok).toBe(false);
    expect(res.problems.some((p) => p.includes('APP_SECRET:') && p.includes('independent'))).toBe(true);
    expect(res.problems.some((p) => p.startsWith('ENCRYPTION_KEY:'))).toBe(true);
    expect(res.problems.some((p) => p.startsWith('CSRF_SECRET:'))).toBe(true);
    expect(res.problems.join('\n')).not.toContain(secretVal);
  });

  it('rejects insecure ALLOWED_ORIGINS, non-HTTPS app URL, bad PORT, and invalid TRUST_PROXY', () => {
    const res = validateEnvironment({
      ...validProdEnv(),
      NEXT_PUBLIC_APP_URL: 'http://www.alolabs.net',
      ALLOWED_ORIGINS: 'https://www.alolabs.net,*',
      PORT: '99999',
      TRUST_PROXY: 'maybe',
    });
    expect(res.ok).toBe(false);
    expect(res.problems.some((p) => p.startsWith('NEXT_PUBLIC_APP_URL:'))).toBe(true);
    expect(res.problems.some((p) => p.startsWith('ALLOWED_ORIGINS:'))).toBe(true);
    expect(res.problems.some((p) => p.startsWith('PORT:'))).toBe(true);
    expect(res.problems.some((p) => p.startsWith('TRUST_PROXY:'))).toBe(true);
  });
});
