// Fail closed. This is a deliberately small allowlist, NOT a general SQL parser.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const nullableColumn = /^ALTER\s+TABLE\s+`[A-Za-z_][A-Za-z0-9_]*`\s+ADD\s+COLUMN\s+`[A-Za-z_][A-Za-z0-9_]*`\s+(?:INT|BIGINT|TEXT|BOOLEAN|DATETIME|VARCHAR\([1-9][0-9]{0,3}\))\s+NULL$/i;
export function compatible(sql) {
  const statements = sql.trim().replace(/;$/, '').split(';');
  return statements.length > 0 && statements.every(s => nullableColumn.test(s.trim()));
}
async function check() {
  const require = createRequire(resolve('package.json'));
  const db = await require('mysql2/promise').createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await db.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM `_prisma_migrations`');
    const files = new Map();
    for (const d of readdirSync('prisma/migrations', {withFileTypes:true})) {
      const p = join('prisma/migrations',d.name,'migration.sql');
      if (d.isDirectory() && existsSync(p)) files.set(d.name,readFileSync(p));
    }
    for (const row of rows) {
      const sql=files.get(row.migration_name);
      if (!row.finished_at || row.rolled_back_at || !sql || createHash('sha256').update(sql).digest('hex') !== row.checksum) throw Error('Migration history needs review');
      files.delete(row.migration_name);
    }
    if (!files.size || ![...files.values()].every(buf=>compatible(buf.toString('utf8')))) throw Error('Pending SQL needs separate operator review');
  } finally { await db.end(); }
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  check().catch(()=>{console.error('Pending migration compatibility not established; automated migration refused');process.exitCode=1;});
}
