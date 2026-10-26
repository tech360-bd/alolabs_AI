// @vitest-environment node
/**
 * MySQL/MariaDB compatibility — REAL database, no mocks.
 *
 * Runs against the MySQL service container that CI provides (free on
 * GitHub-hosted runners) when `MYSQL_TEST_URL` is set. When it is not set every
 * case reports SKIPPED with a reason, so a green run never implies MySQL was
 * verified.
 *
 * These are the behaviours that differ between SQLite and MySQL and that the
 * application depends on: transactions and rollback, autoincrement, boolean
 * round-tripping, DATE/DATETIME precision, JSON storage, UTF-8 (utf8mb4) text,
 * pagination with deterministic ordering, and concurrent writes.
 *
 * Local run:
 *   MYSQL_TEST_URL='mysql://root:root@127.0.0.1:3306/alolabs_test' \
 *     npx vitest run __tests__/integration/mysql-compatibility.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const TEST_URL = process.env.MYSQL_TEST_URL?.trim();
const run = !!TEST_URL;
const d = run ? describe : describe.skip;

if (!run) {
  // Reported once, loudly, rather than silently passing.
  console.warn(
    '[mysql-compatibility] SKIPPED — MYSQL_TEST_URL is not set. ' +
      'These cases verify real MySQL behaviour and did not run. CI sets this via ' +
      'the free `services: mysql` container in .github/workflows/mysql.yml.',
  );
}

// Loaded lazily so the suite can be collected without a MySQL driver present.
type Connection = {
  query: (sql: string, params?: unknown[]) => Promise<[unknown, unknown]>;
  execute: (sql: string, params?: unknown[]) => Promise<[unknown, unknown]>;
  beginTransaction: () => Promise<void>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
  end: () => Promise<void>;
};

let conn: Connection | null = null;
let serverVersion = '';

const TABLE = 'alo_compat_probe';

beforeAll(async () => {
  if (!run) return;
  const mysql = (await import('mysql2/promise')).default;
  conn = (await mysql.createConnection({
    uri: TEST_URL,
    multipleStatements: true,
  })) as unknown as Connection;
  const [rows] = await conn.query('SELECT VERSION() AS v');
  serverVersion = (rows as { v: string }[])[0].v;
  await conn.query(`DROP TABLE IF EXISTS \`${TABLE}\``);
  await conn.query(`
    CREATE TABLE \`${TABLE}\` (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(191) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      payload JSON NULL,
      note LONGTEXT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_name (name),
      KEY idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
});

afterAll(async () => {
  if (!conn) return;
  await conn.query(`DROP TABLE IF EXISTS \`${TABLE}\``).catch(() => undefined);
  await conn.end().catch(() => undefined);
  conn = null;
});

d('MySQL connectivity', () => {
  it('connects and reports a MySQL/MariaDB server version', () => {
    expect(serverVersion).toMatch(/\d+\.\d+/);
    expect(serverVersion).toMatch(/MariaDB/i.test(serverVersion) ? /MariaDB/i : /\d/);
  });

  it('uses utf8mb4 so 4-byte characters (emoji) survive a round trip', async () => {
    const emoji = '🚀 alo';
    await conn!.execute(`INSERT INTO \`${TABLE}\` (name) VALUES (?)`, [emoji]);
    const [rows] = await conn!.query(
      `SELECT name FROM \`${TABLE}\` WHERE name = ?`,
      [emoji],
    );
    expect((rows as { name: string }[])[0].name).toBe(emoji);
  });
});

d('MySQL write/read/update lifecycle', () => {
  it('assigns AUTO_INCREMENT primary keys', async () => {
    await conn!.execute(`INSERT INTO \`${TABLE}\` (name) VALUES (?)`, ['autoinc-a']);
    await conn!.execute(`INSERT INTO \`${TABLE}\` (name) VALUES (?)`, ['autoinc-b']);
    const [rows] = await conn!.query(
      `SELECT id FROM \`${TABLE}\` WHERE name IN ('autoinc-a','autoinc-b') ORDER BY id`,
    );
    const ids = (rows as { id: number }[]).map((r) => Number(r.id));
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBeGreaterThan(ids[0]);
  });

  it('enforces the UNIQUE constraint (SQLite and MySQL differ in error shape)', async () => {
    await conn!.execute(`INSERT INTO \`${TABLE}\` (name) VALUES (?)`, ['unique-once']);
    await expect(
      conn!.execute(`INSERT INTO \`${TABLE}\` (name) VALUES (?)`, ['unique-once']),
    ).rejects.toThrow(/duplicate/i);
  });

  it('round-trips booleans as TINYINT(1)', async () => {
    await conn!.execute(`INSERT INTO \`${TABLE}\` (name, is_active) VALUES (?, ?)`, [
      'bool-false',
      false,
    ]);
    const [rows] = await conn!.query(
      `SELECT is_active FROM \`${TABLE}\` WHERE name = 'bool-false'`,
    );
    const value = (rows as { is_active: number | boolean }[])[0].is_active;
    // mysql2 returns 0/1 for TINYINT(1) unless a type cast is configured; the
    // application must treat both shapes as falsy.
    expect(value === 0 || value === false).toBe(true);
  });

  it('stores and reads JSON columns as structured data', async () => {
    const payload = { skills: ['a', 'b'], nested: { n: 1 }, unicode: 'বাংলা' };
    await conn!.execute(`INSERT INTO \`${TABLE}\` (name, payload) VALUES (?, ?)`, [
      'json-row',
      JSON.stringify(payload),
    ]);
    const [rows] = await conn!.query(`SELECT payload FROM \`${TABLE}\` WHERE name = 'json-row'`);
    const raw = (rows as { payload: unknown }[])[0].payload;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    expect(parsed).toEqual(payload);
  });

  it('stores multi-megabyte text in LONGTEXT without truncation', async () => {
    const big = 'x'.repeat(2_000_000);
    await conn!.execute(`INSERT INTO \`${TABLE}\` (name, note) VALUES (?, ?)`, ['longtext-row', big]);
    const [rows] = await conn!.query(
      `SELECT CHAR_LENGTH(note) AS len FROM \`${TABLE}\` WHERE name = 'longtext-row'`,
    );
    expect(Number((rows as { len: number }[])[0].len)).toBe(big.length);
  });

  it('preserves millisecond precision on DATETIME(3)', async () => {
    const stamp = new Date('2026-03-04T05:06:07.891Z');
    await conn!.execute(`INSERT INTO \`${TABLE}\` (name, created_at) VALUES (?, ?)`, [
      'datetime-row',
      stamp,
    ]);
    const [rows] = await conn!.query(
      `SELECT created_at FROM \`${TABLE}\` WHERE name = 'datetime-row'`,
    );
    const stored = (rows as { created_at: Date | string }[])[0].created_at;
    const asDate = stored instanceof Date ? stored : new Date(stored);
    expect(asDate.toISOString()).toBe(stamp.toISOString());
  });

  it('updates and deletes rows', async () => {
    await conn!.execute(`INSERT INTO \`${TABLE}\` (name) VALUES (?)`, ['update-me']);
    await conn!.execute(`UPDATE \`${TABLE}\` SET is_active = 0 WHERE name = ?`, ['update-me']);
    const [after] = await conn!.query(
      `SELECT is_active FROM \`${TABLE}\` WHERE name = 'update-me'`,
    );
    expect(Number((after as { is_active: number }[])[0].is_active)).toBe(0);

    await conn!.execute(`DELETE FROM \`${TABLE}\` WHERE name = ?`, ['update-me']);
    const [gone] = await conn!.query(
      `SELECT COUNT(*) AS n FROM \`${TABLE}\` WHERE name = 'update-me'`,
    );
    expect(Number((gone as { n: number }[])[0].n)).toBe(0);
  });
});

d('MySQL transactions', () => {
  it('commits on success', async () => {
    await conn!.beginTransaction();
    await conn!.execute(`INSERT INTO \`${TABLE}\` (name) VALUES (?)`, ['tx-commit']);
    await conn!.commit();
    const [rows] = await conn!.query(
      `SELECT COUNT(*) AS n FROM \`${TABLE}\` WHERE name = 'tx-commit'`,
    );
    expect(Number((rows as { n: number }[])[0].n)).toBe(1);
  });

  it('rolls back completely on failure — no partial writes', async () => {
    await conn!.beginTransaction();
    await conn!.execute(`INSERT INTO \`${TABLE}\` (name) VALUES (?)`, ['tx-rollback']);
    await conn!.rollback();
    const [rows] = await conn!.query(
      `SELECT COUNT(*) AS n FROM \`${TABLE}\` WHERE name = 'tx-rollback'`,
    );
    expect(Number((rows as { n: number }[])[0].n)).toBe(0);
  });
});

d('MySQL query behaviour the application relies on', () => {
  it('paginates with deterministic ordering (LIMIT/OFFSET)', async () => {
    await conn!.execute(`DELETE FROM \`${TABLE}\` WHERE name LIKE 'page-%'`);
    for (let i = 0; i < 5; i++) {
      await conn!.execute(`INSERT INTO \`${TABLE}\` (name) VALUES (?)`, [`page-${i}`]);
    }
    const [rows] = await conn!.query(
      `SELECT name FROM \`${TABLE}\` WHERE name LIKE 'page-%' ORDER BY name ASC LIMIT 2 OFFSET 2`,
    );
    expect((rows as { name: string }[]).map((r) => r.name)).toEqual(['page-2', 'page-3']);
  });

  it('runs concurrent writes without losing rows (InnoDB row locking)', async () => {
    await conn!.execute(`DELETE FROM \`${TABLE}\` WHERE name LIKE 'conc-%'`);
    const writes = Array.from({ length: 10 }, (_, i) =>
      conn!.execute(`INSERT INTO \`${TABLE}\` (name) VALUES (?)`, [`conc-${i}`]),
    );
    await Promise.all(writes);
    const [rows] = await conn!.query(
      `SELECT COUNT(*) AS n FROM \`${TABLE}\` WHERE name LIKE 'conc-%'`,
    );
    expect(Number((rows as { n: number }[])[0].n)).toBe(10);
  });

  it('supports the aggregate/count queries used by /api/health', async () => {
    const [rows] = await conn!.query(
      `SELECT COUNT(*) AS n, COALESCE(SUM(CHAR_LENGTH(name)), 0) AS bytes FROM \`${TABLE}\``,
    );
    const row = (rows as { n: number; bytes: number }[])[0];
    expect(Number(row.n)).toBeGreaterThan(0);
    expect(Number(row.bytes)).toBeGreaterThan(0);
  });

  it('answers the exact readiness probe the app issues', async () => {
    const [rows] = await conn!.query('SELECT 1 as ok');
    expect(Number((rows as { ok: number }[])[0].ok)).toBe(1);
  });
});
