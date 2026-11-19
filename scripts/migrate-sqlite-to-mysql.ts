/** Read-only source inventory, not a production importer. A target is never opened. */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

interface MigrateOptions {
  sqlitePath: string;
  dryRun?: boolean;
  allowOverwrite?: boolean;
  /** Compatibility with existing callers; previews do not connect to a target or insert batches. */
  mysqlUrl?: string;
  batchSize?: number;
}
export async function migrateSQLiteToMySQL({ sqlitePath, dryRun = true, allowOverwrite = false }: MigrateOptions) {
  if (!dryRun || allowOverwrite) throw new Error('Legacy SQLite→MySQL apply is disabled: the old importer was destructive and non-transactional.');
  if (!existsSync(sqlitePath)) throw new Error('SQLite source file does not exist. Supply an explicit read-only source.');
  const source = new DatabaseSync(sqlitePath, { readOnly: true });
  try {
    const rows = source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations' ORDER BY name").all();
    const tables = rows.map(({ name }) => {
      const table = String(name), identifier = '"' + table.replaceAll('"', '""') + '"';
      return { table, rows: Number(source.prepare(`SELECT count(*) AS n FROM ${identifier}`).get()?.n) };
    });
    return { success: true, dryRun: true, tables };
  } finally { source.close(); }
}
if (require.main === module) {
  const args = process.argv.slice(2);
  const sqlitePath = args.find(x => !x.startsWith('--')) || process.env.SQLITE_PATH || '';
  migrateSQLiteToMySQL({ sqlitePath, dryRun: !args.includes('--apply'), allowOverwrite: args.includes('--allow-overwrite') })
    .then(report => { console.log('Read-only SQLite preview. No MySQL connection or writes.'); console.table(report.tables); })
    .catch(err => { console.error(err.message); process.exitCode = 1; });
}
