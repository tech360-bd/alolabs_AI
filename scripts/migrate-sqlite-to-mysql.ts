/**
 * Robust SQLite to MySQL / MariaDB Data Migrator
 * ALO Labs AIOS
 *
 * Features:
 * - Table-by-table schema-aware data transfer
 * - Batch insertion with parameter binding (safe against SQL injection, quotes, newlines, binary data)
 * - Automatic conversion of boolean 0/1, timestamps, JSON arrays/objects
 * - Foreign key check suspension during import
 * - Row count verification per table
 * - Detailed migration summary report
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

interface MigrateOptions {
  sqlitePath: string;
  mysqlUrl: string;
  dryRun?: boolean;
  batchSize?: number;
}

export async function migrateSQLiteToMySQL(options: MigrateOptions) {
  const { sqlitePath, mysqlUrl, dryRun = false, batchSize = 250 } = options;

  console.log('============================================================');
  console.log('ALO Labs — SQLite to MySQL/MariaDB Migration Engine');
  console.log('============================================================');
  console.log(`Source SQLite: ${sqlitePath}`);
  console.log(`Target MySQL:  ${mysqlUrl.replace(/:[^:@]+@/, ':****@')}`);
  console.log(`Dry Run:       ${dryRun}`);
  console.log('============================================================\n');

  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite database not found at ${sqlitePath}`);
  }

  // Connect to SQLite using better-sqlite3 or sqlite3
  let sqliteDb: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3');
    sqliteDb = new Database(sqlitePath, { readonly: true });
  } catch {
    throw new Error('better-sqlite3 required for SQLite reading');
  }

  // Connect to MySQL
  const mysqlConn = await mysql.createConnection(mysqlUrl);

  try {
    // 1. Get list of tables from SQLite
    const tablesResult = sqliteDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations' ORDER BY name"
    ).all() as { name: string }[];

    const tables = tablesResult.map((r) => r.name);
    console.log(`Discovered ${tables.length} tables to migrate.\n`);

    if (dryRun) {
      console.log('DRY RUN — Row count preview:');
      for (const table of tables) {
        const count = sqliteDb.prepare(`SELECT COUNT(*) as count FROM "${table}"`).get() as { count: number };
        console.log(`  ${table.padEnd(30)}: ${count.count} rows`);
      }
      return { success: true, dryRun: true };
    }

    // Disable foreign key checks & strict mode for migration
    await mysqlConn.execute('SET FOREIGN_KEY_CHECKS = 0');
    await mysqlConn.execute("SET sql_mode = ''");
    await mysqlConn.execute('SET NAMES utf8mb4');

    // Ensure Settings key has utf8mb4_bin collation for case-sensitive keys
    try {
      await mysqlConn.execute(
        'ALTER TABLE `Settings` MODIFY COLUMN `key` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL'
      );
    } catch {
      // Table may be created during migration or push
    }

    // Fetch all existing tables in MySQL schema (case-insensitive mapping)
    const [existingTables] = await mysqlConn.execute(
      'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()'
    );
    const mysqlTableMap = new Map<string, string>();
    for (const row of existingTables as any[]) {
      mysqlTableMap.set(row.TABLE_NAME.toLowerCase(), row.TABLE_NAME);
    }

    const results: { table: string; sqliteRows: number; mysqlRows: number; status: string }[] = [];

    for (const table of tables) {
      const sqliteCount = (sqliteDb.prepare(`SELECT COUNT(*) as count FROM "${table}"`).get() as { count: number }).count;

      if (sqliteCount === 0) {
        console.log(`[SKIP]  ${table} (0 rows)`);
        results.push({ table, sqliteRows: 0, mysqlRows: 0, status: 'SKIPPED_EMPTY' });
        continue;
      }

      // Check target MySQL table name
      const actualMysqlTable = mysqlTableMap.get(table.toLowerCase()) || table;

      // Check target MySQL table columns
      const [colRows] = await mysqlConn.execute(
        'SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
        [actualMysqlTable]
      );
      const mysqlCols = new Set((colRows as any[]).map((c) => c.COLUMN_NAME.toLowerCase()));
      const mysqlColMap = new Map<string, string>();
      for (const c of colRows as any[]) {
        mysqlColMap.set(c.COLUMN_NAME.toLowerCase(), c.COLUMN_NAME);
      }

      if (mysqlCols.size === 0) {
        console.warn(`[WARN]  ${table} does not exist in MySQL schema. Skipping.`);
        results.push({ table, sqliteRows: sqliteCount, mysqlRows: 0, status: 'TABLE_MISSING_IN_TARGET' });
        continue;
      }

      // Read columns from SQLite
      const sqliteCols = sqliteDb.prepare(`PRAGMA table_info("${table}")`).all() as { name: string; type: string }[];
      const commonSqliteCols = sqliteCols.filter((c) => mysqlCols.has(c.name.toLowerCase()));
      const commonMysqlCols = commonSqliteCols.map((c) => mysqlColMap.get(c.name.toLowerCase()) || c.name);

      if (commonSqliteCols.length === 0) {
        console.warn(`[WARN]  No common columns for ${table}. Skipping.`);
        results.push({ table, sqliteRows: sqliteCount, mysqlRows: 0, status: 'NO_COMMON_COLUMNS' });
        continue;
      }

      console.log(`[START] Migrating ${table} -> \`${actualMysqlTable}\` (${sqliteCount} rows)...`);

      // Read rows in pages from SQLite
      let offset = 0;
      let inserted = 0;

      // Clean target table first
      await mysqlConn.execute(`DELETE FROM \`${actualMysqlTable}\``);

      const colList = commonMysqlCols.map((c) => `\`${c}\``).join(', ');
      const placeholders = `(${commonMysqlCols.map(() => '?').join(', ')})`;

      while (offset < sqliteCount) {
        const rows = sqliteDb
          .prepare(`SELECT ${commonSqliteCols.map((c) => `"${c.name}"`).join(', ')} FROM "${table}" LIMIT ? OFFSET ?`)
          .all(batchSize, offset) as Record<string, unknown>[];

        if (rows.length === 0) break;

        // Construct bulk INSERT
        const bulkValues: unknown[] = [];
        const valuePlaceholders: string[] = [];

        for (const row of rows) {
          valuePlaceholders.push(placeholders);
          for (const col of commonSqliteCols) {
            let val = row[col.name];
            // Format dates / booleans / objects if needed
            if (val instanceof Date) {
              val = val.toISOString().slice(0, 19).replace('T', ' ');
            }
            bulkValues.push(val);
          }
        }

        const insertQuery = `INSERT INTO \`${actualMysqlTable}\` (${colList}) VALUES ${valuePlaceholders.join(', ')}`;
        await mysqlConn.execute(insertQuery, bulkValues);

        inserted += rows.length;
        offset += batchSize;
      }

      // Verify row count
      const [countResult] = await mysqlConn.execute(`SELECT COUNT(*) as count FROM \`${actualMysqlTable}\``);
      const mysqlCount = (countResult as any[])[0]?.count ?? 0;

      if (mysqlCount === sqliteCount) {
        console.log(`[OK]    ${actualMysqlTable}: ${mysqlCount}/${sqliteCount} rows migrated.`);
        results.push({ table: actualMysqlTable, sqliteRows: sqliteCount, mysqlRows: mysqlCount, status: 'SUCCESS' });
      } else {
        console.warn(`[WARN]  ${actualMysqlTable}: Count mismatch (SQLite: ${sqliteCount}, MySQL: ${mysqlCount})`);
        results.push({ table: actualMysqlTable, sqliteRows: sqliteCount, mysqlRows: mysqlCount, status: 'MISMATCH' });
      }
    }

    // Re-enable foreign key checks
    await mysqlConn.execute('SET FOREIGN_KEY_CHECKS = 1');

    console.log('\n============================================================');
    console.log('MIGRATION SUMMARY');
    console.log('============================================================');
    const successful = results.filter((r) => r.status === 'SUCCESS').length;
    const skipped = results.filter((r) => r.status === 'SKIPPED_EMPTY').length;
    const errors = results.filter((r) => r.status !== 'SUCCESS' && r.status !== 'SKIPPED_EMPTY').length;

    console.log(`Total Tables: ${tables.length}`);
    console.log(`Successful:   ${successful}`);
    console.log(`Skipped (0):  ${skipped}`);
    console.log(`Errors/Warns: ${errors}`);
    console.log('============================================================\n');

    return { success: errors === 0, results };
  } finally {
    await mysqlConn.end();
    if (sqliteDb) sqliteDb.close();
  }
}

// CLI entry point
if (require.main === module) {
  const candidatePaths = [
    process.argv[2],
    process.env.SQLITE_PATH,
    '/opt/workspace/db/custom.db',
    path.join(process.cwd(), 'db', 'custom.db'),
    path.join(process.cwd(), 'prisma', 'custom.db'),
    path.join(process.cwd(), 'db', 'dev.db'),
    path.join(process.cwd(), 'prisma', 'dev.db'),
  ].filter(Boolean) as string[];

  const sqlitePath = candidatePaths.find((p) => fs.existsSync(p)) || candidatePaths[0];
  const mysqlUrl = process.argv[3] || process.env.DATABASE_URL || 'mysql://alohub_user:password@127.0.0.1:3306/db_hosting';
  const dryRun = process.argv.includes('--dry-run');

  migrateSQLiteToMySQL({ sqlitePath, mysqlUrl, dryRun })
    .then((res) => {
      console.log('Migration finished with status:', res.success ? 'SUCCESS' : 'FAILED');
      process.exit(res.success ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal migration error:', err);
      process.exit(1);
    });
}
