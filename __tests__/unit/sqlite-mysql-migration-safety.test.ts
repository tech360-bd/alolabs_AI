// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrateSQLiteToMySQL } from '../../scripts/migrate-sqlite-to-mysql';

describe('legacy SQLite to MySQL importer safety guard', () => {
  it('refuses apply mode before opening any source or target database', async () => {
    await expect(migrateSQLiteToMySQL({
      sqlitePath: '/not-present/source.sqlite',
      mysqlUrl: 'mysql://invalid.invalid/db',
      dryRun: false,
    })).rejects.toThrow(/apply is disabled.*destructive and non-transactional/i);
  });
  it('previews the read-only source, even with quoted identifiers and no target', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'source-inventory-'));
    try {
      const sqlitePath = join(dir, 'source.sqlite');
      const source = new DatabaseSync(sqlitePath);
      try { source.exec('CREATE TABLE "demo""table" (n INTEGER); INSERT INTO "demo""table" VALUES (1), (2)'); }
      finally { source.close(); }
      const report = await migrateSQLiteToMySQL({ sqlitePath });
      expect(report.tables).toEqual([{ table: 'demo"table', rows: 2 }]);
      await expect(migrateSQLiteToMySQL({ sqlitePath, allowOverwrite: true })).rejects.toThrow('disabled');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
