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
});
